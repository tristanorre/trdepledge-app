"use client";

import { useState } from "react";
import JobPhotosSection from "@/components/JobPhotosSection";

// Receipts capture for the worker job detail page.
//
// Receipts are rare compared to before/after photos — most jobs don't
// involve buying anything on-site. Showing the camera section
// unconditionally would clutter the page. Instead we render a
// checkbox: "I bought materials for this job" — ticking it reveals
// the upload section.
//
// If receipts have already been uploaded the checkbox starts ticked
// so the photos remain visible. Unticking just hides the camera —
// uploaded receipts stay in the DB, the admin can see them.

type Photo = { path: string; url: string };

type Props = {
  jobId: string;
  initialReceipts: Photo[];
};

export default function ReceiptsCapture({ jobId, initialReceipts }: Props) {
  const hasReceipts = initialReceipts.length > 0;
  const [open, setOpen] = useState<boolean>(hasReceipts);

  return (
    <div>
      <label style={checkboxRowStyle}>
        <input
          type="checkbox"
          checked={open}
          onChange={(e) => setOpen(e.target.checked)}
          style={checkboxStyle}
        />
        <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={checkboxLabel}>
            I bought materials for this job
            {hasReceipts && (
              <span style={pillStyle}>{initialReceipts.length} attached</span>
            )}
          </span>
          <span style={checkboxHint}>
            Tick to add receipt photos (Bunnings, hardware store, etc).
          </span>
        </span>
      </label>

      {open && (
        <div style={{ marginTop: 12 }}>
          <JobPhotosSection
            jobId={jobId}
            kind="receipts"
            initialPhotos={initialReceipts}
            canCapture={true}
            canDelete={false}
          />
        </div>
      )}
    </div>
  );
}

const checkboxRowStyle: React.CSSProperties = {
  display: "flex", alignItems: "flex-start", gap: 12,
  cursor: "pointer",
  padding: "4px 0",
};
const checkboxStyle: React.CSSProperties = {
  width: 22, height: 22, flex: "0 0 auto",
  cursor: "pointer", accentColor: "var(--navy)",
  marginTop: 2,
};
const checkboxLabel: React.CSSProperties = {
  fontSize: 15, fontWeight: 700, color: "var(--navy)",
  display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap",
};
const checkboxHint: React.CSSProperties = {
  fontSize: 12, color: "var(--gray)", lineHeight: 1.4,
};
const pillStyle: React.CSSProperties = {
  fontSize: 10, fontWeight: 800, letterSpacing: "0.5px",
  textTransform: "uppercase",
  padding: "2px 8px", borderRadius: 999,
  background: "rgba(34,134,58,0.14)", color: "#15803D",
};
