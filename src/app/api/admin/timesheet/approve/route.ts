import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireApiAdmin, requireSupabase } from "@/lib/api-auth";
import { ENTRY_TYPES, LEAVE_BALANCE_COLUMN, PAID_ENTRY_TYPES, type EntryType } from "@/lib/timesheets";

export const runtime = "nodejs";

// POST /api/admin/timesheet/approve
//
// One of two payload shapes:
//   Per-day:  { worker_id, work_date, approved_hours?, approved_entry_type?, admin_note? }
//   Per-week: { worker_id, week_start, overrides?: [{ work_date, approved_hours?, approved_entry_type?, admin_note? }] }
//
// Per-day approves a single row. Per-week approves every AUTHORISED
// row for that worker in that Monday-based week, applying any
// overrides passed in.
//
// Side-effects on approval:
//   1. Bridges into `worker_paid_hours` (source='manual', hours =
//      approved_hours if the entry is a PAID type, else 0) so the
//      existing payroll CSV export keeps working.
//   2. Increments `leave_balances.{annual|sick|personal}_used` via
//      the atomic RPC when the approved type is a leave type.
//   3. Enqueues a Xero Payroll push (currently a log-only stub —
//      real API push slots in here once OAuth scope upgrade +
//      worker↔employee mapping are wired).

type PerDayInput = {
  worker_id: string;
  work_date: string;
  approved_hours?: number | null;
  approved_entry_type?: EntryType | null;
  admin_note?: string | null;
};
type PerWeekInput = {
  worker_id: string;
  week_start: string;             // Monday of the week
  overrides: Array<{
    work_date: string;
    approved_hours: number | null;
    approved_entry_type: EntryType | null;
    admin_note: string | null;
  }>;
};

export async function POST(req: Request) {
  const auth = await requireApiAdmin();
  if (auth instanceof NextResponse) return auth;
  const { session } = auth;
  const adminId = session.user.id;

  const supabase = requireSupabase();
  if (supabase instanceof NextResponse) return supabase;

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  const raw = body as Record<string, unknown>;

  const worker_id = String(raw.worker_id ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(worker_id)) {
    return NextResponse.json({ error: "worker_id must be a uuid" }, { status: 400 });
  }

  // Per-week variant?
  if (typeof raw.week_start === "string") {
    const week_start = String(raw.week_start);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(week_start)) {
      return NextResponse.json({ error: "week_start (YYYY-MM-DD) required" }, { status: 400 });
    }
    const overrides = Array.isArray(raw.overrides)
      ? (raw.overrides as unknown[]).map(parseOverride).filter((o): o is NonNullable<ReturnType<typeof parseOverride>> => o !== null)
      : [];
    return handleWeek(supabase, adminId, { worker_id, week_start, overrides });
  }

  // Per-day variant.
  const work_date = String(raw.work_date ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(work_date)) {
    return NextResponse.json({ error: "work_date or week_start required" }, { status: 400 });
  }
  const perDay: PerDayInput = {
    worker_id, work_date,
    approved_hours:      parseHours(raw.approved_hours),
    approved_entry_type: parseEntryType(raw.approved_entry_type),
    admin_note:          parseNote(raw.admin_note),
  };
  return handleDay(supabase, adminId, perDay);
}

function parseHours(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  if (!Number.isFinite(n) || n < 0 || n > 24) return null;
  return Math.round(n * 100) / 100;
}
function parseEntryType(v: unknown): EntryType | null {
  if (typeof v !== "string") return null;
  if (!(ENTRY_TYPES as readonly string[]).includes(v)) return null;
  return v as EntryType;
}
function parseNote(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().slice(0, 500);
  return s || null;
}
function parseOverride(raw: unknown): {
  work_date: string;
  approved_hours: number | null;
  approved_entry_type: EntryType | null;
  admin_note: string | null;
} | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const work_date = String(o.work_date ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(work_date)) return null;
  return {
    work_date,
    approved_hours:      parseHours(o.approved_hours),
    approved_entry_type: parseEntryType(o.approved_entry_type),
    admin_note:          parseNote(o.admin_note),
  };
}

