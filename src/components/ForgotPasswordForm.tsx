"use client";

import { useState } from "react";

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Could not submit");
      }
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div role="status" style={{ padding: 20, color: "#15803D", fontWeight: 600, textAlign: "center" }}>
        ✓ If that email is on file, a reset link is on the way. Check your inbox
        within a minute or two — the link is valid for 60 minutes.
      </div>
    );
  }

  return (
    <form onSubmit={submit}>
      <div className="form-group">
        <label className="form-label" htmlFor="email">Admin email</label>
        <input
          id="email" type="email" className="form-input"
          value={email} onChange={(e) => setEmail(e.target.value)}
          required autoComplete="email"
          placeholder="t.rdepledge@outlook.com"
        />
      </div>

      {error && <div className="form-error" role="alert">⚠ {error}</div>}

      <button type="submit" className="form-submit" disabled={submitting}>
        {submitting ? "Sending…" : "Send reset link"}
      </button>
    </form>
  );
}
