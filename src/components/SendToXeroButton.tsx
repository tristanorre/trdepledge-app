"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Preview + edit + send flow for the Xero invoice. The parent (job
// detail page) computes the preview lines via previewLines() and
// hands them in; admin can retype any Description before hitting
// Send. Quantity, unit price and totals are read-only — they come
// from the cost engine and shouldn't be fudged on the way to Xero.
// If Thomas needs to change quantities he does it via the job's
// time-log / materials edit, then re-opens the preview.

export type XeroPreviewLine = {
  description: string;   // auto-generated default
  qty: string;
  unit: string;
  total: string;
};

type Props = {
  jobId: string;
  alreadySent: boolean;
  invoiceNumber: string | null;
  jobCompleted: boolean;
  // Populated when the job is completed and there's something to
  // invoice — one entry per line item Xero will receive. Empty
  // array = nothing to invoice yet.
  initialLines: XeroPreviewLine[];
};

export default function SendToXeroButton({
  jobId, alreadySent, invoiceNumber, jobCompleted, initialLines,
}: Props) {
  const router = useRouter();
  const [descriptions, setDescriptions] = useState<string[]>(
    initialLines.map((l) => l.description),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<unknown>(null);
  const [showDetail, setShowDetail] = useState(false);

  function updateDescription(idx: number, value: string) {
    setDescriptions((prev) => prev.map((d, i) => (i === idx ? value : d)));
  }

  async function send() {
    if (!confirm(
      "Send this job's invoice to Xero as a draft?\n\n" +
      "The descriptions below are what will appear on the customer invoice.\n" +
      "You'll still review and Approve inside Xero before it goes out.",
    )) return;
    setBusy(true);
    setError(null);
    setDetail(null);
    setShowDetail(false);
    try {
      const res = await fetch(`/api/admin/jobs/${jobId}/xero`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ line_descriptions: descriptions }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data?.detail != null) setDetail(data.detail);
        throw new Error(data.error ?? "Send failed");
      }
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
          ✓ Draft created in Xero{invoiceNumber ? ` · ${invoiceNumber}` : ""}
        </div>
        <div style={{ fontSize: 11, color: "var(--gray)", marginTop: 4, lineHeight: 1.5 }}>
          Open Xero → Business → Invoices → Drafts to review and Approve.
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

  if (initialLines.length === 0) {
    return (
      <div style={hintStyle}>
        Nothing to invoice yet — no clocked labour or materials. Add time or
        materials to the job first, then come back here.
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontSize: 12, color: "var(--gray)", marginBottom: 10, lineHeight: 1.5 }}>
        Edit any description below before sending. Quantities and prices come from the cost
        breakdown above — to change those, edit the time log or materials list and reload.
      </div>

      <div style={tableWrap}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={{ ...thStyle, textAlign: "left" }}>Description</th>
              <th style={{ ...thStyle, textAlign: "right", width: 80 }}>Qty</th>
              <th style={{ ...thStyle, textAlign: "right", width: 90 }}>Unit</th>
              <th style={{ ...thStyle, textAlign: "right", width: 90 }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {initialLines.map((line, i) => (
              <tr key={i}>
                <td style={tdStyle}>
                  <input
                    type="text"
                    value={descriptions[i] ?? ""}
                    onChange={(e) => updateDescription(i, e.target.value)}
                    disabled={busy}
                    aria-label={`Description for line ${i + 1}`}
                    style={inputStyle}
                    maxLength={500}
                  />
                </td>
                <td style={{ ...tdStyle, textAlign: "right" }}>{line.qty}</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>{line.unit}</td>
                <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700 }}>{line.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 14, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" onClick={send} disabled={busy} style={primaryBtn}>
          {busy ? "Sending…" : "Send to Xero →"}
        </button>
        <span style={{ fontSize: 12, color: "var(--gray)" }}>
          Lands in Xero as <strong>DRAFT</strong> — review + Approve there before it goes to the customer.
        </span>
      </div>

      {error && (
        <div className="form-error" role="alert" style={errorBoxStyle}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
            <span aria-hidden="true">⚠</span>
            <span style={{ flex: 1, lineHeight: 1.5 }}>{error}</span>
          </div>
          {detail != null && (
            <div style={{ marginTop: 8 }}>
              <button
                type="button"
                onClick={() => setShowDetail((v) => !v)}
                style={detailToggleStyle}
              >
                {showDetail ? "Hide technical detail" : "Show technical detail"}
              </button>
              {showDetail && (
                <pre style={detailBoxStyle}>{JSON.stringify(detail, null, 2)}</pre>
              )}
            </div>
          )}
        </div>
      )}
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
  background: "var(--off)", borderRadius: 10, lineHeight: 1.5,
};
const tableWrap: React.CSSProperties = {
  background: "white", borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.08)",
  overflowX: "auto",
};
const tableStyle: React.CSSProperties = {
  width: "100%", borderCollapse: "collapse", minWidth: 500,
};
const thStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 800, letterSpacing: "0.6px",
  textTransform: "uppercase", color: "var(--gray)",
  padding: "10px 10px",
  borderBottom: "1px solid var(--gray-light)",
  background: "var(--off)",
};
const tdStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderBottom: "1px solid var(--gray-light)",
  fontSize: 13, color: "var(--navy)",
  verticalAlign: "middle",
};
const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 10px",
  fontSize: 13, fontFamily: "inherit",
  border: "1.5px solid rgba(0,0,0,0.15)",
  borderRadius: 8,
  background: "white", color: "var(--navy)",
  boxSizing: "border-box",
};
const errorBoxStyle: React.CSSProperties = {
  marginTop: 10,
  padding: 10,
  background: "rgba(220,38,38,0.08)",
  border: "1px solid rgba(220,38,38,0.25)",
  color: "#B91C1C",
  borderRadius: 8,
  fontSize: 13,
};
const detailToggleStyle: React.CSSProperties = {
  background: "transparent", border: "none",
  color: "#B91C1C", fontWeight: 700, fontSize: 12,
  textDecoration: "underline", textUnderlineOffset: "3px",
  cursor: "pointer", padding: 0,
};
const detailBoxStyle: React.CSSProperties = {
  marginTop: 6, padding: 10,
  background: "white", color: "var(--navy)",
  border: "1px solid rgba(0,0,0,0.1)",
  borderRadius: 6, fontSize: 11,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  overflow: "auto", maxHeight: 280,
  whiteSpace: "pre-wrap", wordBreak: "break-word",
};