async function handleDay(supabase: SupabaseClient, adminId: string, input: PerDayInput) {
  const { data: row, error: readErr } = await supabase
    .from("daily_timesheets")
    .select("id, entry_type, hours, submitted_at, approved_at, approved_entry_type, approved_hours")
    .eq("worker_id", input.worker_id)
    .eq("work_date", input.work_date)
    .maybeSingle();

  if (readErr) {
    console.error("[admin/timesheet/approve day]", readErr);
    return NextResponse.json({ error: "Could not load timesheet" }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: "No timesheet entry for that day" }, { status: 404 });
  }
  if (!row.submitted_at) {
    return NextResponse.json({ error: "Worker hasn't authorised this day yet" }, { status: 409 });
  }

  const result = await applyApproval(supabase, adminId, {
    id: row.id,
    worker_id: input.worker_id,
    work_date: input.work_date,
    fallbackType: row.entry_type as EntryType,
    fallbackHours: Number(row.hours),
    override: {
      approved_entry_type: input.approved_entry_type ?? null,
      approved_hours:      input.approved_hours ?? null,
      admin_note:          input.admin_note ?? null,
    },
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  revalidatePath("/worker/hours");
  revalidatePath("/admin/hr/payroll");
  return NextResponse.json({ ok: true, approved: 1 });
}

async function handleWeek(supabase: SupabaseClient, adminId: string, input: PerWeekInput) {
  const week_end = addDaysIso(input.week_start, 6);
  const { data: rows, error: readErr } = await supabase
    .from("daily_timesheets")
    .select("id, work_date, entry_type, hours, submitted_at, approved_at")
    .eq("worker_id", input.worker_id)
    .gte("work_date", input.week_start)
    .lte("work_date", week_end);

  if (readErr) {
    console.error("[admin/timesheet/approve week]", readErr);
    return NextResponse.json({ error: "Could not load week" }, { status: 500 });
  }

  const overrideByDate = new Map(input.overrides.map((o) => [o.work_date, o]));
  let approvedCount = 0;
  const errors: string[] = [];
  for (const r of (rows ?? [])) {
    if (!r.submitted_at) continue; // skip unsubmitted days
    const override = overrideByDate.get(r.work_date) ?? null;
    const result = await applyApproval(supabase, adminId, {
      id: r.id,
      worker_id: input.worker_id,
      work_date: r.work_date,
      fallbackType: r.entry_type as EntryType,
      fallbackHours: Number(r.hours),
      override: {
        approved_entry_type: override?.approved_entry_type ?? null,
        approved_hours: override?.approved_hours ?? null,
        admin_note: override?.admin_note ?? null,
      },
    });
    if (result.ok) approvedCount += 1;
    else errors.push(`${r.work_date}: ${result.error}`);
  }

  revalidatePath("/worker/hours");
  revalidatePath("/admin/hr/payroll");
  return NextResponse.json({
    ok: true,
    approved: approvedCount,
    errors: errors.length > 0 ? errors : undefined,
  });
}

type ApplyArgs = {
  id: string;
  worker_id: string;
  work_date: string;                 // YYYY-MM-DD
  fallbackType: EntryType;           // worker-submitted type if admin didn't override
  fallbackHours: number;             // worker-submitted hours if admin didn't override
  override: {
    approved_entry_type: EntryType | null;
    approved_hours: number | null;
    admin_note: string | null;
  };
};

async function applyApproval(
  supabase: SupabaseClient,
  adminId: string,
  args: ApplyArgs,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const effectiveType: EntryType = args.override.approved_entry_type ?? args.fallbackType;
  const effectiveHours: number = args.override.approved_hours ?? args.fallbackHours;
  const nowIso = new Date().toISOString();

  // 1. Stamp the approval on the timesheet row.
  const { error: updErr } = await supabase
    .from("daily_timesheets")
    .update({
      approved_entry_type: effectiveType,
      approved_hours: effectiveHours,
      admin_note: args.override.admin_note,
      approved_at: nowIso,
      approved_by: adminId,
    })
    .eq("id", args.id);
  if (updErr) {
    console.error("[approve] update", updErr);
    return { ok: false, error: "Could not stamp approval" };
  }

  // 2. Bridge into worker_paid_hours (source='manual') so the
  //    existing CSV export sees the approved figure. Only PAID
  //    entry types contribute; unpaid_leave / day_off / public_holiday
  //    contribute zero (deletes any prior row so it's not double-paid).
  const payableHours = PAID_ENTRY_TYPES.has(effectiveType) ? effectiveHours : 0;
  if (payableHours > 0) {
    const { error: payErr } = await supabase
      .from("worker_paid_hours")
      .upsert({
        worker_id: args.worker_id,
        work_date: args.work_date,
        hours: payableHours,
        source: "manual",
        updated_by: adminId,
      }, { onConflict: "worker_id,work_date" });
    if (payErr) console.error("[approve] worker_paid_hours upsert", payErr);
  } else {
    // Ensure any lingering paid-hours row is cleared for a
    // now-unpaid day (e.g. admin reclassified as unpaid_leave).
    await supabase
      .from("worker_paid_hours")
      .delete()
      .eq("worker_id", args.worker_id)
      .eq("work_date", args.work_date);
  }

  // 3. Leave balance: increment the matching used counter.
  const balanceCol = LEAVE_BALANCE_COLUMN[effectiveType];
  if (balanceCol) {
    // Convert hours → days for the balance (8h workday assumed).
    // Round to nearest whole day to keep the existing balance
    // schema (integer days) happy.
    const days = Math.max(1, Math.round(effectiveHours / 8));
    const year = Number(args.work_date.slice(0, 4));
    const { error: balErr } = await supabase.rpc("increment_leave_balance", {
      p_worker_id: args.worker_id,
      p_year: year,
      p_column: balanceCol,
      p_days: days,
    });
    if (balErr) console.error("[approve] leave balance", balErr);
  }

  // 4. Xero Payroll push. Stub for now — logs the payload that
  //    would go to /payroll.xro/2.0/Timesheets. Real API call
  //    activates once (a) OAuth scopes upgraded to payroll.*,
  //    (b) users.xero_employee_id populated per worker, and
  //    (c) Xero Payroll subscription active. The pushed_to_xero_at
  //    column will be stamped by that path.
  console.info("[xero payroll STUB]", {
    worker_id: args.worker_id,
    work_date: args.work_date,
    entry_type: effectiveType,
    hours: effectiveHours,
    note: "Direct Xero Payroll push not yet wired — CSV export from /admin/hr/payroll remains the current path.",
  });

  return { ok: true };
}

function addDaysIso(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}
