import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireApiWorker, requireSupabase } from "@/lib/api-auth";
import { ENTRY_TYPES, type EntryType } from "@/lib/timesheets";

export const runtime = "nodejs";

// POST /api/worker/timesheet/day
//   Body: {
//     work_date: "YYYY-MM-DD",
//     entry_type: EntryType,           // 'worked' | 'annual_leave' | ...
//     hours: number,                    // 0-24
//     worker_note?: string | null,
//     authorise: boolean                // false = save draft; true = sign off
//   }
//
// The current worker submits (or drafts) their entry for a given
// day. Idempotent — updating a same-day row overwrites hours/type.
//
// Rules:
//   * A worker cannot edit a day that admin has already approved.
//     They need to ask Thomas to reset it.
//   * Setting authorise=true stamps submitted_at (worker's sign-off).
//     Setting authorise=false (or omitting) leaves submitted_at as
//     was — so a draft edit doesn't reset a prior authorisation.
//   * Re-authorising = re-stamps submitted_at (fresh timestamp).
export async function POST(req: Request) {
  const auth = await requireApiWorker();
  if (auth instanceof NextResponse) return auth;
  const { session } = auth;

  const supabase = requireSupabase();
  if (supabase instanceof NextResponse) return supabase;

  let body: {
    work_date?: unknown;
    entry_type?: unknown;
    hours?: unknown;
    worker_note?: unknown;
    authorise?: unknown;
  };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const work_date = String(body.work_date ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(work_date)) {
    return NextResponse.json({ error: "work_date (YYYY-MM-DD) required" }, { status: 400 });
  }

  const entry_type_raw = String(body.entry_type ?? "");
  if (!(ENTRY_TYPES as readonly string[]).includes(entry_type_raw)) {
    return NextResponse.json({
      error: `entry_type must be one of: ${ENTRY_TYPES.join(", ")}`,
    }, { status: 400 });
  }
  const entry_type = entry_type_raw as EntryType;

  const hoursRaw = body.hours;
  const hoursNum = typeof hoursRaw === "number" ? hoursRaw : parseFloat(String(hoursRaw ?? ""));
  if (!Number.isFinite(hoursNum) || hoursNum < 0 || hoursNum > 24) {
    return NextResponse.json({ error: "hours must be 0-24" }, { status: 400 });
  }
  const hours = Math.round(hoursNum * 100) / 100;

  const worker_note = typeof body.worker_note === "string"
    ? body.worker_note.trim().slice(0, 500) || null
    : null;

  const authorise = body.authorise === true;

  // Reject edits to already-approved days.
  const { data: existing } = await supabase
    .from("daily_timesheets")
    .select("id, approved_at, submitted_at")
    .eq("worker_id", session.user.id)
    .eq("work_date", work_date)
    .maybeSingle();

  if (existing?.approved_at) {
    return NextResponse.json({
      error: "This day has already been approved. Ask Thomas to re-open it if you need to change hours.",
    }, { status: 409 });
  }

  const nowIso = new Date().toISOString();
  // submitted_at logic:
  //   authorise=true             → always set to now (re-authorising is OK)
  //   authorise=false + existing → preserve prior submitted_at
  //   authorise=false + no row   → null (still a draft)
  const submitted_at = authorise
    ? nowIso
    : (existing?.submitted_at ?? null);

  const row = {
    worker_id: session.user.id,
    work_date,
    entry_type,
    hours,
    worker_note,
    submitted_at,
  };

  const { error: upsertErr } = await supabase
    .from("daily_timesheets")
    .upsert(row, { onConflict: "worker_id,work_date" });
  if (upsertErr) {
    console.error("[worker/timesheet/day]", upsertErr);
    return NextResponse.json({ error: "Could not save timesheet entry" }, { status: 500 });
  }

  revalidatePath("/worker/hours");
  revalidatePath("/admin/hr/payroll");
  return NextResponse.json({ ok: true, work_date, submitted_at });
}
