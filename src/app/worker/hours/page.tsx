import Link from "next/link";
import { requireWorker } from "@/lib/session";
import { getServiceClient } from "@/lib/supabase";
import {
  todayISO, mondayOfWeek, addDaysISO, weekDates,
  fmtDayShort, fmtWeekRange, toISODate,
} from "@/lib/dates";
import { hoursForEntry, sessionsOf } from "@/lib/cost";
import type { Job } from "@/lib/types";
import WorkerDailyEntry from "@/components/WorkerDailyEntry";
import type { DailyTimesheet, EntryType } from "@/lib/timesheets";

export const dynamic = "force-dynamic";

// /worker/hours — daily timesheet flow.
//
// Workers enter their actual worked hours per day (which may differ
// from clocked-on-job hours — clocked drives invoicing, entered drives
// payroll). Each day gets Authorise button; once authorised the day
// is submitted for admin review. Admin approval locks the day.
//
// The clocked-hours-from-time_log figure is shown as a reference on
// each day so workers can sanity-check what they enter against what
// they clocked. Sessions from multi-session refactor are iterated
// correctly via sessionsOf().

function fmtHM(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return "—";
  const totalMin = Math.round(hours * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h <= 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

export default async function WorkerHoursPage({
  searchParams,
}: { searchParams: { week?: string } }) {
  const session = await requireWorker();
  const supabase = getServiceClient();

  const today = todayISO();
  const seed = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.week ?? "")
    ? searchParams.week!
    : today;
  const weekStart = mondayOfWeek(seed);
  const weekEnd = addDaysISO(weekStart, 6);
  const allWeekDates = weekDates(weekStart);
  const weekdays = allWeekDates.slice(0, 5);
  const weekend = allWeekDates.slice(5);

  // Widen the jobs query bracket by one day to catch a boundary
  // shift into an adjacent scheduled date. Re-bucketed by clock-in
  // date in JS below.
  const queryFrom = addDaysISO(weekStart, -1);
  const queryTo = addDaysISO(weekEnd, 1);

  let jobs: Job[] = [];
  let timesheets: DailyTimesheet[] = [];
  let approvedLeaveByDate = new Map<string, EntryType>();
  let dbConfigured = !!supabase;

  if (supabase) {
    const [{ data: jobsData, error: jobsErr }, { data: tsData }, { data: leaveData }] = await Promise.all([
      supabase
        .from("jobs")
        .select("id, client_name, date, time_log, assigned_worker_ids, status")
        .contains("assigned_worker_ids", [session.user.id])
        .gte("date", queryFrom)
        .lte("date", queryTo),
      supabase
        .from("daily_timesheets")
        .select("*")
        .eq("worker_id", session.user.id)
        .gte("work_date", weekStart)
        .lte("work_date", weekEnd),
      supabase
        .from("leave_requests")
        .select("type, from_date, to_date")
        .eq("worker_id", session.user.id)
        .eq("status", "approved")
        .lte("from_date", weekEnd)
        .gte("to_date", weekStart),
    ]);
    if (jobsErr) {
      console.error("[worker/hours jobs]", jobsErr);
      dbConfigured = false;
    }
    jobs = (jobsData ?? []) as Job[];
    timesheets = (tsData ?? []) as DailyTimesheet[];

    // Map approved leave requests to per-day entry_type hints. The
    // leave_requests.type is human-readable ("Annual Leave"); map to
    // our enum.
    const typeMap: Record<string, EntryType> = {
      "Annual Leave":   "annual_leave",
      "Sick Leave":     "sick_leave",
      "Personal Leave": "personal_leave",
      "Unpaid":         "unpaid_leave",
    };
    for (const req of (leaveData ?? []) as Array<{ type: string; from_date: string; to_date: string }>) {
      const mapped = typeMap[req.type];
      if (!mapped) continue;
      // Walk each date in the range that falls within our week.
      let d = req.from_date > weekStart ? req.from_date : weekStart;
      const stop = req.to_date < weekEnd ? req.to_date : weekEnd;
      while (d <= stop) {
        approvedLeaveByDate.set(d, mapped);
        d = addDaysISO(d, 1);
      }
    }
  }

  // Compute clocked hours per date from jobs.time_log.
  const clockedByDate = new Map<string, number>();
  for (const j of jobs) {
    const sessions = sessionsOf(j.time_log?.[session.user.id]);
    for (const s of sessions) {
      if (!s?.start) continue;
      const iso = toISODate(new Date(s.start));
      if (iso < weekStart || iso > weekEnd) continue;
      const hrs = hoursForEntry(s);
      if (hrs <= 0) continue;
      clockedByDate.set(iso, (clockedByDate.get(iso) ?? 0) + hrs);
    }
  }

  // Timesheet lookup by date.
  const tsByDate = new Map<string, DailyTimesheet>();
  for (const t of timesheets) tsByDate.set(t.work_date, t);

  // Pay-period authorised total (Mon–Fri).
  // Uses approved_hours if approved, else hours if authorised, else 0.
  function effective(t: DailyTimesheet | undefined): number {
    if (!t) return 0;
    if (t.approved_at) return Number(t.approved_hours ?? t.hours ?? 0);
    if (t.submitted_at) return Number(t.hours ?? 0);
    return 0;
  }
  const payPeriodHours = weekdays.reduce(
    (sum, iso) => sum + effective(tsByDate.get(iso)),
    0,
  );
  const anyWeekendWork = weekend.some((iso) => effective(tsByDate.get(iso)) > 0);

  const prevWeek = addDaysISO(weekStart, -7);
  const nextWeek = addDaysISO(weekStart, 7);
  const thisWeekStart = mondayOfWeek(today);
  const isCurrentWeek = weekStart === thisWeekStart;
  const isFutureWeek = weekStart > thisWeekStart;

  function renderDay(iso: string) {
    const t = tsByDate.get(iso);
    return (
      <WorkerDailyEntry
        key={iso}
        workDate={iso}
        dayLabel={fmtDayShort(iso)}
        isToday={iso === today}
        clockedHours={clockedByDate.get(iso) ?? 0}
        entryType={(t?.entry_type ?? approvedLeaveByDate.get(iso) ?? "worked") as EntryType}
        hours={Number(t?.hours ?? 0)}
        workerNote={t?.worker_note ?? null}
        submittedAt={t?.submitted_at ?? null}
        approvedAt={t?.approved_at ?? null}
        approvedEntryType={(t?.approved_entry_type ?? null) as EntryType | null}
        approvedHours={t?.approved_hours == null ? null : Number(t.approved_hours)}
        approvedLeaveType={approvedLeaveByDate.get(iso) ?? null}
      />
    );
  }

  return (
    <div>
      <h1 style={titleStyle}>My hours</h1>
      <p style={subtitleStyle}>
        Enter your actual worked hours per day and <strong>Authorise</strong> at the end of each day.
        Thomas or Brad will approve the week before it goes to payroll. Clocked-on-job hours
        (shown as reference) drive client invoicing, not your pay.
      </p>

      <div style={navRowStyle}>
        <Link href={`/worker/hours?week=${prevWeek}`} style={navBtnStyle} aria-label="Previous week">‹ Prev</Link>
        <div style={weekLabelStyle}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "1.5px", color: "var(--gray)", textTransform: "uppercase" }}>
            {isCurrentWeek ? "This week" : isFutureWeek ? "Upcoming" : "Past week"}
          </div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 18, color: "var(--navy)" }}>
            {fmtWeekRange(weekStart)}
          </div>
        </div>
        <Link href={`/worker/hours?week=${nextWeek}`} style={navBtnStyle} aria-label="Next week">Next ›</Link>
      </div>

      {!isCurrentWeek && (
        <div style={{ marginBottom: 16 }}>
          <Link href={`/worker/hours?week=${thisWeekStart}`} style={jumpLinkStyle}>
            Jump to this week
          </Link>
        </div>
      )}

      {!dbConfigured && (
        <div style={emptyStyle}>Database not configured.</div>
      )}

      <div style={summaryCardStyle}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "1.5px", color: "rgba(255,255,255,0.7)", textTransform: "uppercase", marginBottom: 4 }}>
          Pay-period total (Mon–Fri) — authorised or approved
        </div>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 40, lineHeight: 1.1 }}>
          {fmtHM(payPeriodHours)}
        </div>
      </div>

      <div style={listStyle}>
        {weekdays.map(renderDay)}
      </div>

      {anyWeekendWork && (
        <>
          <div style={{
            fontSize: 11, fontWeight: 800, letterSpacing: "1.5px",
            color: "var(--gray)", textTransform: "uppercase",
            marginTop: 20, marginBottom: 8,
          }}>
            Weekend
          </div>
          <div style={listStyle}>
            {weekend.map(renderDay)}
          </div>
        </>
      )}
    </div>
  );
}

const titleStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)", fontSize: 28, color: "var(--navy)",
  lineHeight: 1.1, marginBottom: 4,
};
const subtitleStyle: React.CSSProperties = {
  color: "var(--gray)", fontSize: 14, lineHeight: 1.5, marginBottom: 20,
};
const navRowStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "space-between",
  gap: 8, marginBottom: 16,
};
const navBtnStyle: React.CSSProperties = {
  background: "white", color: "var(--navy)",
  border: "1px solid rgba(0,0,0,0.12)", borderRadius: 8,
  padding: "8px 12px", fontSize: 13, fontWeight: 700,
  minHeight: 40, display: "inline-flex", alignItems: "center",
  textDecoration: "none",
};
const weekLabelStyle: React.CSSProperties = {
  textAlign: "center", flex: 1, minWidth: 0,
};
const jumpLinkStyle: React.CSSProperties = {
  display: "inline-block", fontSize: 13, color: "var(--navy)",
  textDecoration: "underline", textUnderlineOffset: "3px",
};
const summaryCardStyle: React.CSSProperties = {
  background: "var(--navy)", color: "white",
  borderRadius: 14, padding: "18px 20px", marginBottom: 16,
};
const listStyle: React.CSSProperties = {
  display: "flex", flexDirection: "column", gap: 10,
};
const emptyStyle: React.CSSProperties = {
  background: "white", borderRadius: 12, padding: 16,
  fontSize: 13, color: "var(--gray)", marginBottom: 16,
};
