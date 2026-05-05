"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = { jobId: string };

export default function ReopenJobButton({ jobId }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reopen() {
    if (!confirm("Reopen this job? Status returns to 'in progress' and the worker can clock out again.")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/jobs/${jobId}/reopen`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not reopen");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button type="button" onClick={reopen} disabled={busy} style={btn}>
        {busy ? "Reopening…" : "↺ Reopen job"}
      </button>
      {error && <div className="form-error" role="alert" style={{ marginTop: 8 }}>⚠ {error}</div>}
    </div>
  );
}

const btn: React.CSSProperties = {
  background: "transparent", color: "var(--navy)",
  border: "1.5px solid var(--navy)", borderRadius: 10,
  padding: "10px 18px", fontSize: 14, fontWeight: 700,
  cursor: "pointer", minHeight: 44,
};
