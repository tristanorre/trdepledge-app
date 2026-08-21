"use client";

import { useState } from "react";

export type StoredCheck = {
  key: string;
  status: "ok" | "warn" | "fail";
  detail: string;
  since: string;
  checked_at: string;
};

type Props = {
  initial: StoredCheck[];
  labels: Record<string, { label: string; why: string }>;
};

// Sort worst-first. Someone opening this page during a problem should see
// the problem, not scroll past six green rows to find it.
const RANK: Record<StoredCheck["status"], number> = { fail: 0, warn: 1, ok: 2 };

const TONE: Record<StoredCheck["status"], { dot: string; text: string; word: string }> = {
  fail: { dot: "#C0392B", text: "#7F1D1D", word: "Not working" },
  warn: { dot: "#D97706", text: "#78350F", word: "Needs a look" },
  ok:   { dot: "#1E8449", text: "#14532D", word: "Working" },
};

function age(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 48) return `${hrs} hr`;
  return `${Math.floor(hrs / 24)} days`;
}

export default function HealthPanel({ initial, labels }: Props) {
  const [checks, setChecks] = useState<StoredCheck[]>(initial);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runNow() {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/health", { method: "POST" });
      if (!res.ok) throw new Error(`Checks failed (${res.status})`);
      const body = await res.json() as { checks: Array<{ key: string; status: StoredCheck["status"]; detail: string }> };
      const now = new Date().toISOString();
      // The POST returns fresh results without `since`; keep the existing
      // one where the status is unchanged so the "broken for N days"
      // figure survives a manual re-check.
      setChecks((prev) => body.checks.map((r) => {
        const before = prev.find((p) => p.key === r.key);
        return {
          key: r.key,
          status: r.status,
          detail: r.detail,
          since: before && before.status === r.status ? before.since : now,
          checked_at: now,
        };
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not run checks");
    } finally {
      setRunning(false);
    }
  }

  const sorted = [...checks].sort((a, b) => RANK[a.status] - RANK[b.status]);
  const problems = sorted.filter((c) => c.status !== "ok");
  const lastChecked = checks.length > 0
    ? checks.reduce((a, b) => (a.checked_at > b.checked_at ? a : b)).checked_at
    : null;

  return (
    <div>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 16, flexWrap: "wrap", marginBottom: 20,
      }}>
        <div>
          {checks.length === 0 ? (
            <strong style={{ color: "#78350F" }}>
              No checks recorded yet — run them to populate this page.
            </strong>
          ) : problems.length === 0 ? (
            <strong style={{ color: TONE.ok.text, fontSize: 17 }}>
              Everything is working.
            </strong>
          ) : (
            <strong style={{ color: TONE.fail.text, fontSize: 17 }}>
              {problems.length} thing{problems.length > 1 ? "s need" : " needs"} attention
            </strong>
          )}
          {lastChecked && (
            <div style={{ fontSize: 13, color: "#666", marginTop: 2 }}>
              Last checked {age(lastChecked)} ago
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={runNow}
          disabled={running}
          className="btn btn-primary"
          style={{ opacity: running ? 0.6 : 1 }}
        >
          {running ? "Checking…" : "Run checks now"}
        </button>
      </div>

      {error && (
        <div style={{
          background: "#FEF2F2", border: "1px solid #FECACA", color: "#7F1D1D",
          padding: "10px 14px", borderRadius: 10, marginBottom: 16, fontSize: 14,
        }}>{error}</div>
      )}

      <div style={{ display: "grid", gap: 10 }}>
        {sorted.map((c) => {
          const meta = labels[c.key] ?? { label: c.key, why: "" };
          const tone = TONE[c.status];
          return (
            <div key={c.key} style={{
              display: "grid", gridTemplateColumns: "12px 1fr auto", gap: 14,
              alignItems: "start", background: "#fff", border: "1px solid #E5E7EB",
              borderLeft: `4px solid ${tone.dot}`, borderRadius: 12, padding: "14px 16px",
            }}>
              <span aria-hidden="true" style={{
                width: 10, height: 10, borderRadius: "50%",
                background: tone.dot, marginTop: 6,
              }} />
              <div>
                <div style={{ fontWeight: 700, color: "#0A1F3D" }}>{meta.label}</div>
                <div style={{ color: tone.text, fontSize: 14, marginTop: 2 }}>{c.detail}</div>
                {meta.why && (
                  <div style={{ color: "#6B7280", fontSize: 12.5, marginTop: 6 }}>{meta.why}</div>
                )}
              </div>
              <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: tone.text }}>
                  {tone.word}
                </div>
                {c.status !== "ok" && (
                  <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>
                    for {age(c.since)}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
