"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { actionsFor, bondActionFor } from "@/lib/hire/workflow";
import type { ReservationStatus } from "@/lib/hire/types";
import * as s from "./adminStyles";

/**
 * The confirm / mark-picked-up / check-in / decline buttons.
 *
 * Which buttons appear comes from `actionsFor`, the same state machine the
 * API route enforces — so the UI can't offer a step the server will refuse.
 * The server still re-checks: this component is drawn from data that may be
 * seconds stale, and Thomas leaves tabs open.
 *
 * Destructive actions confirm first. Declining in particular reminds him the
 * customer still needs telling, because releasing the dates is silent from
 * their side.
 */
export default function BookingActions({
  reservationId,
  status,
  bondWaived = false,
  compact = false,
}: {
  reservationId: string;
  status: ReservationStatus;
  bondWaived?: boolean;
  compact?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const available = actionsFor(status);
  // The bond sits alongside the lifecycle rather than inside it, so it can
  // still be the only control on a booking that has nowhere left to go.
  const bond = bondActionFor(status, bondWaived);
  if (available.length === 0 && !bond) return null;

  async function run(action: string, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;

    setBusy(action);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/hire/reservations/${reservationId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data?.error ?? "That didn't save. Try again.");
        return;
      }
      // Say when a text went out, so Thomas doesn't send a second one by
      // hand — and, on decline, that nothing was sent and the call is his.
      if (data?.texted) setNotice("Confirmed. The customer's been texted.");
      else if (action === "decline") setNotice("Declined. Give them a call to say why.");
      else if (action === "waive-bond") {
        setNotice(
          status === "pending"
            ? "No bond on this one. Confirm it and the text will show the lower total."
            : "No bond on this one. They've had the total with it, so mention it at the counter.",
        );
      } else if (action === "reinstate-bond") setNotice("Bond's back on this hire.");

      // Re-render the server component so every list on the page reflects
      // the new status, not just this row.
      router.refresh();
    } catch {
      setError("That didn't save — check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {available.map((a) => (
          <button
            key={a.action}
            type="button"
            disabled={busy !== null}
            onClick={() => run(a.action, a.confirm)}
            style={{
              ...s.actionButton(a.destructive ? "danger" : compact ? "quiet" : "primary"),
              opacity: busy !== null ? 0.6 : 1,
            }}
          >
            {busy === a.action ? "Saving…" : a.label}
          </button>
        ))}

        {bond && (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => run(bond.action, bond.confirm)}
            style={{
              ...s.actionButton("quiet"),
              opacity: busy !== null ? 0.6 : 1,
            }}
          >
            {busy === bond.action ? "Saving…" : bond.label}
          </button>
        )}
      </div>

      {bondWaived && (
        <p style={{ fontSize: 13, fontWeight: 600, color: "#92400e", margin: "8px 0 0" }}>
          No bond on this hire.
        </p>
      )}
      {error && (
        <p style={s.errorText} role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p style={{ fontSize: 13, fontWeight: 600, color: "#166534", margin: "8px 0 0" }} role="status">
          {notice}
        </p>
      )}
    </div>
  );
}
