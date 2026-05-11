import Link from "next/link";
import { requireWorker } from "@/lib/session";
import { getServiceClient } from "@/lib/supabase";
import {
  todayISO, mondayOfWeek, addDaysISO, weekDates,
  fmtDayShort, fmtWeekRange, dayKeyOf, toISODate,
} from "@/lib/dates";
import { hoursForEntry, type TimeEntry } from "@/lib/cost";
import type { Job } from "@/lib/types";

export const dynamic = "force-dynamic";

// /worker/hours — per-worker timesheet view.
//
// Workers asked for "total hours per day + pay period total" so they can
// sanity-check what they've worked before payday and spot clock-out
// mistakes (forgot to clock out, accidentally still on break, etc).
//
// The pay period is Mon → Fri. Weekend work is rare but if it exists it
// gets its own row beneath the pay-period total, so nothing gets hidden.
//
// Hours are computed from `time_log[me]` using the same `hoursForEntry`
// helper the invoicing path uses, which already subtracts break minutes
// and counts open shifts up to "now". So the number shown here matches
// what Thomas would see on the cost breakdown for the same shift.

// Format hours (e.g. 7.25) as "7h 15m".
function fmtHM(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return "—";
  const totalMin = Math.round(hours * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h <= 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

type DayBucket = {
  iso: string;
  hours: number;
  jobCount: number;
  hasOpenShift: boolean; // worker still clocked in on this day
  jobs: Array<{ jobId: string; clientName: string; hours: number; open: boolean }>;
};

export default async function WorkerHoursPage({
  searchParams,
}: { searchParams: { week?: string } }) {
  const session = await requireWorker();
  const supabase = getServiceClient();

  // Resolve which week we're viewing. Default to the Monday of "today".
  const today = todayISO();
  const seed = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.week ?? "")
    ? searchParams.week!
    : today;
  const weekStart = mondayOfWeek(seed);
  const weekEnd   = addDaysISO(weekStart, 6); // Sunday

  // Bracket the SQL filter loose to catch jobs whose scheduled date
  // sits on the edge of the week but whose actual clock-in spilt into
  // an adjacent day. We re-bucket in JS by clock-in date below.
  const queryFrom = addDaysISO(weekStart, -1);
  const queryTo   = addDaysISO(weekEnd, 1);

  let jobs: Job[] = [];
  let dbConfigured = !!supabase;
  if (supabase) {
    const { data, error } = await supabase
      .from("jobs")
      .select("id, client_name, date, time_log, assigned_worker_ids, status")
      .contains("assigned_worker_ids", [session.user.id])
      .gte("date", queryFrom)
      .lte("date", queryTo);
    if (error) {
      console.error("[worker/hours]", error);
      dbConfigured = false;
    }
    jobs = (data ?? []) as Job[];
  }

  // Build day buckets keyed by ISO date.
  const buckets = new Map<string, DayBucket>();
  function bucketFor(iso: string): DayBucket {
    const existing = buckets.get(iso);
    if (existing) return existing;
    const next: DayBucket = { iso, hours: 0, jobCount: 0, hasOpenShift: false, jobs: [] };
    buckets.set(iso, next);
    return next;
  }

  for (const j of jobs) {
    const entry = (j.time_log?.[session.user.id] ?? undefined) as TimeEntry | undefined;
    if (!entry?.start) continue;
    const startISO = toISODate(new Date(entry.start));
    const hours = hoursForEntry(entry);
    if (hours <= 0) continue;
    const isOpen = !entry.end;
    const b = bucketFor(startISO);
    b.hours += hours;
    b.jobCount += 1;
    b.hasOpenShift = b.hasOpenShift || isOpen;
    b.jobs.push({ jobId: j.id, clientName: j.client_name, hours, open: isOpen });
  }

  const allWeekDates = weekDates(weekStart);
  const weekdays = allWeekDates.slice(0, 5);     // Mon–Fri
  const weekend  = allWeekDates.slice(5);        // Sat–Sun

  // Pay-period total = Mon–Fri only.
  const payPeriodHours = weekdays.reduce(
    (sum, iso) => sum + (buckets.get(iso)?.hours ?? 0),
    0,
  );
  const weekendHours = weekend.reduce(
    (sum, iso) => sum + (buckets.get(iso)?.hours ?? 0),
    0,
  );
  const anyWeekendWork = weekendHours > 0;

  const prevWeek = addDaysISO(weekStart, -7);
  const nextWeek = addDaysISO(weekStart, 7);
  const thisWeekStart = mondayOfWeek(today);
  const isCurrentWeek = weekStart === thisWeekStart;
  const isFutureWeek = weekStart > thisWeekStart;

  return (
    <div>
      <h1 style={titleStyle}>My hours</h1>
      <p style={subtitleStyle}>
        Hours you&apos;ve worked this pay period (Mon–Fri). Break time is
        already deducted. Still clocked in? That day&apos;s total keeps
        ticking up live.
      </p>

      {/* Week navigation */}
      <div style={navRowStyle}>
        <Link href={`/worker/hours?week=${prevWeek}`} style={navBtnStyle} aria-label="Previous week">
          ‹ Prev
        </Link>
        <div style={weekLabelStyle}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "1.5px", color: "var(--gray)", textTransform: "uppercase" }}>
            {isCurrentWeek ? "This week" : isFutureWeek ? "Upcoming" : "Past week"}
          </div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 18, color: "var(--navy)" }}>
            {fmtWeekRange(weekStart)}
          </div>
        </div>
        <Link href={`/worker/hours?week=${nextWeek}`} style={navBtnStyle} aria-label="Next week">
          Next ›
        </Link>
      </div>

      {!isCurrentWeek && (
        <div style={{ marginBottom: 16 }}>
          <Link href={`/worker/hours?week=${thisWeekStart}`} style={jumpLinkStyle}>
            Jump to this week
          </Link>
        </div>
      )}

      {!dbConfigured && (
        <div style={emptyStyle}>
          Database not configured.
        </div>
      )}

      {/* Pay-period summary card — the headline number workers came here for. */}
      <div style={summaryCardStyle}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "1.5px", color: "rgba(255,255,255,0.7)", textTransform: "uppercase", marginBottom: 4 }}>
          Pay-period total (Mon–Fri)
        </div>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 40, lineHeight: 1.1 }}>
          {fmtHM(payPeriodHours)}
        </div>
      </div>

      {/* Weekday rows */}
      <div style={listStyle}>
        {weekdays.map((iso) => (
          <DayRow key={iso} iso={iso} bucket={buckets.get(iso)} isToday={iso === today} />
        ))}
      </div>

      {/* Weekend rows shown only if there's data (rare). */}
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
            {weekend.map((iso) => (
              <DayRow key={iso} iso={iso} bucket={buckets.get(iso)} isToday={iso === today} />
            ))}
          </div>
          <div style={{ marginTop: 8, fontSize: 12, color: "var(--gray)", textAlign: "right" }}>
            Weekend total: <strong style={{ color: "var(--navy)" }}>{fmtHM(weekendHours)}</strong>
            {" "}— not included in the pay-period total above.
          </div>
        </>
      )}
    </div>
  );
}

