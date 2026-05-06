"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const MIN_LEN = 8;

export default function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";

  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!token) return setError("Reset link is missing its token. Request a new one.");
    if (next.length < MIN_LEN) return setError(`Password must be at least ${MIN_LEN} characters`);
    if (next !== confirm) return setError("Passwords don't match");

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, new_password: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not reset");
      setDone(true);
      setTimeout(() => router.push("/login"), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div role="status" style={{ padding: 20, color: "#15803D", fontWeight: 600, textAlign: "center" }}>
        ✓ Password updated. Redirecting to sign-in…
      </div>
    );
  }

  if (!token) {
    return (
      <div role="alert" style={{ padding: 20, color: "#B91C1C", fontWeight: 600, textAlign: "center" }}>
        This reset link is missing its token. Request a fresh link from the
        sign-in page.
      </div>
    );
  }

  return (
    <form onSubmit={submit}>
      <div className="form-group">
        <label className="form-label" htmlFor="new_password">New password</label>
        <input
          id="new_password" type="password" className="form-input"
          value={next} onChange={(e) => setNext(e.target.value)}
          required autoComplete="new-password" minLength={MIN_LEN}
        />
        <div style={{ fontSize: 12, color: "var(--gray)", marginTop: 4 }}>At least {MIN_LEN} characters.</div>
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="confirm_password">Confirm new password</label>
        <input
          id="confirm_password" type="password" className="form-input"
          value={confirm} onChange={(e) => setConfirm(e.target.value)}
          required autoComplete="new-password"
        />
      </div>

      {error && <div className="form-error" role="alert">⚠ {error}</div>}

      <button type="submit" className="form-submit" disabled={submitting}>
        {submitting ? "Saving…" : "Set new password"}
      </button>
    </form>
  );
}
