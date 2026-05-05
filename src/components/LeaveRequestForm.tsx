"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { todayISO } from "@/lib/dates";

const TYPES = ["Annual Leave", "Sick Leave", "Personal Leave", "Unpaid"] as const;

export default function LeaveRequestForm() {
  const router = useRouter();
  const [type, setType] = useState<(typeof TYPES)[number]>("Annual Leave");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!from || !to) return setError("Both dates are required");
    if (to < from) return setError("End date must be on or after start date");

    setSubmitting(true);
    try {
      const res = await fetch("/api/worker/leave", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type, from_date: from, to_date: to, reason: reason.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not submit");
      setSuccess(true);
      setFrom(""); setTo(""); setReason("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div style={successStyle} role="status">
        ✅ Request submitted — Thomas will review it shortly.
        <button type="button" onClick={() => setSuccess(false)} style={{
          display: "block", marginTop: 12,
          background: "transparent", border: "none",
          color: "var(--navy)", textDecoration: "underline",
          cursor: "pointer", fontSize: 13,
        }}>
          Submit another
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} style={formStyle}>
      <div className="form-group">
        <label className="form-label" htmlFor="leave_type">Type</label>
        <select id="leave_type" className="form-select" value={type} onChange={(e) => setType(e.target.value as (typeof TYPES)[number])}>
          {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label" htmlFor="from">From</label>
          <input id="from" type="date" className="form-input"
            value={from} min={todayISO()} onChange={(e) => setFrom(e.target.value)} required />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="to">To</label>
          <input id="to" type="date" className="form-input"
            value={to} min={from || todayISO()} onChange={(e) => setTo(e.target.value)} required />
        </div>
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="reason">Reason (optional)</label>
        <textarea id="reason" className="form-textarea" rows={3}
          value={reason} onChange={(e) => setReason(e.target.value)}
          placeholder="A short note for Thomas if you'd like to explain." />
      </div>

      {error && <div className="form-error" role="alert">⚠ {error}</div>}

      <button type="submit" disabled={submitting} className="form-submit">
        {submitting ? "Submitting…" : "Submit request"}
      </button>
    </form>
  );
}

const formStyle: React.CSSProperties = {
  display: "flex", flexDirection: "column", gap: 0,
};
const successStyle: React.CSSProperties = {
  textAlign: "center", padding: 20,
  color: "#15803D", fontWeight: 700, fontSize: 15,
};
