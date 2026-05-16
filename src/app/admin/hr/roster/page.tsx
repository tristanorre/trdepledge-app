import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { getServiceClient } from "@/lib/supabase";
import RosterEditor from "@/components/RosterEditor";
import { mondayOfWeek, todayISO, addDaysISO, weekDates, dayKeyOf } from "@/lib/dates";
import type { WorkerListEntry } from "@/lib/types";
import type { RosterRow } from "@/lib/schedule";

export const dynamic = "force-dynamic";

// Roster owns BOTH:
//   1. Which days/times each worker is on shift this week (existing
//      shape — drives the time-allocation board + worker schedule).
//   2. How many paid hours per day per worker — the figure used for
//      payroll. Stored in worker_paid_hours per-date rather than in
//      the roster row so a future post-roster edit (on the payroll
//      page) doesn't need to mutate the roster itself.
//
// We hand both datasets to the editor so it can show paid hours
// per-day with a weekly total per worker AND a team total.
export default async function AdminRosterPage({
  searchParams,
}: {
  searchParams: { week_start?: string };
}) {
  await requireAdmin();
  const supabase = getServiceClient();

  const weekStart = mondayOfWeek(
    /^\d{4}-\d{2}-\d{2}$/.test(searchParams.week_start ?? "") ? searchParams.week_start! : todayISO()
  );
  const prevWeek = addDaysISO(weekStart, -7);

  // The 7 ISO dates for this week (Mon..Sun) and last week — we use
  // them to bracket the paid-hours query, then key the result by
  // worker_id + day key so the editor can pre-fill inputs.
  const thisWeekDates = weekDates(weekStart);
  const prevWeekDates = weekDates(prevWeek);
  const thisStart = thisWeekDates[0];
  const thisEnd   = thisWeekDates[6];
  const prevStart = prevWeekDates[0];
  const prevEnd   = prevWeekDates[6];

  let workers: WorkerListEntry[] = [];
  let rows: RosterRow[] = [];
  let prevRows: RosterRow[] = [];
  let paidThis: Array<{ worker_id: string; work_date: string; hours: number }> = [];
  let paidPrev: Array<{ worker_id: string; work_date: string; hours: number }> = [];

  if (supabase) {
    const [w, r, p, ph, pph] = await Promise.all([
      supabase.from("users").select("id, name, colour")
        .in("role", ["worker", "admin"]).eq("active", true)
        .order("role", { ascending: true })
        .order("name"),
      supabase.from("roster").select("id, worker_id, week_start, days, start_time, end_time").eq("week_start", weekStart),
      supabase.from("roster").select("id, worker_id, week_start, days, start_time, end_time").eq("week_start", prevWeek),
      supabase.from("worker_paid_hours")
        .select("worker_id, work_date, hours")
        .gte("work_date", thisStart).lte("work_date", thisEnd),
      supabase.from("worker_paid_hours")
        .select("worker_id, work_date, hours")
        .gte("work_date", prevStart).lte("work_date", prevEnd),
    ]);
    workers = (w.data ?? []) as WorkerListEntry[];
    rows = (r.data ?? []) as RosterRow[];
    prevRows = (p.data ?? []) as RosterRow[];
    paidThis = (ph.data ?? []) as typeof paidThis;
    paidPrev = (pph.data ?? []) as typeof paidPrev;
  }

  // Flatten paid-hours rows into a flat lookup keyed by
  // `${worker_id}|${day_key}` so the client component doesn't have to
  // re-derive day keys from dates.
  function buildLookup(
    rowsIn: Array<{ worker_id: string; work_date: string; hours: number }>,
  ): Record<string, string> {
    const out: Record<string, string> = {};
    for (const row of rowsIn) {
      const dk = dayKeyOf(row.work_date);
      out[`${row.worker_id}|${dk}`] = String(row.hours);
    }
    return out;
  }

  return (
    <div>
      <Link href="/admin/hr" style={backLinkStyle}>← HR</Link>
      <h1 style={titleStyle}>Roster</h1>
      <p style={{ color: "var(--gray)", fontSize: 14, marginBottom: 20, lineHeight: 1.5 }}>
        Set working days, shift times, and paid hours per worker. The hours figure drives payroll —
        clock-in/out only affects what the client gets charged. Approved leave automatically blocks roster slots.
      </p>

      <RosterEditor
        weekStart={weekStart}
        workers={workers}
        initialRows={rows}
        previousWeekRows={prevRows}
        initialPaidHours={buildLookup(paidThis)}
        previousPaidHours={buildLookup(paidPrev)}
      />
    </div>
  );
}

const backLinkStyle: React.CSSProperties = {
  fontSize: 13, color: "var(--gray)", marginBottom: 8, display: "inline-block",
};
const titleStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)", fontSize: 28, color: "var(--navy)",
  lineHeight: 1.1, marginBottom: 4,
};
