"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { sessionsOf, type BreakEntry, type SessionEntry } from "@/lib/cost";

type Props = {
  jobId: string;
  userId: string;
  // Raw per-worker value out of jobs.time_log — either the legacy
  // single-session object or the current SessionEntry[] array.
  // Normalised via sessionsOf() so both shapes work.
  initialTimeLog: unknown;
};

type Action = "in" | "out" | "break-start" | "break-end";

// The session the buttons operate on: the LATEST one. Workers can
// have several sessions per job (leave for another job, come back) —
// clock-in appends a new session, clock-out / breaks act on the
// currently-open (last) one.
function latestSession(sessions: SessionEntry[]): SessionEntry {
  return sessions.length > 0 ? sessions[sessions.length - 1] : {};
}

// Sum of net worked ms across every CLOSED session, excluding the
// latest-open one (which is displayed live separately).
function priorSessionsNetMs(sessions: SessionEntry[], now: number): number {
  if (sessions.length <= 1) return 0;
  let total = 0;
  for (const s of sessions.slice(0, -1)) {
    if (!s?.start) continue;
    const start = new Date(s.start).getTime();
    const end = s.end ? new Date(s.end).getTime() : now;
    const gross = end - start;
    if (gross <= 0) continue;
    total += Math.max(0, gross - totalBreakMs(s.breaks, now));
  }
  return total;
}

function fmtElapsed(ms: number): string {
  if (ms < 0) ms = 0;
  const totalMin = Math.floor(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h <= 0) return `${m}m`;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}
function fmtTimeOfDay(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" });
}

// Total break ms for an entry. Open break counts up to `now`.
function totalBreakMs(breaks: BreakEntry[] | undefined, now: number): number {
  if (!breaks?.length) return 0;
  let total = 0;
  for (const b of breaks) {
    if (!b?.start) continue;
    const bs = new Date(b.start).getTime();
    const be = b.end ? new Date(b.end).getTime() : now;
    if (be > bs) total += be - bs;
  }
  return total;
}
function isOnBreak(breaks: BreakEntry[] | undefined): boolean {
  if (!breaks?.length) return false;
  const last = breaks[breaks.length - 1];
  return !!last?.start && !last.end;
}

