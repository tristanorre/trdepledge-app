import { NextResponse } from "next/server";
import { requireApiAdmin, requireSupabase } from "@/lib/api-auth";
import { DAY_KEYS, mondayOfWeek, addDaysISO, type DayKey } from "@/lib/dates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_DAYS = new Set<string>(DAY_KEYS);

// GET /api/admin/roster?week_start=YYYY-MM-DD
//   Returns the roster grid for the given week. Auto-snaps to that week's
//   Monday so callers can pass any date and get consistent results.
export async function GET(req: Request) {
  const auth = await requireApiAdmin();
  if (auth instanceof NextResponse) return auth;

  const supabase = requireSupabase();
  if (supabase instanceof NextResponse) return supabase;

  const url = new URL(req.url);
  const reqWeek = url.searchParams.get("week_start");
  if (!reqWeek || !/^\d{4}-\d{2}-\d{2}$/.test(reqWeek)) {
    return NextResponse.json({ error: "week_start (YYYY-MM-DD) required" }, { status: 400 });
  }
  const week_start = mondayOfWeek(reqWeek);

  const { data, error } = await supabase
    .from("roster")
    .select("id, worker_id, week_start, days, start_time, end_time")
    .eq("week_start", week_start);

  if (error) {
    console.error("[admin/roster GET]", error);
    return NextResponse.json({ error: "Could not load roster" }, { status: 500 });
  }
  return NextResponse.json({ week_start, rows: data ?? [] });
}

// POST /api/admin/roster
//   Body: {
//     week_start,
//     rows: [{
//       worker_id,
//       days: string[],                     // legacy — derived from non-zero daily_hours
//       daily_hours?: Record<DayKey, number>, // paid hours per day, drives payroll
//       start_time?,
//       end_time?
//     }]
//   }
//   Upserts each roster row (one per worker per week) AND each
//   worker_paid_hours row (one per worker per date with hours > 0).
//   Days that drop out of daily_hours have their paid_hours row
//   deleted so a "remove from roster" actually erases payroll for
//   that date.
export async function POST(req: Request) {
  const auth = await requireApiAdmin();
  if (auth instanceof NextResponse) return auth;
  const { session } = auth;

  const supabase = requireSupabase();
  if (supabase instanceof NextResponse) return supabase;

  let body: { week_start?: unknown; rows?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const week_start = mondayOfWeek(String(body.week_start ?? ""));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(week_start)) {
    return NextResponse.json({ error: "week_start invalid" }, { status: 400 });
  }
  if (!Array.isArray(body.rows)) {
    return NextResponse.json({ error: "rows must be an array" }, { status: 400 });
  }

  const upserts: Array<{
    worker_id: string;
    week_start: string;
    days: string[];
    start_time: string | null;
    end_time: string | null;
  }> = [];

  // Per-(worker, date) paid hours: rows to upsert (hours > 0) and
  // (worker, date) pairs to delete (was previously rostered, now not).
  type PaidRow = { worker_id: string; work_date: string; hours: number; source: string; updated_by: string };
  const paidUpserts: PaidRow[] = [];
  const paidDeletes: Array<{ worker_id: string; work_date: string }> = [];

  for (const r of body.rows) {
    if (!r || typeof r !== "object") continue;
    const row = r as Record<string, unknown>;
    const worker_id = String(row.worker_id ?? "");
    if (!worker_id) continue;

    // Daily hours: validate each entry, build the paid_hours upsert
    // list + drop list. The `days` field on the roster row is then
    // *derived* from daily_hours rather than trusted from the client
    // payload — keeps the two in sync without a join.
    const dailyHoursRaw = (row.daily_hours && typeof row.daily_hours === "object")
      ? row.daily_hours as Record<string, unknown>
      : {};

    const daysWithHours: DayKey[] = [];
    for (const d of DAY_KEYS) {
      const raw = dailyHoursRaw[d];
      const n = typeof raw === "number" ? raw : parseFloat(String(raw ?? ""));
      const work_date = addDaysISO(week_start, DAY_KEYS.indexOf(d));
      if (Number.isFinite(n) && n > 0) {
        // Clamp at 24h to match the CHECK constraint on the table.
        const clamped = Math.min(24, Math.round(n * 100) / 100);
        paidUpserts.push({
          worker_id,
          work_date,
          hours: clamped,
          source: "roster",
          updated_by: session.user.id,
        });
        daysWithHours.push(d);
      } else {
        // Day not rostered → drop any previous row for that date.
        paidDeletes.push({ worker_id, work_date });
      }
    }

    // Fall back to the client-provided `days` array only if no
    // daily_hours were sent (lets older clients still set days
    // without hours, e.g. a future "availability only" picker).
    const clientDays = Array.isArray(row.days)
      ? row.days.filter((d): d is string => typeof d === "string" && VALID_DAYS.has(d))
      : [];
    const effectiveDays = daysWithHours.length > 0 ? daysWithHours : clientDays;

    const start_time = row.start_time ? String(row.start_time) : null;
    const end_time = row.end_time ? String(row.end_time) : null;

    upserts.push({ worker_id, week_start, days: effectiveDays, start_time, end_time });
  }

  if (upserts.length === 0) {
    return NextResponse.json({ error: "No rows to save" }, { status: 400 });
  }

  // 1. Upsert roster rows (one per worker per week).
  const { error: rosterErr } = await supabase
    .from("roster")
    .upsert(upserts, { onConflict: "worker_id,week_start" });
  if (rosterErr) {
    console.error("[admin/roster POST] roster", rosterErr);
    return NextResponse.json({ error: "Could not save roster" }, { status: 500 });
  }

  // 2. Upsert paid-hours rows for days that are rostered with hours > 0.
  if (paidUpserts.length > 0) {
    const { error: paidErr } = await supabase
      .from("worker_paid_hours")
      .upsert(paidUpserts, { onConflict: "worker_id,work_date" });
    if (paidErr) {
      console.error("[admin/roster POST] paid hours upsert", paidErr);
      return NextResponse.json({ error: "Could not save paid hours" }, { status: 500 });
    }
  }

  // 3. Delete paid-hours rows for days a worker is no longer rostered
  // for this week — only delete rows that were `source = 'roster'` so
  // we don't wipe a manual override from the payroll page.
  if (paidDeletes.length > 0) {
    // Postgrest doesn't support OR-of-composite-key in a single
    // request; loop and delete by (worker_id, work_date). Cheap —
    // at most 7 rows per worker per week.
    for (const d of paidDeletes) {
      await supabase
        .from("worker_paid_hours")
        .delete()
        .eq("worker_id", d.worker_id)
        .eq("work_date", d.work_date)
        .eq("source", "roster");
    }
  }

  // 4. Return the canonical roster shape so the UI can re-sync.
  const { data: refreshed } = await supabase
    .from("roster")
    .select("id, worker_id, week_start, days, start_time, end_time")
    .eq("week_start", week_start);

  return NextResponse.json({ rows: refreshed ?? [] });
}
