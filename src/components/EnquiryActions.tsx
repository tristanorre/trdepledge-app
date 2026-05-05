"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { EnquiryStatus } from "@/lib/types";

type Props = {
  enquiryId: string;
  status: EnquiryStatus;
  convertedToJobId: string | null;
};

export default function EnquiryActions({ enquiryId, status, convertedToJobId }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | string>(null);
  const [error, setError] = useState<string | null>(null);

  async function patch(next: EnquiryStatus, action: string) {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch(`/api/admin/enquiries/${enquiryId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Could not update");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  async function convert() {
    setBusy("convert");
    setError(null);
    try {
      const res = await fetch(`/api/admin/enquiries/${enquiryId}/convert`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not convert");
      // Land on the job edit page so admin can fill in date, address, workers.
      router.push(`/admin/jobs/${data.job_id}/edit`);
      router.refresh();
    } catch (err) {
      setBusy(null);
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  // Already-converted enquiries become a "Open job" link, not a re-convert button.
  if (status === "converted" && convertedToJobId) {
    return (
      <a
        href={`/admin/jobs/${convertedToJobId}`}
        style={{ ...primaryBtnStyle, textAlign: "center" }}
      >
        Open the job →
      </a>
    );
  }

  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      <button
        type="button"
        onClick={convert}
        disabled={busy !== null}
        style={primaryBtnStyle}
      >
        {busy === "convert" ? "Converting…" : "Convert to job →"}
      </button>

      {status !== "contacted" && status !== "closed" && (
        <button
          type="button"
          onClick={() => patch("contacted", "contacted")}
          disabled={busy !== null}
          style={secondaryBtnStyle}
        >
          {busy === "contacted" ? "Saving…" : "Mark contacted"}
        </button>
      )}

      {status !== "closed" && (
        <button
          type="button"
          onClick={() => patch("closed", "close")}
          disabled={busy !== null}
          style={secondaryBtnStyle}
        >
          {busy === "close" ? "Saving…" : "Close"}
        </button>
      )}

      {error && (
        <div className="form-error" role="alert" style={{ flexBasis: "100%" }}>⚠ {error}</div>
      )}
    </div>
  );
}

const primaryBtnStyle: React.CSSProperties = {
  background: "var(--lime)", color: "var(--navy)",
  border: "none", borderRadius: 10,
  padding: "12px 20px", fontSize: 14, fontWeight: 800,
  cursor: "pointer", minHeight: 44,
  display: "inline-flex", alignItems: "center", justifyContent: "center",
};
const secondaryBtnStyle: React.CSSProperties = {
  background: "transparent", color: "var(--navy)",
  border: "1.5px solid var(--navy)", borderRadius: 10,
  padding: "10px 16px", fontSize: 14, fontWeight: 700,
  cursor: "pointer", minHeight: 44,
};
