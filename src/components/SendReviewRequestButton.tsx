"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

// Button on completed jobs to (re-)send the review-request SMS + email.
// Auto-send already fires on the status transition, so this is for
// manual re-sends (client deleted the SMS, missed the email, etc.).

type Props = {
  jobId: string;
  hasBeenSent: boolean;
};

export default function SendReviewRequestButton({ jobId, hasBeenSent }: Props) {
  const router = useRouter();
  const [isPending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function send() {
    setMsg(null);
    setErr(null);
    start(async () => {
      try {
        const res = await fetch(`/api/admin/jobs/${jobId}/send-review-request`, {
          method: "POST",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Send failed");
        setMsg(hasBeenSent ? "Resent." : "Sent.");
        router.refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Send failed");
      }
    });
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <button type="button" onClick={send} disabled={isPending} style={btnStyle}>
        {isPending
          ? "Sending…"
          : hasBeenSent
          ? "↻ Resend review request"
          : "★ Send review request"}
      </button>
      {msg && <span style={{ color: "var(--navy)", fontSize: 13, fontWeight: 700 }}>✓ {msg}</span>}
      {err && <span style={{ color: "#B91C1C", fontSize: 13, fontWeight: 700 }}>⚠ {err}</span>}
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  background: "white", color: "var(--navy)",
  border: "1.5px solid var(--navy)",
  borderRadius: 10,
  padding: "8px 14px", fontSize: 13, fontWeight: 800,
  cursor: "pointer", minHeight: 40,
  display: "inline-flex", alignItems: "center", gap: 6,
};
