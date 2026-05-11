"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Per-worker clock-in / clock-out editor for /admin/jobs/[id].
// Surfaces the (often messy) reality that workers forget to clock out,
// and gives Thomas a place to fix it before the cost feeds into Xero.
//
// "Set end to now" is the most common quick-fix; full Edit lets him
// override either time or remove the entry entirely. Breaks can also
// be reviewed, added, edited, or removed from inside the Edit view.

type Worker = { id: string; name: string; colour?: string | null };
type Break  = { start: string; end?: string };
type Entry  = { start?: string; end?: string; breaks?: Break[] };

type Props = {
  jobId: string;
  workers: Worker[];                          // assigned workers, in display order
  initialTimeLog: Record<string, Entry>;     // keyed by worker id
};

// Format an ISO timestamp into the shape <input type="datetime-local">
// wants: "YYYY-MM-DDTHH:mm" in LOCAL time. Returns "" for no value.
function toLocalInput(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate())
    + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes())
  );
}

// Convert a "datetime-local" value to an ISO UTC string. Returns null
// for empty input.
function fromLocalInput(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function fmtTime(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function fmtShortTime(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" });
}

function fmtDuration(start?: string, end?: string): string {
  if (!start) return "—";
  const startMs = new Date(start).getTime();
  const endMs   = end ? new Date(end).getTime() : Date.now();
  const mins = Math.max(0, Math.round((endMs - startMs) / 60_000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h <= 0) return `${m}m`;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

function totalBreakMinutes(breaks: Break[] | undefined): number {
  if (!breaks?.length) return 0;
  let total = 0;
  for (const b of breaks) {
    if (!b?.start) continue;
    const bs = new Date(b.start).getTime();
    const be = b.end ? new Date(b.end).getTime() : Date.now();
    if (be > bs) total += (be - bs) / 60_000;
  }
  return Math.round(total);
}

function fmtBreakTotal(mins: number): string {
  if (mins <= 0) return "0m";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h <= 0) return `${m}m`;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

export default function TimeLogEditor({ jobId, workers, initialTimeLog }: Props) {
  const router = useRouter();
  const [log, setLog] = useState<Record<string, Entry>>(initialTimeLog);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftStart, setDraftStart] = useState("");
  const [draftEnd, setDraftEnd] = useState("");
  // Draft breaks while editing. Stored as raw "datetime-local" strings so
  // the inputs work directly. Converted to ISO on save.
  const [draftBreaks, setDraftBreaks] = useState<Array<{ start: string; end: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEdit(workerId: string) {
    const e = log[workerId] ?? {};
    setDraftStart(toLocalInput(e.start));
    setDraftEnd(toLocalInput(e.end));
    setDraftBreaks(
      (e.breaks ?? []).map((b) => ({
        start: toLocalInput(b.start),
        end:   toLocalInput(b.end),
      })),
    );
    setError(null);
    setEditingId(workerId);
  }

  function cancelEdit() {
    setEditingId(null);
    setDraftStart("");
    setDraftEnd("");
    setDraftBreaks([]);
    setError(null);
  }

  async function submit(workerId: string, payload: {
    start: string | null;
    end: string | null;
    breaks?: Array<{ start: string; end: string | null }>;
  }) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/jobs/${jobId}/time`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ worker_id: workerId, ...payload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Save failed (${res.status})`);
      // Reflect the saved entry locally + ask the page to re-render so
      // the cost breakdown picks up the new time. router.refresh()
      // gets the canonical state from the server; the local update is
      // just to avoid a flash of stale UI.
      setLog((prev) => {
        const next = { ...prev };
        const clearing =
          payload.start === null &&
          payload.end === null &&
          (payload.breaks === undefined || payload.breaks.length === 0);
        if (clearing) {
          delete next[workerId];
        } else {
          next[workerId] = {
            start: payload.start ?? undefined,
            end:   payload.end   ?? undefined,
            // If breaks weren't sent, preserve existing (matches what
            // the backend does). If sent, replace.
            breaks: payload.breaks !== undefined
              ? payload.breaks.map((b) => ({
                  start: b.start,
                  end:   b.end ?? undefined,
                }))
              : prev[workerId]?.breaks,
          };
        }
        return next;
      });
      setEditingId(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(workerId: string) {
    const start = fromLocalInput(draftStart);
    const end   = fromLocalInput(draftEnd);
    // Drop blank break rows the user added but never filled in.
    const breaksPayload = draftBreaks
      .filter((b) => b.start.trim() !== "")
      .map((b) => ({
        start: fromLocalInput(b.start)!,
        end:   fromLocalInput(b.end),
      }));

    // Edge case: user cleared everything. Send a clear-entry payload
    // (omit breaks) rather than start=null/end=null/breaks=[], which
    // the backend interprets as "keep start/end, replace breaks".
    if (start === null && end === null && breaksPayload.length === 0) {
      return submit(workerId, { start: null, end: null });
    }
    return submit(workerId, { start, end, breaks: breaksPayload });
  }

  async function setEndToNow(workerId: string) {
    const e = log[workerId];
    if (!e?.start) return;
    // Don't send breaks — the backend preserves existing breaks when
    // the field is omitted.
    return submit(workerId, { start: e.start, end: new Date().toISOString() });
  }

  async function clearEntry(workerId: string) {
    if (!confirm("Remove this worker's clock-in/out from the job? They'll need to clock back in to be billed.")) {
      return;
    }
    return submit(workerId, { start: null, end: null });
  }

  function addDraftBreak() {
    setDraftBreaks((prev) => [...prev, { start: "", end: "" }]);
  }

  function removeDraftBreak(idx: number) {
    setDraftBreaks((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateDraftBreak(idx: number, field: "start" | "end", value: string) {
    setDraftBreaks((prev) =>
      prev.map((b, i) => (i === idx ? { ...b, [field]: value } : b)),
    );
  }

  return (
    <div>
      <h3 style={{ fontFamily: "var(--font-display)", fontSize: 18, color: "var(--navy)", marginBottom: 4 }}>
        Time log
      </h3>
      <p style={{ fontSize: 12, color: "var(--gray)", marginBottom: 12, lineHeight: 1.5 }}>
        Edit a worker&apos;s clock-in / clock-out times if they forgot to clock out, or to correct a typo before invoicing.
        Breaks are deducted from billable time. Saving auto-completes the job once every worker has both a start and an end.
      </p>

      {workers.length === 0 && (
        <div style={{ fontSize: 13, color: "var(--gray)" }}>No workers assigned.</div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {workers.map((w) => {
          const e = log[w.id] ?? {};
          const open = !!e.start && !e.end;
          const closed = !!e.start && !!e.end;
          const isEditing = editingId === w.id;
          const breakMins = totalBreakMinutes(e.breaks);
          const breakCount = e.breaks?.length ?? 0;
          return (
            <div key={w.id} style={rowStyle}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
                <span style={{
                  width: 10, height: 10, borderRadius: "50%",
                  background: w.colour ?? "#999", flex: "0 0 auto",
                }} />
                <span style={{ fontWeight: 700, color: "var(--navy)" }}>{w.name}</span>
                {open && <span style={pillStyle("amber")}>Still clocked in</span>}
                {closed && <span style={pillStyle("green")}>Clocked out</span>}
                {!e.start && <span style={pillStyle("grey")}>No entry</span>}
                {breakCount > 0 && (
                  <span style={pillStyle("blue")}>
                    {breakCount} break{breakCount === 1 ? "" : "s"} · {fmtBreakTotal(breakMins)}
                  </span>
                )}
              </div>

              {!isEditing ? (
                <>
                  <div style={cellStyle}>
                    <div style={cellLabel}>Start</div>
                    <div style={cellValue}>{fmtTime(e.start)}</div>
                  </div>
                  <div style={cellStyle}>
                    <div style={cellLabel}>End</div>
                    <div style={cellValue}>{fmtTime(e.end)}</div>
                  </div>
                  <div style={cellStyle}>
                    <div style={cellLabel}>On site</div>
                    <div style={cellValue}>{fmtDuration(e.start, e.end)}</div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {open && (
                      <button type="button" disabled={busy} onClick={() => setEndToNow(w.id)} style={btnAccent}>
                        Set end to now
                      </button>
                    )}
                    <button type="button" disabled={busy} onClick={() => startEdit(w.id)} style={btnGhost}>
                      Edit
                    </button>
                    {(closed || open) && (
                      <button type="button" disabled={busy} onClick={() => clearEntry(w.id)} style={btnDanger}>
                        Clear
                      </button>
                    )}
                  </div>
                  {breakCount > 0 && (
                    <div style={breaksSummary}>
                      <div style={cellLabel}>
                        Breaks ({breakCount}) — {fmtBreakTotal(breakMins)} total deducted
                      </div>
                      <ul style={breaksList}>
                        {e.breaks!.map((b, i) => (
                          <li key={i} style={breakItem}>
                            <span style={{ fontWeight: 700 }}>#{i + 1}</span>{" "}
                            {fmtShortTime(b.start)} → {b.end ? fmtShortTime(b.end) : <em>still on break</em>}
                            {b.end && <> · {fmtDuration(b.start, b.end)}</>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div style={cellStyle}>
                    <div style={cellLabel}>Start</div>
                    <input
                      type="datetime-local"
                      value={draftStart}
                      onChange={(ev) => setDraftStart(ev.target.value)}
                      style={inputStyle}
                    />
                  </div>
                  <div style={cellStyle}>
                    <div style={cellLabel}>End</div>
                    <input
                      type="datetime-local"
                      value={draftEnd}
                      onChange={(ev) => setDraftEnd(ev.target.value)}
                      style={inputStyle}
                    />
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <button type="button" disabled={busy} onClick={() => saveEdit(w.id)} style={btnPrimary}>
                      {busy ? "Saving…" : "Save"}
                    </button>
                    <button type="button" disabled={busy} onClick={cancelEdit} style={btnGhost}>
                      Cancel
                    </button>
                  </div>
                  {/* Break editor spans full row so the datetime inputs have room */}
                  <div style={breaksSummary}>
                    <div style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8,
                      marginBottom: 6, flexWrap: "wrap",
                    }}>
                      <div style={cellLabel}>
                        Breaks ({draftBreaks.length})
                      </div>
                      <button type="button" onClick={addDraftBreak} disabled={busy} style={btnGhostSmall}>
                        + Add break
                      </button>
                    </div>
                    {draftBreaks.length === 0 && (
                      <div style={{ fontSize: 12, color: "var(--gray)" }}>
                        No breaks recorded. Click &ldquo;Add break&rdquo; to log one.
                      </div>
                    )}
                    {draftBreaks.map((b, i) => (
                      <div key={i} style={breakEditRow}>
                        <span style={{
                          fontSize: 11, fontWeight: 800, color: "var(--gray)", minWidth: 28,
                        }}>
                          #{i + 1}
                        </span>
                        <input
                          type="datetime-local"
                          value={b.start}
                          onChange={(ev) => updateDraftBreak(i, "start", ev.target.value)}
                          style={inputStyle}
                          aria-label={`Break ${i + 1} start`}
                        />
                        <span style={{ color: "var(--gray)", fontSize: 12 }}>→</span>
                        <input
                          type="datetime-local"
                          value={b.end}
                          onChange={(ev) => updateDraftBreak(i, "end", ev.target.value)}
                          style={inputStyle}
                          aria-label={`Break ${i + 1} end`}
                        />
                        <button
                          type="button"
                          onClick={() => removeDraftBreak(i)}
                          disabled={busy}
                          style={btnDangerSmall}
                          aria-label={`Remove break ${i + 1}`}
                          title="Remove break"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      {error && (
        <div role="alert" style={{
          marginTop: 12, padding: 10, background: "rgba(220,38,38,0.10)",
          color: "#B91C1C", borderRadius: 8, fontSize: 13, fontWeight: 600,
        }}>
          ⚠ {error}
        </div>
      )}
    </div>
  );
}

const rowStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
  padding: "10px 12px", border: "1px solid rgba(0,0,0,0.06)",
  borderRadius: 10, background: "var(--off)",
};
const cellStyle: React.CSSProperties = {
  display: "flex", flexDirection: "column", gap: 2, minWidth: 140,
};
const cellLabel: React.CSSProperties = {
  fontSize: 11, fontWeight: 800, color: "var(--gray)", letterSpacing: "0.4px",
  textTransform: "uppercase",
};
const cellValue: React.CSSProperties = {
  fontSize: 13, color: "var(--navy)", fontWeight: 600,
};
const inputStyle: React.CSSProperties = {
  fontSize: 13, padding: "6px 8px", borderRadius: 8,
  border: "1px solid rgba(0,0,0,0.18)", background: "white", color: "var(--navy)",
  fontFamily: "inherit",
};
const btnBase: React.CSSProperties = {
  padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 800,
  cursor: "pointer", border: "none", letterSpacing: "0.3px",
};
const btnPrimary: React.CSSProperties = { ...btnBase, background: "var(--navy)", color: "white" };
const btnAccent:  React.CSSProperties = { ...btnBase, background: "var(--lime)", color: "var(--navy)" };
const btnGhost:   React.CSSProperties = { ...btnBase, background: "white", color: "var(--navy)", border: "1px solid rgba(0,0,0,0.15)" };
const btnDanger:  React.CSSProperties = { ...btnBase, background: "#FEE2E2", color: "#B91C1C", border: "1px solid #FCA5A5" };
const btnGhostSmall: React.CSSProperties = {
  ...btnBase,
  padding: "4px 10px", fontSize: 11,
  background: "white", color: "var(--navy)", border: "1px solid rgba(0,0,0,0.15)",
};
const btnDangerSmall: React.CSSProperties = {
  ...btnBase,
  padding: "2px 9px", fontSize: 16, lineHeight: 1, fontWeight: 700,
  background: "#FEE2E2", color: "#B91C1C", border: "1px solid #FCA5A5",
};
const breaksSummary: React.CSSProperties = {
  flexBasis: "100%",
  marginTop: 4,
  padding: "8px 10px",
  background: "white",
  borderRadius: 8,
  border: "1px solid rgba(0,0,0,0.06)",
};
const breaksList: React.CSSProperties = {
  margin: "4px 0 0 0", padding: 0, listStyle: "none",
  display: "flex", flexDirection: "column", gap: 2,
  fontSize: 12, color: "var(--navy)",
};
const breakItem: React.CSSProperties = {
  paddingLeft: 4,
};
const breakEditRow: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap",
  marginTop: 6,
};

function pillStyle(kind: "green" | "amber" | "grey" | "blue"): React.CSSProperties {
  const palette = {
    green: { bg: "rgba(34,134,58,0.14)", fg: "#15803D" },
    amber: { bg: "rgba(255,229,0,0.18)", fg: "#857200" },
    grey:  { bg: "rgba(0,0,0,0.06)",     fg: "var(--gray)" },
    blue:  { bg: "rgba(26,79,181,0.12)", fg: "#1A4FB5" },
  }[kind];
  return {
    fontSize: 10, fontWeight: 800, letterSpacing: "0.4px",
    textTransform: "uppercase",
    padding: "3px 8px", borderRadius: 999,
    background: palette.bg, color: palette.fg,
  };
}