function DayRow({ iso, bucket, isToday }: { iso: string; bucket: DayBucket | undefined; isToday: boolean }) {
  const dayKey = dayKeyOf(iso);
  const isWeekend = dayKey === "sat" || dayKey === "sun";
  const hours = bucket?.hours ?? 0;
  const jobCount = bucket?.jobCount ?? 0;
  const empty = hours <= 0;

  return (
    <div style={{
      ...dayRowStyle,
      background: isToday ? "rgba(208,255,89,0.18)" : "white",
      borderColor: isToday ? "rgba(208,255,89,0.6)" : "rgba(0,0,0,0.06)",
    }}>
      <div style={{ display: "flex", flexDirection: "column", minWidth: 90 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.8px", color: "var(--gray)", textTransform: "uppercase" }}>
          {fmtDayShort(iso)}{isWeekend && " ·"}
        </div>
        {isToday && (
          <div style={{ fontSize: 10, fontWeight: 800, color: "#15803D", letterSpacing: "0.8px", textTransform: "uppercase" }}>
            Today
          </div>
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {empty ? (
          <div style={{ fontSize: 13, color: "var(--gray)", fontStyle: "italic" }}>No hours logged</div>
        ) : (
          <>
            {bucket!.jobs.map((j) => (
              <div key={j.jobId} style={{
                display: "flex", justifyContent: "space-between", gap: 8,
                fontSize: 13, color: "var(--navy)", padding: "2px 0",
              }}>
                <Link href={`/worker/jobs/${j.jobId}`} style={{
                  color: "var(--navy)", textDecoration: "none",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  flex: 1, minWidth: 0,
                }}>
                  {j.clientName}{j.open && <span style={openTagStyle}>live</span>}
                </Link>
                <span style={{ color: "var(--gray)", flex: "0 0 auto" }}>{fmtHM(j.hours)}</span>
              </div>
            ))}
            <div style={{
              marginTop: 6, paddingTop: 6,
              borderTop: "1px solid rgba(0,0,0,0.06)",
              display: "flex", justifyContent: "space-between",
              fontSize: 14, fontWeight: 800, color: "var(--navy)",
            }}>
              <span>{jobCount} job{jobCount === 1 ? "" : "s"}</span>
              <span>{fmtHM(hours)}{bucket!.hasOpenShift && " (live)"}</span>
            </div>
          </>
        )}
      </div>
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
  display: "flex", flexDirection: "column", gap: 8,
};
const dayRowStyle: React.CSSProperties = {
  display: "flex", gap: 12,
  padding: "12px 14px", borderRadius: 12,
  border: "1px solid",
};
const emptyStyle: React.CSSProperties = {
  background: "white", borderRadius: 12, padding: 16,
  fontSize: 13, color: "var(--gray)", marginBottom: 16,
};
const openTagStyle: React.CSSProperties = {
  display: "inline-block", marginLeft: 6,
  background: "rgba(255,229,0,0.18)", color: "#857200",
  fontSize: 10, fontWeight: 800, letterSpacing: "0.5px",
  textTransform: "uppercase",
  padding: "1px 6px", borderRadius: 999,
  verticalAlign: "middle",
};
