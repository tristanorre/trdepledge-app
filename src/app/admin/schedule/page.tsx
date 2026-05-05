import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { getServiceClient } from "@/lib/supabase";
import { loadDaySchedule, type WorkerDayState } from "@/lib/schedule";
import { fmtDayLong, todayISO, minutesToLabel } from "@/lib/dates";
import { JobStatusPill } from "@/components/StatusPill";
import DateSelector from "@/components/DateSelector";

export const dynamic = "force-dynamic";

export default async function AdminSchedulePage({
  searchParams,
}: {
  searchParams: { date?: string };
}) {
  await requireAdmin();
  const supabase = getServiceClient();

  const date = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date ?? "") ? searchParams.date! : todayISO();

  if (!supabase) {
    return (
      <div>
        <h1 style={titleStyle}>Schedule</h1>
        <Banner>Supabase not configured.</Banner>
      </div>
    );
  }

  const data = await loadDaySchedule(supabase, date);

  return (
    <div>
      <h1 style={titleStyle}>Schedule</h1>
      <p style={{ color: "var(--gray)", fontSize: 14, marginBottom: 16 }}>
        {fmtDayLong(date)} — all workers
      </p>

      <DateSelector current={date} />

      {data.workers_state.length === 0 ? (
        <Empty>No active workers found. Add workers in HR first.</Empty>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {data.workers_state.map((w) => <WorkerLane key={w.worker.id} state={w} />)}
        </div>
      )}
    </div>
  );
}

function WorkerLane({ state }: { state: WorkerDayState }) {
  const status = state.on_leave    ? { tag: state.leave_type ?? "Leave", bg: "rgba(255,229,0,0.18)", fg: "#857200" }
              :  !state.rostered   ? { tag: "Off",   bg: "var(--off)",                fg: "var(--gray)" }
              :                      { tag: "Rostered", bg: "rgba(168,216,24,0.18)", fg: "#3F5C00" };

  return (
    <div style={laneStyle}>
      <div style={laneHeaderStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: state.worker.colour, flexShrink: 0 }} />
          <span style={{ fontWeight: 800, color: "var(--navy)", fontSize: 15 }}>{state.worker.name}</span>
          {state.rostered && state.start_time && state.end_time && (
            <span style={{ fontSize: 12, color: "var(--gray)" }}>
              · {fmtTime(state.start_time)} – {fmtTime(state.end_time)}
            </span>
          )}
        </div>
        <span style={{
          background: status.bg, color: status.fg,
          fontSize: 10, fontWeight: 800, padding: "3px 10px", borderRadius: 999,
          textTransform: "uppercase", letterSpacing: "0.5px",
        }}>
          {status.tag}
        </span>
      </div>

      {state.jobs.length === 0 ? (
        <div style={{ color: "var(--gray)", fontSize: 13, padding: "8px 14px", fontStyle: "italic" }}>
          No jobs scheduled.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "8px 14px 14px" }}>
          {state.jobs.map((j) => {
            const slotMins = j.scheduled_time ? toMins(j.scheduled_time) : null;
            return (
              <Link
                key={j.id}
                href={`/admin/jobs/${j.id}`}
                style={jobBlockStyle}
              >
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--navy)", minWidth: 56 }}>
                  {slotMins !== null ? minutesToLabel(slotMins) : "—"}
                </span>
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {j.client_name}
                  {j.suburb && <span style={{ color: "var(--gray)", fontWeight: 500 }}> · {j.suburb}</span>}
                </span>
                <JobStatusPill status={j.status} />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function fmtTime(t: string): string { return minutesToLabel(toMins(t)); }
function toMins(t: string): number {
  const [h, m] = t.split(":");
  return Number(h) * 60 + Number(m);
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: "white", borderRadius: 16, padding: 32,
      textAlign: "center", color: "var(--gray)", fontSize: 14,
      boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
    }}>
      {children}
    </div>
  );
}
function Banner({ children }: { children: React.ReactNode }) {
  return (
    <div role="alert" style={{
      background: "rgba(255, 229, 0, 0.18)",
      border: "1px solid rgba(133, 114, 0, 0.3)",
      color: "#857200", padding: "12px 16px", borderRadius: 10,
      fontSize: 14,
    }}>
      {children}
    </div>
  );
}

const titleStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)", fontSize: 28, color: "var(--navy)",
  lineHeight: 1.1, marginBottom: 4,
};
const laneStyle: React.CSSProperties = {
  background: "white", borderRadius: 14,
  border: "1px solid rgba(0,0,0,0.06)",
  overflow: "hidden",
};
const laneHeaderStyle: React.CSSProperties = {
  display: "flex", justifyContent: "space-between", alignItems: "center",
  padding: "12px 14px",
  background: "var(--off)",
  gap: 8, flexWrap: "wrap",
};
const jobBlockStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 10,
  background: "rgba(168,216,24,0.10)",
  border: "1px solid rgba(168,216,24,0.35)",
  borderRadius: 10, padding: "10px 12px",
  fontSize: 13, color: "var(--black)",
};
