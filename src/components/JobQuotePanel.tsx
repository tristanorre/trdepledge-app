"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { fmtMoney } from "@/lib/cost";
import type { Job } from "@/lib/types";

// Quote-prep card shown on /admin/jobs/[id] when the job is in
// `pending_review` status. Thomas:
//   1. Enters hours-per-worker + worker count
//   2. Sees the labour estimate update live
//   3. Adds materials (separately, via the existing materials panel)
//   4. Reviews the total + edits any line descriptions in the preview table
//   5. Clicks Send Quote to Xero
//
// Materials + rate are passed in from the server-rendered page so
// this card reflects the same numbers Thomas sees in the Materials
// section above. The preview lines are computed CLIENT-SIDE (labour
// derives from live hoursPerWorker × workerCount) and mirror what the
// server's buildLineItems() will emit — critical that they stay in
// sync with src/lib/xero-invoice.ts.

// Shape of each material line passed in — matches CostBreakdown.material_lines.
type MaterialLine = {
  name: string;
  qty: number;
  markup_percent: number;
  line_total_cents: number;
};

type Props = {
  job: Job;
  // Individual material lines — used to render editable preview
  // descriptions per material item.
  materials: MaterialLine[];
  // Sum of all material line totals (after markup), in cents. Computed
  // server-side from the same materials data the page uses elsewhere.
  materialsCents: number;
  // Hourly rate for the job's client type, in cents. From getRates().
  rateCents: number;
  // Connection state — if false, the Send button is disabled with a
  // hint to connect Xero first via /admin/settings.
  xeroConnected: boolean;
};

// Builds the same preview line items the server will emit — MUST
// stay aligned with buildLineItems() in src/lib/xero-invoice.ts. If
// that function changes labour wording, aged-care suffix rules, or
// materials formatting, update this too or the preview and the sent
// quote will disagree.
function buildQuotePreview(args: {
  clientType: string;
  hoursPerWorker: number;
  workerCount: number;
  rateCents: number;
  materials: MaterialLine[];
}): Array<{ description: string; qty: string; unit: string; total: string }> {
  const { clientType, hoursPerWorker, workerCount, rateCents, materials } = args;
  const isNdis = clientType === "NDIS";
  const isAged = clientType === "Aged Care";
  const lines: Array<{ description: string; qty: string; unit: string; total: string }> = [];

  const totalWorkerHours = hoursPerWorker * workerCount;
  const labourCents = Math.round(totalWorkerHours * rateCents);
  if (labourCents > 0) {
    const workerSuffix = workerCount > 1 ? ` (${workerCount} workers)` : "";
    lines.push({
      description: isNdis
        ? `NDIS support — labour${workerSuffix}`
        : `Garden / yard work — labour${workerSuffix}`,
      qty: (Math.round(totalWorkerHours * 1000) / 1000).toString(),
      unit: fmtMoney(rateCents),
      total: fmtMoney(labourCents),
    });
  }

  for (const m of materials) {
    const unitCents = m.qty > 0 ? Math.round(m.line_total_cents / m.qty) : 0;
    lines.push({
      description: `${m.name}${m.markup_percent ? ` (incl ${m.markup_percent}% markup)` : ""}`,
      qty: (Math.round(m.qty * 1000) / 1000).toString(),
      unit: fmtMoney(unitCents),
      total: fmtMoney(m.line_total_cents),
    });
  }

  if (isAged && lines.length > 0) {
    lines[0].description += " · Aged Care";
  }
  return lines;
}

