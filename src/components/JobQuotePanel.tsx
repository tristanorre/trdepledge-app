"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { fmtMoney } from "@/lib/cost";
import type { Job } from "@/lib/types";

// Quote-prep card shown on /admin/jobs/[id] when the job is in
// `pending_review` status. Thomas:
//   1. Enters hours-per-worker + worker count
//   2. Sees the labour estimate update live
//   3. Adds materials (separately, via the existing materials panel)
//   4. Reviews the total + clicks Send Quote to Xero
//
// Materials and the materials-cents total are passed in from the
// server-rendered page so this card reflects the same numbers Thomas
// sees in the Materials section above.
//
// After a quote has been sent, the card shows the send timestamp,
// Xero quote ID, and a hint that he should manage acceptance in Xero.

type Props = {
  job: Job;
  // Sum of all material line totals (after markup), in cents. Computed
  // server-side from the same materials data the page uses elsewhere.
  materialsCents: number;
  // Hourly rate for the job's client type, in cents. From getRates().
  rateCents: number;
  // Connection state — if false, the Send button is disabled with a
  // hint to connect Xero first via /admin/settings.
  xeroConnected: boolean;
};

export default function JobQuotePanel({ job, materialsCents, rateCents, xeroConnected }: Props) {
  const router = useRouter();
  const [hoursPerWorker, setHoursPerWorker] = useState<string>(
    job.quote_hours_per_worker != null ? String(job.quote_hours_per_worker) : ""
  );
  const [workerCount, setWorkerCount] = useState<string>(
    job.quote_worker_count != null ? String(job.quote_worker_count) : ""
  );
  const [busy, setBusy] = useState<null | "save" | "send">(null);
  const [error, setError] = useState<string | null>(null);

  const parsedHours = Number.parseFloat(hoursPerWorker);
  const parsedWorkers = Number.parseInt(workerCount, 10);
  const validEstimate = Number.isFinite(parsedHours) && parsedHours > 0
    && Number.isFinite(parsedWorkers) && parsedWorkers > 0;

  // Live total — labour = hours × workers × rate, plus materials.
  const estimate = useMemo(() => {
    if (!validEstimate) {
      return { labourCents: 0, totalCents: materialsCents, totalWorkerHours: 0 };
    }
    const totalWorkerHours = parsedHours * parsedWorkers;
    const labourCents = Math.round(totalWorkerHours * rateCents);
    return {
      labourCents,
      totalCents: labourCents + materialsCents,
      totalWorkerHours,
    };
  }, [parsedHours, parsedWorkers, materialsCents, rateCents, validEstimate]);

  const alreadySent = !!job.xero_quote_id;

  // Save the estimate (and any change to it) via the existing job
  // PATCH endpoint. Called explicitly on Send, and offered as a
  // "Save estimate" action so Thomas can adjust without sending yet.
  async function saveEstimate(): Promise<boolean> {
    setBusy("save");
    setError(null);
    try {
      const res = await fetch(`/api/admin/jobs/${job.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          quote_hours_per_worker: validEstimate ? parsedHours : null,
          quote_worker_count: validEstimate ? parsedWorkers : null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Could not save");
      }
      router.refresh();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function sendToXero() {
    if (!validEstimate) {
      setError("Set hours-per-worker and worker count first.");
      return;
    }
    if (!confirm(`Send a draft quote to Xero for ${fmtMoney(estimate.totalCents)}? Xero will email the customer the PDF once you click Send inside Xero.`)) {
      return;
    }
    // Save first so the PATCH-then-send is atomic from Thomas's POV.
    const saved = await saveEstimate();
    if (!saved) return;

    setBusy("send");
    setError(null);
    try {
      const res = await fetch(`/api/admin/jobs/${job.id}/xero-quote`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          data.error === "not_connected"
            ? "Xero isn't connected. Go to /admin/settings and click Connect Xero."
            : data.error === "contact_lookup_failed"
            ? "Couldn't find or create the customer contact in Xero."
            : data.error === "nothing_to_quote"
            ? "Nothing to quote — check the estimate and materials."
            : data.error ?? `Send failed (${res.status})`,
        );
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
        <h3 style={titleStyle}>Quote estimate</h3>
        {alreadySent && (
          <span style={sentPillStyle}>
            Sent to Xero {job.quote_sent_at ? new Date(job.quote_sent_at).toLocaleDateString("en-AU", { day: "numeric", month: "short" }) : ""}
          </span>
        )}
      </div>

      <p style={hintStyle}>
        Work out the labour estimate here. Add materials in the section above.
        When the totals look right, send a draft quote to Xero — Xero generates
        the PDF and lets you email it from there.
      </p>

      <div style={gridStyle}>
        <div style={fieldStyle}>
          <label className="form-label" htmlFor="q-hours">Hours per worker</label>
          <input
            id="q-hours"
            className="form-input"
            type="number"
            min="0"
            step="0.25"
            value={hoursPerWorker}
            onChange={(e) => setHoursPerWorker(e.target.value)}
            placeholder="e.g. 2.5"
            disabled={busy !== null || alreadySent}
          />
        </div>
        <div style={fieldStyle}>
          <label className="form-label" htmlFor="q-workers">Workers</label>
          <input
            id="q-workers"
            className="form-input"
            type="number"
            min="1"
            step="1"
            value={workerCount}
            onChange={(e) => setWorkerCount(e.target.value)}
            placeholder="e.g. 2"
            disabled={busy !== null || alreadySent}
          />
        </div>
      </div>

      <div style={breakdownStyle}>
        <Row label="Rate"
             detail={`${fmtMoney(rateCents)}/hr (${job.client_type})`}
             amount={null} />
        <Row label="Labour estimate"
             detail={validEstimate
               ? `${parsedWorkers} worker${parsedWorkers === 1 ? "" : "s"} × ${parsedHours}h = ${estimate.totalWorkerHours}h total`
               : "Enter hours and worker count above"}
             amount={fmtMoney(estimate.labourCents)} />
        <Row label="Materials"
             detail="From the Materials section above"
             amount={fmtMoney(materialsCents)} />
        <div style={totalRowStyle}>
          <span>Quote total</span>
          <span>{fmtMoney(estimate.totalCents)}</span>
        </div>
      </div>

      {!alreadySent && (
        <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={saveEstimate}
            disabled={busy !== null}
            style={btnSecondary}
          >
            {busy === "save" ? "Saving…" : "Save estimate"}
          </button>
          <button
            type="button"
            onClick={sendToXero}
            disabled={busy !== null || !validEstimate || !xeroConnected}
            style={btnPrimary}
            title={
              !xeroConnected
                ? "Xero isn't connected. Connect via /admin/settings first."
                : !validEstimate
                ? "Set hours and worker count first."
                : ""
            }
          >
            {busy === "send" ? "Sending…" : "Send Quote to Xero →"}
          </button>
        </div>
      )}

      {alreadySent && (
        <div style={sentBannerStyle}>
          <strong>Quote already in Xero.</strong>{" "}
          Manage acceptance there — open Xero, find the quote, send to the
          customer, and watch for their response. When the customer
          accepts, change this job&apos;s status from <em>Pending review</em>
          to <em>Scheduled</em> via the Edit Job form.
          {job.xero_quote_id && (
            <div style={{ fontSize: 12, color: "var(--gray)", marginTop: 6 }}>
              Xero quote ID: <code>{job.xero_quote_id}</code>
            </div>
          )}
        </div>
      )}

      {!xeroConnected && !alreadySent && (
        <div style={warningStyle}>
          Xero isn&apos;t connected yet — connect it via{" "}
          <a href="/admin/settings" style={{ color: "var(--navy)", fontWeight: 700 }}>Settings</a>{" "}
          before sending a quote.
        </div>
      )}

      {error && (
        <div role="alert" style={errorStyle}>⚠ {error}</div>
      )}
    </div>
  );
}

function Row({
  label, detail, amount,
}: { label: string; detail: string; amount: string | null }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12,
      padding: "8px 0",
      borderBottom: "1px solid var(--gray-light)",
      fontSize: 14,
    }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontWeight: 600, color: "var(--navy)" }}>{label}</div>
        {detail && <div style={{ fontSize: 12, color: "var(--gray)", marginTop: 2 }}>{detail}</div>}
      </div>
      {amount !== null && (
        <div style={{ fontWeight: 600, color: "var(--navy)", whiteSpace: "nowrap" }}>{amount}</div>
      )}
    </div>
  );
}

const titleStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)", fontSize: 18, color: "var(--navy)", margin: 0,
};
const hintStyle: React.CSSProperties = {
  fontSize: 13, color: "var(--gray)", marginTop: 0, marginBottom: 16, lineHeight: 1.6,
};
const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 12,
  marginBottom: 16,
};
const fieldStyle: React.CSSProperties = {
  display: "flex", flexDirection: "column", gap: 4,
};
const breakdownStyle: React.CSSProperties = {
  background: "var(--off)", borderRadius: 10, padding: "8px 14px",
};
const totalRowStyle: React.CSSProperties = {
  display: "flex", justifyContent: "space-between",
  marginTop: 8, padding: "14px",
  background: "var(--navy)", color: "white",
  borderRadius: 8,
  fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 800,
};
const btnPrimary: React.CSSProperties = {
  padding: "10px 16px", borderRadius: 8, fontSize: 14, fontWeight: 800,
  background: "var(--navy)", color: "white", border: "none", cursor: "pointer",
};
const btnSecondary: React.CSSProperties = {
  padding: "10px 16px", borderRadius: 8, fontSize: 14, fontWeight: 700,
  background: "white", color: "var(--navy)",
  border: "1px solid rgba(0,0,0,0.15)", cursor: "pointer",
};
const sentPillStyle: React.CSSProperties = {
  fontSize: 10, fontWeight: 800, letterSpacing: "0.5px", textTransform: "uppercase",
  padding: "4px 10px", borderRadius: 999,
  background: "rgba(34,134,58,0.14)", color: "#15803D",
};
const sentBannerStyle: React.CSSProperties = {
  marginTop: 14, padding: 14,
  background: "rgba(34,134,58,0.08)",
  border: "1px solid rgba(34,134,58,0.25)",
  borderRadius: 10,
  fontSize: 13, color: "var(--navy)", lineHeight: 1.6,
};
const warningStyle: React.CSSProperties = {
  marginTop: 14, padding: 10,
  background: "rgba(255,229,0,0.18)",
  color: "#857200",
  borderRadius: 8, fontSize: 13,
};
const errorStyle: React.CSSProperties = {
  marginTop: 12, padding: 10,
  background: "rgba(220,38,38,0.10)",
  color: "#B91C1C",
  borderRadius: 8, fontSize: 13, fontWeight: 600,
};
