"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function XeroConnectButton({ connected }: { connected: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function disconnect() {
    if (!confirm("Disconnect Xero? Invoices won't be sent until you reconnect.")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/xero/disconnect", { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? "Disconnect failed");
      }
      router.refresh();
    } finally { setBusy(false); }
  }

  if (connected) {
    return (
      <button type="button" onClick={disconnect} disabled={busy} style={dangerBtn}>
        {busy ? "Disconnecting…" : "Disconnect Xero"}
      </button>
    );
  }
  return (
    <a href="/api/admin/xero/connect" style={primaryBtn}>
      Connect Xero →
    </a>
  );
}

const primaryBtn: React.CSSProperties = {
  background: "var(--lime)", color: "var(--navy)",
  border: "none", borderRadius: 10,
  padding: "10px 16px", fontSize: 14, fontWeight: 800,
  cursor: "pointer", minHeight: 44,
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  textDecoration: "none",
};
const dangerBtn: React.CSSProperties = {
  background: "transparent", color: "#B91C1C",
  border: "1.5px solid #B91C1C", borderRadius: 10,
  padding: "10px 16px", fontSize: 14, fontWeight: 700,
  cursor: "pointer", minHeight: 44,
};
