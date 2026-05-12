"use client";

import { signIn } from "next-auth/react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type Worker = { id: string; name: string; colour: string };
type Mode = "worker" | "admin";

// Only accept same-origin relative paths as a `from` redirect target.
// Without this, `/login?from=https://evil.example/phish` would land a
// freshly-authed user on an attacker page after sign-in (open redirect).
//   * Must start with `/` so it's a path, not a full URL
//   * Must NOT start with `//` or `/\` (protocol-relative URLs that
//     would still leave our origin)
//   * Must not contain `\` (Windows path-style smuggle)
function safeFrom(raw: string | null): string | null {
  if (!raw) return null;
  if (!raw.startsWith("/")) return null;
  if (raw.startsWith("//") || raw.startsWith("/\\")) return null;
  if (raw.includes("\\")) return null;
  return raw;
}

export default function LoginForm() {
  const params = useSearchParams();
  const fromParam = safeFrom(params.get("from"));

  const [mode, setMode] = useState<Mode>("worker");
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [workerId, setWorkerId] = useState("");
  const [pin, setPin] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/workers")
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setWorkers(d.workers ?? []); })
      .catch(() => { if (!cancelled) setWorkers([]); });
    return () => { cancelled = true; };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const callbackUrl =
      fromParam ?? (mode === "admin" ? "/admin" : "/worker");

    const res = await signIn("credentials", {
      redirect: false,
      mode,
      email, password,
      worker_id: workerId, pin,
      callbackUrl,
    });

    setSubmitting(false);

    if (!res || res.error) {
      setError(
        mode === "admin"
          ? "Email or password not recognised."
          : "PIN not recognised. Please try again."
      );
      return;
    }
    window.location.href = res.url ?? callbackUrl;
  }

  return (
    <div style={styles.shell}>
      <div style={styles.logoWrap}>
        <Image
          src="/images/logo-v16.png"
          alt="T.R. Depledge Gardening & Maintenance"
          width={1053}
          height={1052}
          priority
          // Square v16 mark — cap at 200px so the form below it still
          // sits above the fold on a phone.
          style={{ width: "100%", maxWidth: 200, height: "auto" }}
        />
      </div>

      <div style={styles.tabs} role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "worker"}
          onClick={() => { setMode("worker"); setError(null); }}
          style={mode === "worker" ? styles.tabActive : styles.tab}
        >
          Worker
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "admin"}
          onClick={() => { setMode("admin"); setError(null); }}
          style={mode === "admin" ? styles.tabActive : styles.tab}
        >
          Admin
        </button>
      </div>

      <form onSubmit={submit} style={styles.form}>
        {mode === "worker" ? (
          <>
            <div className="form-group">
              <label className="form-label" htmlFor="worker_id">Who&apos;s logging in?</label>
              <select
                id="worker_id"
                className="form-select"
                value={workerId}
                onChange={(e) => setWorkerId(e.target.value)}
                required
              >
                <option value="">Select your name…</option>
                {workers.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
              {workers.length === 0 && (
                <div style={styles.hint}>
                  No workers yet — check Supabase env vars or seed the database.
                </div>
              )}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="pin">4-digit PIN</label>
              <input
                id="pin"
                className="form-input"
                type="password"
                inputMode="numeric"
                pattern="\d{4}"
                maxLength={4}
                placeholder="••••"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                required
                autoComplete="off"
                style={{ letterSpacing: "0.4em", textAlign: "center", fontSize: 20 }}
              />
            </div>
          </>
        ) : (
          <>
            <div className="form-group">
              <label className="form-label" htmlFor="email">Email</label>
              <input
                id="email"
                className="form-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="t.rdepledge@outlook.com"
                required
                autoComplete="email"
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="password">Password</label>
              <input
                id="password"
                className="form-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
          </>
        )}

        <button type="submit" className="form-submit" disabled={submitting}>
          {submitting ? "Signing in…" : "Sign in →"}
        </button>

        {error && <div className="form-error" role="alert" style={{ textAlign: "center" }}>⚠ {error}</div>}

        {mode === "admin" && (
          <div style={{ marginTop: 16, textAlign: "center" }}>
            <Link href="/forgot-password" style={{ fontSize: 13, color: "var(--gray)", textDecoration: "underline" }}>
              Forgot password?
            </Link>
          </div>
        )}
      </form>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  shell: {
    background: "white",
    borderRadius: 20,
    padding: 36,
    boxShadow: "0 8px 48px rgba(0,0,0,0.4)",
    width: "100%",
    maxWidth: 400,
  },
  logoWrap: {
    display: "flex",
    justifyContent: "center",
    marginBottom: 28,
  },
  tabs: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 6,
    background: "var(--off)",
    borderRadius: 12,
    padding: 4,
    marginBottom: 24,
  },
  tab: {
    background: "transparent",
    border: "none",
    padding: "12px 16px",
    borderRadius: 8,
    fontWeight: 700,
    fontSize: 14,
    color: "var(--gray)",
    cursor: "pointer",
    minHeight: 44,
  },
  tabActive: {
    background: "var(--navy)",
    border: "none",
    padding: "12px 16px",
    borderRadius: 8,
    fontWeight: 700,
    fontSize: 14,
    color: "white",
    cursor: "pointer",
    minHeight: 44,
  },
  form: {
    display: "flex",
    flexDirection: "column",
  },
  hint: {
    fontSize: 12,
    color: "var(--gray)",
    marginTop: 6,
  },
};
