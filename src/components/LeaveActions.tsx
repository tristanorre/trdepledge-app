"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = { requestId: string };

export default function LeaveActions({ requestId }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "approved" | "declined">(null);
  const [error, setError] = useState<string | null>(null);

  async function act(status: "approved" | "declined") {
    setBusy(status);
    setError(null);
    try {
      const res = await fetch(`/api/admin/leave/${requestId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
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

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <button
        type="button"
        onClick={() => act("approved")}
        disabled={busy !== null}
        style={approveBtn}
      >
        {busy === "approved" ? "Approving…" : "✓ Approve"}
      </button>
      <button
        type="button"
        onClick={() => act("declined")}
        disabled={busy !== null}
        style={declineBtn}
      >
        {busy === "declined" ? "Declining…" : "✕ Decline"}
      </button>
      {error && <div className="form-error" role="alert" style={{ flexBasis: "100%" }}>⚠ {error}</div>}
    </div>
  );
}

const approveBtn: React.CSSProperties = {
  background: "var(--lime)", color: "var(--navy)",
  border: "none", borderRadius: 10,
  padding: "10px 16px", fontSize: 14, fontWeight: 800,
  cursor: "pointer", minHeight: 44,
};
const declineBtn: React.CSSProperties = {
  background: "transparent", color: "#B91C1C",
  border: "1.5px solid #B91C1C", borderRadius: 10,
  padding: "10px 16px", fontSize: 14, fontWeight: 700,
  cursor: "pointer", minHeight: 44,
};
