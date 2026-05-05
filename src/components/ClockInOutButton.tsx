"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  jobId: string;
  initialTimeLog: { start?: string; end?: string };
};

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

export default function ClockInOutButton({ jobId, initialTimeLog }: Props) {
  const router = useRouter();
  const [log, setLog] = useState(initialTimeLog);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  // Re-render every 30s while clocked in so the elapsed counter updates.
  useEffect(() => {
    if (log.start && !log.end) {
      const id = setInterval(() => setTick((t) => t + 1), 30_000);
      return () => clearInterval(id);
    }
  }, [log.start, log.end]);

  async function act(action: "in" | "out") {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/worker/jobs/${jobId}/clock`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not update");
      setLog(data.job?.time_log ?? {});
      router.refresh(); // pull fresh status from the server
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  // Three visual states: idle, in-progress, completed.
  if (!log.start) {
    return (
      <Card>
        <Label>Time on site</Label>
        <button
          type="button"
          onClick={() => act("in")}
          disabled={submitting}
          style={primaryBtn}
        >
          {submitting ? "Clocking in…" : "▶ Clock in"}
        </button>
        {error && <Err>{error}</Err>}
      </Card>
    );
  }

  if (log.start && !log.end) {
    const elapsed = Date.now() - new Date(log.start).getTime();
    void tick; // referenced so the interval-driven re-render isn't optimised away
    return (
      <Card>
        <Label>Clocked in</Label>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
          <span style={{ fontSize: 13, color: "var(--gray)" }}>Started {fmtTimeOfDay(log.start)}</span>
          <span style={{ fontFamily: "var(--font-display)", fontSize: 28, color: "var(--navy)" }}>
            {fmtElapsed(elapsed)}
          </span>
        </div>
        <button
          type="button"
          onClick={() => act("out")}
          disabled={submitting}
          style={dangerBtn}
        >
          {submitting ? "Clocking out…" : "■ Clock out & complete"}
        </button>
        {error && <Err>{error}</Err>}
      </Card>
    );
  }

  // Both start + end: show summary, no actions.
  const total = new Date(log.end!).getTime() - new Date(log.start).getTime();
  return (
    <Card>
      <Label>Completed</Label>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, fontSize: 13 }}>
        <Stat label="Started" value={fmtTimeOfDay(log.start)} />
        <Stat label="Finished" value={fmtTimeOfDay(log.end!)} />
        <Stat label="Total" value={fmtElapsed(total)} highlight />
      </div>
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