export default function ClockInOutButton({ jobId, userId, initialTimeLog }: Props) {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionEntry[]>(() => sessionsOf(initialTimeLog));
  const [busy, setBusy] = useState<null | Action>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const log = latestSession(sessions);

  // Re-render every 30s while clocked in (or on break) so the elapsed
  // and break counters update live.
  useEffect(() => {
    const clockedIn = log.start && !log.end;
    if (!clockedIn) return;
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, [log.start, log.end]);

  async function act(action: Action) {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch(`/api/worker/jobs/${jobId}/clock`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not update");
      // The API returns the whole job; pull our own per-worker value
      // and normalise (it's a SessionEntry[] now, but sessionsOf
      // tolerates the legacy shape too).
      const fullLog = (data.job?.time_log ?? {}) as Record<string, unknown>;
      setSessions(sessionsOf(fullLog[userId]));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  // ── State 1: no sessions at all — first clock-in ───────────────
  if (!log.start) {
    return (
      <Card>
        <Label>Time on site</Label>
        <button
          type="button"
          onClick={() => act("in")}
          disabled={busy !== null}
          style={primaryBtn}
        >
          {busy === "in" ? "Clocking in…" : "▶ Clock in"}
        </button>
        {error && <Err>{error}</Err>}
      </Card>
    );
  }

  // ── State 2: clocked in (possibly on break) ────────────────────
  if (log.start && !log.end) {
    const now = Date.now();
    void tick; // referenced so the interval-driven re-render isn't optimised away
    const totalElapsedMs = now - new Date(log.start).getTime();
    const breakMs = totalBreakMs(log.breaks, now);
    const netMs = Math.max(0, totalElapsedMs - breakMs);
    const onBreak = isOnBreak(log.breaks);
    const lastBreak = onBreak ? log.breaks![log.breaks!.length - 1] : null;
    const priorMs = priorSessionsNetMs(sessions, now);
    const sessionNo = sessions.length;

    return (
      <Card>
        <Label>
          {onBreak ? "On break" : "Clocked in"}
          {sessionNo > 1 && ` · visit ${sessionNo}`}
        </Label>
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "baseline",
          marginBottom: 4,
        }}>
          <span style={{ fontSize: 13, color: "var(--gray)" }}>
            Started {fmtTimeOfDay(log.start)}
          </span>
          <span style={{ fontFamily: "var(--font-display)", fontSize: 28, color: "var(--navy)" }}>
            {fmtElapsed(netMs)}
          </span>
        </div>
        {priorMs > 0 && (
          <div style={{
            fontSize: 12, color: "var(--gray)", marginBottom: 8,
            display: "flex", justifyContent: "space-between",
          }}>
            <span>Earlier visits today</span>
            <span style={{ fontWeight: 700 }}>
              {fmtElapsed(priorMs)} · total {fmtElapsed(priorMs + netMs)}
            </span>
          </div>
        )}
        {breakMs > 0 && (
          <div style={{
            fontSize: 12, color: "var(--gray)", marginBottom: 12,
            display: "flex", justifyContent: "space-between",
          }}>
            <span>Total break time</span>
            <span style={{ fontWeight: 700 }}>{fmtElapsed(breakMs)}</span>
          </div>
        )}
        {onBreak && lastBreak?.start && (
          <div style={onBreakBanner}>
            On break since {fmtTimeOfDay(lastBreak.start)} ·{" "}
            <strong>{fmtElapsed(now - new Date(lastBreak.start).getTime())}</strong>
          </div>
        )}

        {!onBreak && (
          <>
            <button
              type="button"
              onClick={() => act("break-start")}
              disabled={busy !== null}
              style={breakBtn}
            >
              {busy === "break-start" ? "Starting break…" : "⏸ Start break"}
            </button>
            <button
              type="button"
              onClick={() => act("out")}
              disabled={busy !== null}
              style={{ ...dangerBtn, marginTop: 8 }}
            >
              {busy === "out" ? "Clocking out…" : "■ Clock out & complete"}
            </button>
          </>
        )}

        {onBreak && (
          <button
            type="button"
            onClick={() => act("break-end")}
            disabled={busy !== null}
            style={resumeBtn}
          >
            {busy === "break-end" ? "Resuming…" : "▶ End break"}
          </button>
        )}

        {error && <Err>{error}</Err>}
      </Card>
    );
  }

  // ── State 3: latest session closed — show summary + allow a
  //    return visit (clock back in appends a NEW session).
  const start = new Date(log.start!).getTime();
  const end = new Date(log.end!).getTime();
  const gross = end - start;
  const breakMs = totalBreakMs(log.breaks, end);
  const net = Math.max(0, gross - breakMs);
  const priorMs = priorSessionsNetMs(sessions, end);
  const allSessionsNet = priorMs + net;
  const visitCount = sessions.length;

  return (
    <Card>
      <Label>
        {visitCount > 1 ? `Clocked out · ${visitCount} visits` : "Clocked out"}
      </Label>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, fontSize: 13 }}>
        <Stat label="Started" value={fmtTimeOfDay(log.start!)} />
        <Stat label="Finished" value={fmtTimeOfDay(log.end!)} />
        <Stat
          label={visitCount > 1 ? "This visit" : "Net time"}
          value={fmtElapsed(net)}
          highlight
        />
      </div>
      {breakMs > 0 && (
        <div style={{
          marginTop: 12, fontSize: 12, color: "var(--gray)",
          display: "flex", justifyContent: "space-between",
        }}>
          <span>Break time deducted</span>
          <span style={{ fontWeight: 700 }}>{fmtElapsed(breakMs)}</span>
        </div>
      )}
      {visitCount > 1 && (
        <div style={{
          marginTop: 12, paddingTop: 12,
          borderTop: "1px solid rgba(0,0,0,0.08)",
          display: "flex", justifyContent: "space-between",
          fontSize: 14, fontWeight: 800, color: "var(--navy)",
        }}>
          <span>Total across all {visitCount} visits</span>
          <span>{fmtElapsed(allSessionsNet)}</span>
        </div>
      )}

      {/* Return visit — appends a fresh session. Reopens the job to
          in_progress server-side if it had auto-completed. */}
      <button
        type="button"
        onClick={() => act("in")}
        disabled={busy !== null}
        style={{ ...primaryBtn, marginTop: 14 }}
      >
        {busy === "in" ? "Clocking in…" : "▶ Clock back in"}
      </button>
      <div style={{ fontSize: 11, color: "var(--gray)", marginTop: 8, textAlign: "center", lineHeight: 1.4 }}>
        Back on site? Clock back in to start another visit — your earlier time is kept.
      </div>

      {error && <Err>{error}</Err>}
    </Card>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: "white", borderRadius: 14, padding: 16,
      border: "1px solid rgba(0,0,0,0.06)",
    }}>
      {children}
    </div>
  );
}
function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 800, letterSpacing: "1.5px",
      textTransform: "uppercase", color: "var(--gray)", marginBottom: 12,
    }}>
      {children}
    </div>
  );
}
function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: "var(--gray)", textTransform: "uppercase", letterSpacing: "1px" }}>{label}</div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: highlight ? 22 : 18, color: "var(--navy)", marginTop: 2 }}>
        {value}
      </div>
    </div>
  );
}
function Err({ children }: { children: React.ReactNode }) {
  return <div className="form-error" role="alert" style={{ marginTop: 8 }}>⚠ {children}</div>;
}

const baseBtn: React.CSSProperties = {
  width: "100%",
  border: "none", borderRadius: 12,
  padding: "16px 20px", fontSize: 17, fontWeight: 800,
  cursor: "pointer", minHeight: 56,
  letterSpacing: "0.5px",
};
const primaryBtn: React.CSSProperties = {
  ...baseBtn,
  background: "var(--lime)", color: "var(--navy)",
};
const dangerBtn: React.CSSProperties = {
  ...baseBtn,
  background: "#DC2626", color: "white",
};
const breakBtn: React.CSSProperties = {
  ...baseBtn,
  background: "#FEF3C7", color: "#92400E",
  border: "1px solid #FCD34D",
};
const resumeBtn: React.CSSProperties = {
  ...baseBtn,
  background: "var(--lime)", color: "var(--navy)",
};
const onBreakBanner: React.CSSProperties = {
  padding: "10px 12px", marginBottom: 12,
  background: "#FEF3C7", color: "#92400E",
  borderRadius: 10, fontSize: 13, lineHeight: 1.4,
  border: "1px solid #FCD34D",
};
