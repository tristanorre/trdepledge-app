import Link from "next/link";
import { requireWorker } from "@/lib/session";
import { getServiceClient } from "@/lib/supabase";
import { loadDaySchedule } from "@/lib/schedule";
import { fmtDayLong, todayISO, minutesToLabel } from "@/lib/dates";
import { JobStatusPill } from "@/components/StatusPill";
import DateSelector from "@/components/DateSelector";

export const dynamic = "force-dynamic";

export default async function WorkerSchedulePage({
  searchParams,
}: {
  searchParams: { date?: string };
}) {
  const session = await requireWorker();
  const supabase = getServiceClient();

  const date = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date ?? "") ? searchParams.date! : todayISO();

  if (!supabase) {
    return (
      <div>
        <h1 style={titleStyle}>My schedule</h1>
        <Banner>Database not configured.</Banner>
      </div>
    );
  }

  const data = await loadDaySchedule(supabase, date, { onlyWorkerId: session.user.id });
  const me = data.workers_state[0]; // exactly one row

  return (
    <div>
      <h1 style={titleStyle}>My schedule</h1>
      <p style={{ color: "var(--gray)", fontSize: 14, marginBottom: 16 }}>
        {fmtDayLong(date)}
      </p>

      <DateSelector current={date} />

      {!me ? (
        <Empty>You don&apos;t have a worker profile yet — ask Thomas to add you.</Empty>
      ) : (
        <>
          <div style={statusCardStyle}>
            <div>
              <div style={statusLabelStyle}>Today</div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 22, color: "var(--navy)", marginTop: 2 }}>
                {me.on_leave   ? `On leave (${me.leave_type ?? "Leave"})`
               : !me.rostered  ? "Off roster"
               :                  "Rostered"}
              </div>
              {me.rostered && me.start_time && me.end_time && (
                <div style={{ fontSize: 13, color: "var(--gray)", marginTop: 4 }}>
                  {fmtTime(me.start_time)} – {fmtTime(me.end_time)}
                </div>
              )}
            </div>
          </div>

          <h2 style={sectionHeader}>Jobs · {me.jobs.length}</h2>
          {me.jobs.length === 0 ? (
            <div style={{ color: "var(--gray)", fontSize: 13, padding: "8px 4px", fontStyle: "italic" }}>
              No jobs assigned to you on this day.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {me.jobs.map((j) => (
                <Link
                  key={j.id}
                  href={`/worker/jobs/${j.id}`}
                  style={jobBlockStyle}
                >
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--navy)", minWidth: 64 }}>
                    {j.scheduled_time ? minutesToLabel(toMins(j.scheduled_time)) : "—"}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {j.client_name}
                    {j.suburb && <span style={{ color: "var(--gray)", fontWeight: 500 }}> · {j.suburb}</span>}
                  </span>
                  <JobStatusPill status={j.status} />
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function fmtTime(t: string): string { return minutesToLabel(toMins(t)); }
function toMins(t: string): number { const [h, m] = t.split(":"); return Number(h) * 60 + Number(m); }

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: "white", borderRadius: 16, padding: 32,
      textAlign: "center", color: "var(--gray)", fontSize: 14,
      boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
    }}>{children}</div>
  );
}
function Banner({ children }: { children: React.ReactNode }) {
  return (
    <div role="alert" style={{
      background: "rgba(255, 229, 0, 0.18)",
      border: "1px solid rgba(133, 114, 0, 0.3)",
      color: "#857200", padding: "12px 16px", borderRadius: 10,
      fontSize: 14,
    }}>{children}</div>
  );
}

const titleStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)", fontSize: 28, color: "var(--navy)",
  lineHeight: 1.1, marginBottom: 4,
};
const sectionHeader: React.CSSProperties = {
  fontSize: 12, fontWeight: 800, letterSpacing: "1.5px",
  textTransform: "uppercase", color: "var(--gray)", margin: "20px 0 10px",
};
const statusCardStyle: React.CSSProperties = {
  background: "white", borderRadius: 14, padding: 16,
  border: "1px solid rgba(0,0,0,0.06)",
};
const statusLabelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 800, letterSpacing: "1.5px",
  textTransform: "uppercase", color: "var(--gray)",
};
const jobBlockStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 10,
  background: "white",
  border: "1px solid rgba(0,0,0,0.06)",
  borderRadius: 10, padding: "12px 14px",
  fontSize: 14, color: "var(--black)",
};
