"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = { jobId: string; initialMinutes: number };

function fmt(mins: number): string {
  if (mins <= 0) return "0 min";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h <= 0) return `${m} min`;
  if (m === 0) return `${h} hr`;
  return `${h} hr ${m} min`;
}

export default function WaitingTimePicker({ jobId, initialMinutes }: Props) {
  const router = useRouter();
  const [mins, setMins] = useState(initialMinutes);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function bump(delta: number) {
    setSubmitting(true);
    setError(null);
    // Optimistic — UI reflects immediately, server confirms.
    setMins((m) => Math.max(0, m + delta));
    try {
      const res = await fetch(`/api/worker/jobs/${jobId}/waiting-time`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ add_minutes: delta }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not update");
      setMins(data.waiting_time_minutes);
      router.refresh();
    } catch (err) {
      // Roll back optimistic update on failure.
      setMins((m) => Math.max(0, m - delta));
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{
      background: "white", borderRadius: 14, padding: 16,
      border: "1px solid rgba(0,0,0,0.06)",
    }}>
      <div style={{
        fontSize: 11, fontWeight: 800, letterSpacing: "1.5px",
        textTransform: "uppercase", color: "var(--gray)", marginBottom: 12,
      }}>
        Waiting time (billable)
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <button
          type="button"
          onClick={() => bump(-5)}
          disabled={submitting || mins <= 0}
          aria-label="Subtract 5 minutes"
          style={stepBtn}
        >
          −5
        </button>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 28, color: "var(--navy)", lineHeight: 1 }}>
          {fmt(mins)}
        </div>
        <button
          type="button"
          onClick={() => bump(+5)}
          disabled={submitting}
          aria-label="Add 5 minutes"
          style={stepBtn}
        >
          +5
        </button>
      </div>

      {error && <div className="form-error" role="alert" style={{ marginTop: 8 }}>⚠ {error}</div>}
    </div>
  );
}

const stepBtn: React.CSSProperties = {
  background: "var(--off)", color: "var(--navy)",
  border: "none", borderRadius: 12,
  padding: "14px 20px", fontSize: 18, fontWeight: 800,
  cursor: "pointer", minHeight: 56, minWidth: 64,
};
