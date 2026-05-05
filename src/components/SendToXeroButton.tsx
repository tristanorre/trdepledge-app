"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  jobId: string;
  alreadySent: boolean;
  invoiceNumber: string | null;
  jobCompleted: boolean;
};

export default function SendToXeroButton({ jobId, alreadySent, invoiceNumber, jobCompleted }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (!confirm("Send this job's invoice to Xero now?")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/jobs/${jobId}/xero`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Send failed");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setBusy(false);
    }
  }

  if (alreadySent) {
    return (
      <div style={sentBoxStyle}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#15803D" }}>
          ✓ Sent to Xero{invoiceNumber ? ` · ${invoiceNumber}` : ""}
        </div>
        <div style={{ fontSize: 11, color: "var(--gray)", marginTop: 4 }}>
          To re-send, clear the Xero invoice ID in the job edit form first.
        </div>
      </div>
    );
  }

  if (!jobCompleted) {
    return (
      <div style={hintStyle}>
        Available once the job is marked <strong>completed</strong>.
      </div>
    );
  }

  return (
    <div>
      <button type="button" onClick={send} disabled={busy} style={primaryBtn}>
        {busy ? "Sending…" : "Send to Xero →"}
      </button>
      {error && <div className="form-error" role="alert" style={{ marginTop: 8 }}>⚠ {error}</div>}
      <div style={{ fontSize: 12, color: "var(--gray)", marginTop: 8 }}>
        Builds the invoice from labour + waiting time + materials, upserts the
        Xero contact, and posts it as <strong>AUTHORISED</strong>.
      </div>
    </div>
  );
}

const primaryBtn: React.CSSProperties = {
  background: "var(--lime)", color: "var(--navy)",
  border: "none", borderRadius: 10,
  padding: "12px 20px", fontSize: 14, fontWeight: 800,
  cursor: "pointer", minHeight: 44,
  display: "inline-flex", alignItems: "center", gap: 6,
};
const sentBoxStyle: React.CSSProperties = {
  background: "rgba(34,134,58,0.10)", border: "1px solid rgba(34,134,58,0.25)",
  borderRadius: 10, padding: 12,
};
const hintStyle: React.CSSProperties = {
  fontSize: 13, color: "var(--gray)", padding: 12,
  background: "var(--off)", borderRadius: 10,
};