export default function JobQuotePanel({
  job, materials, materialsCents, rateCents, xeroConnected,
}: Props) {
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

  // Preview lines rebuild whenever labour inputs or materials change.
  // These are the DEFAULT descriptions — user edits (below) win over them.
  const previewLines = useMemo(
    () => buildQuotePreview({
      clientType: job.client_type,
      hoursPerWorker: validEstimate ? parsedHours : 0,
      workerCount: validEstimate ? parsedWorkers : 0,
      rateCents,
      materials,
    }),
    [job.client_type, parsedHours, parsedWorkers, rateCents, materials, validEstimate],
  );

  // Description edits keyed by line INDEX. When the underlying line
  // shape changes (materials added, worker count flips singular/
  // plural), we prune stale keys so the map doesn't hold overrides
  // for lines that no longer exist.
  const [overrides, setOverrides] = useState<Record<number, string>>({});
  const previousLineCountRef = useRef(previewLines.length);
  useEffect(() => {
    if (previousLineCountRef.current !== previewLines.length) {
      setOverrides({});
      previousLineCountRef.current = previewLines.length;
    }
  }, [previewLines.length]);

  function updateDescription(idx: number, value: string) {
    setOverrides((prev) => ({ ...prev, [idx]: value }));
  }
  function descriptionFor(idx: number): string {
    return overrides[idx] ?? previewLines[idx]?.description ?? "";
  }

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
    if (!confirm(
      `Approve this quote and send to Xero for ${fmtMoney(estimate.totalCents)}?\n\n` +
      `After you click OK, it lands in Xero as a DRAFT. You'll then need to open Xero\n` +
      `and click Send there — Xero emails the quote PDF to the customer at that point,\n` +
      `not before.`,
    )) {
      return;
    }
    // Save first so the PATCH-then-send is atomic from Thomas's POV.
    const saved = await saveEstimate();
    if (!saved) return;

    setBusy("send");
    setError(null);
    try {
      // Send the resolved descriptions (overrides merged with defaults)
      // so Xero receives whatever's currently on-screen in the preview.
      const lineDescriptions = previewLines.map((_, i) => descriptionFor(i));
      const res = await fetch(`/api/admin/jobs/${job.id}/xero-quote`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ line_descriptions: lineDescriptions }),
      });
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

      {!alreadySent && validEstimate && previewLines.length > 0 && (
        <div style={previewWrapStyle}>
          <div style={reviewNoteStyle}>
            <strong>Review this quote before it goes to Xero.</strong> Edit any description
            below. Qty + pricing come from the estimate + materials above.
            <div style={{ marginTop: 6, color: "var(--gray)" }}>
              Two-step approval: <strong>Approve here</strong> to land it in Xero as a draft,
              then <strong>Send inside Xero</strong> — that's the step that emails the quote
              to the customer.
            </div>
          </div>
          <div style={previewHeaderStyle}>
            Quote lines going to Xero — edit any description before sending
          </div>
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, textAlign: "left" }}>Description</th>
                  <th style={{ ...thStyle, textAlign: "right", width: 70 }}>Qty</th>
                  <th style={{ ...thStyle, textAlign: "right", width: 80 }}>Unit</th>
                  <th style={{ ...thStyle, textAlign: "right", width: 80 }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {previewLines.map((line, i) => (
                  <tr key={i}>
                    <td style={tdStyle}>
                      <input
                        type="text"
                        value={descriptionFor(i)}
                        onChange={(e) => updateDescription(i, e.target.value)}
                        disabled={busy !== null}
                        aria-label={`Description for quote line ${i + 1}`}
                        style={previewInputStyle}
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
          <div style={previewHintStyle}>
            Qty and pricing come from the labour estimate + materials above.
            Change those to update the numbers.
          </div>
        </div>
      )}

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
            {busy === "send" ? "Sending…" : "Approve & Send Quote to Xero →"}
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

// Preview table (mirrors the SendToXeroButton styling for consistency
// across the invoice + quote flows).
const previewWrapStyle: React.CSSProperties = {
  marginTop: 16,
};
const reviewNoteStyle: React.CSSProperties = {
  padding: "10px 12px",
  background: "rgba(255,229,0,0.14)",
  border: "1px solid rgba(133,114,0,0.18)",
  borderRadius: 8,
  fontSize: 12, color: "var(--navy)",
  marginBottom: 12, lineHeight: 1.5,
};
const previewHeaderStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 800, color: "var(--gray)",
  letterSpacing: "0.5px", textTransform: "uppercase",
  marginBottom: 8,
};
const previewHintStyle: React.CSSProperties = {
  fontSize: 12, color: "var(--gray)", marginTop: 8, lineHeight: 1.5,
};
const tableWrapStyle: React.CSSProperties = {
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
const previewInputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 10px",
  fontSize: 13, fontFamily: "inherit",
  border: "1.5px solid rgba(0,0,0,0.15)",
  borderRadius: 8,
  background: "white", color: "var(--navy)",
  boxSizing: "border-box",
};
