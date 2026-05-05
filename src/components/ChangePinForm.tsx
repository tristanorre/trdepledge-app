"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ChangePinForm() {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function digitsOnly(s: string): string {
    return s.replace(/\D/g, "").slice(0, 4);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^\d{4}$/.test(current)) return setError("Current PIN must be 4 digits");
    if (!/^\d{4}$/.test(next))    return setError("New PIN must be 4 digits");
    if (next !== confirm)         return setError("New PINs don't match");
    if (next === current)         return setError("New PIN must differ from current");

    setSubmitting(true);
    try {
      const res = await fetch("/api/worker/me/pin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ current_pin: current, new_pin: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not update");
      setCurrent(""); setNext(""); setConfirm("");
      setSuccess(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div role="status" style={{ textAlign: "center", padding: 20, color: "#15803D", fontWeight: 700, fontSize: 15 }}>
        ✓ PIN updated. Use your new PIN next time you sign in.
        <button type="button" onClick={() => setSuccess(false)} style={changeAgain}>
          Change again
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit}>
      <div className="form-group">
        <label className="form-label" htmlFor="current_pin">Current PIN</label>
        <input
          id="current_pin"
          type="password"
          inputMode="numeric"
          maxLength={4}
          value={current}
          onChange={(e) => setCurrent(digitsOnly(e.target.value))}
          className="form-input"
          required
          autoComplete="current-password"
          style={pinInputStyle}
        />
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="new_pin">New PIN</label>
        <input
          id="new_pin"
          type="password"
          inputMode="numeric"
          maxLength={4}
          value={next}
          onChange={(e) => setNext(digitsOnly(e.target.value))}
          className="form-input"
          required
          autoComplete="new-password"
          style={pinInputStyle}
        />
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="confirm_pin">Confirm new PIN</label>
        <input
          id="confirm_pin"
          type="password"
          inputMode="numeric"
          maxLength={4}
          value={confirm}
          onChange={(e) => setConfirm(digitsOnly(e.target.value))}
          className="form-input"
          required
          autoComplete="new-password"
          style={pinInputStyle}
        />
      </div>

      {error && <div className="form-error" role="alert">⚠ {error}</div>}

      <button type="submit" className="form-submit" disabled={submitting}>
        {submitting ? "Saving…" : "Update PIN"}
      </button>
    </form>
  );
}

const pinInputStyle: React.CSSProperties = {
  letterSpacing: "0.4em", textAlign: "center", fontSize: 20,
};
const changeAgain: React.CSSProperties = {
  display: "block", margin: "12px auto 0",
  background: "transparent", border: "none",
  color: "var(--navy)", textDecoration: "underline",
  cursor: "pointer", fontSize: 13,
};
