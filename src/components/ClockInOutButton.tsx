"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { BreakEntry, TimeEntry } from "@/lib/cost";

type Props = {
  jobId: string;
  userId: string;
  initialTimeLog: TimeEntry;
};

type Action = "in" | "out" | "break-start" | "break-end";

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
  const [log, setLog] = useState<TimeEntry>(initialTimeLog);
  const [busy, setBusy] = useState<null | Action>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

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
      const fullLog = (data.job?.time_log ?? {}) as Record<string, TimeEntry>;
      setLog(fullLog[userId] ?? {});
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  // ── State 1: not clocked in yet ────────────────────────────────
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

    return (
      <Card>
        <Label>{onBreak ? "On break" : "Clocked in"}</Label>
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

  // ── State 3: both start + end set — completed ──────────────────
  const start = new Date(log.start!).getTime();
  const end = new Date(log.end!).getTime();
  const gross = end - start;
  const breakMs = totalBreakMs(log.breaks, end);
  const net = Math.max(0, gross - breakMs);
  return (
    <Card>
      <Label>Completed</Label>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, fontSize: 13 }}>
        <Stat label="Started" value={fmtTimeOfDay(log.start!)} />
        <Stat label="Finished" value={fmtTimeOfDay(log.end!)} />
        <Stat label="Net time" value={fmtElapsed(net)} highlight />
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
