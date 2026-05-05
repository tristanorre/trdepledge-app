import { NextResponse } from "next/server";
import { requireApiAdmin, requireSupabase } from "@/lib/api-auth";
import { DAY_KEYS, mondayOfWeek } from "@/lib/dates";

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
//   Body: { week_start, rows: [{ worker_id, days: string[], start_time?, end_time? }] }
//   Upserts each row (one per worker per week — uniqueness enforced by DB).
//   Workers absent from `rows` are NOT touched — to clear a worker's
//   roster, send them with `days: []`.
export async function POST(req: Request) {
  const auth = await requireApiAdmin();
  if (auth instanceof NextResponse) return auth;

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

  for (const r of body.rows) {
    if (!r || typeof r !== "object") continue;
    const row = r as Record<string, unknown>;
    const worker_id = String(row.worker_id ?? "");
    if (!worker_id) continue;
    const days = Array.isArray(row.days)
      ? row.days.filter((d): d is string => typeof d === "string" && VALID_DAYS.has(d))
      : [];
    const start_time = row.start_time ? String(row.start_time) : null;
    const end_time = row.end_time ? String(row.end_time) : null;
    upserts.push({ worker_id, week_start, days, start_time, end_time });
  }

  if (upserts.length === 0) {
    return NextResponse.json({ error: "No rows to save" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("roster")
    .upsert(upserts, { onConflict: "worker_id,week_start" })
    .select("id, worker_id, week_start, days, start_time, end_time");

  if (error) {
    console.error("[admin/roster POST]", error);
    return NextResponse.json({ error: "Could not save roster" }, { status: 500 });
  }
  return NextResponse.json({ rows: data ?? [] });
}
