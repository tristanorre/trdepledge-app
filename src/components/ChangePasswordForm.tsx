"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const MIN_LEN = 8;

export default function ChangePasswordForm() {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!current) return setError("Enter your current password");
    if (next.length < MIN_LEN) return setError(`New password must be at least ${MIN_LEN} characters`);
    if (next !== confirm) return setError("New passwords don't match");
    if (next === current) return setError("New password must differ from current");

    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/me/password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ current_password: current, new_password: next }),
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
        ✓ Password updated. Use it next time you sign in.
        <button type="button" onClick={() => setSuccess(false)} style={changeAgain}>
          Change again
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit}>
      <div className="form-group">
        <label className="form-label" htmlFor="current_password">Current password</label>
        <input
          id="current_password" type="password"
          value={current} onChange={(e) => setCurrent(e.target.value)}
          className="form-input" required autoComplete="current-password"
        />
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="new_password">New password</label>
        <input
          id="new_password" type="password"
          value={next} onChange={(e) => setNext(e.target.value)}
          className="form-input" required autoComplete="new-password"
          minLength={MIN_LEN}
        />
        <div style={hintStyle}>At least {MIN_LEN} characters. Long beats complex — use a passphrase.</div>
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="confirm_password">Confirm new password</label>
        <input
          id="confirm_password" type="password"
          value={confirm} onChange={(e) => setConfirm(e.target.value)}
          className="form-input" required autoComplete="new-password"
        />
      </div>

      {error && <div className="form-error" role="alert">⚠ {error}</div>}

      <button type="submit" className="form-submit" disabled={submitting}>
        {submitting ? "Saving…" : "Update password"}
      </button>
    </form>
  );
}

const hintStyle: React.CSSProperties = { fontSize: 12, color: "var(--gray)", marginTop: 4 };
const changeAgain: React.CSSProperties = {
  display: "block", margin: "12px auto 0",
  background: "transparent", border: "none",
  color: "var(--navy)", textDecoration: "underline",
  cursor: "pointer", fontSize: 13,
};
