"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Per-worker time editor for /admin/jobs/[id].
//
// A worker can have MULTIPLE sessions on a single job (leave to
// attend another job and come back). This component renders every
// session per worker, with Edit / Delete on each and an "Add
// session" button per worker. Saving a session sends the whole
// worker's `sessions[]` to the API, which replaces atomically.

type Worker = { id: string; name: string; colour?: string | null };
type BreakEntry = { start: string; end?: string };
type Session = { start?: string; end?: string; breaks?: BreakEntry[] };

type Props = {
  jobId: string;
  workers: Worker[];
  // Raw shape from jsonb — per-worker value is either a legacy
  // Session object or a Session[]. Passed through as `unknown` and
  // normalised via `normaliseSessions()`.
  initialTimeLog: Record<string, unknown>;
};

function normaliseSessions(v: unknown): Session[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.filter((s): s is Session => !!s && typeof s === "object");
  if (typeof v === "object" && "start" in (v as object)) return [v as Session];
  return [];
}

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
    weekday: "short", day: "numeric", month: "short",
    hour: "numeric", minute: "2-digit",
  });
}
function fmtShortTime(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" });
}

function totalBreakMinutes(breaks: BreakEntry[] | undefined): number {
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

// Net on-site duration for a single session (matches cost engine).
function fmtNetSession(s: Session | undefined): string {
  if (!s?.start) return "—";
  const startMs = new Date(s.start).getTime();
  const endMs   = s.end ? new Date(s.end).getTime() : Date.now();
  const grossMins = Math.max(0, (endMs - startMs) / 60_000);
  const breakMins = totalBreakMinutes(s.breaks);
  const mins = Math.max(0, Math.round(grossMins - breakMins));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h <= 0) return `${m}m`;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}
function workerTotalNet(sessions: Session[]): number {
  let total = 0;
  for (const s of sessions) {
    if (!s.start) continue;
    const startMs = new Date(s.start).getTime();
    const endMs   = s.end ? new Date(s.end).getTime() : Date.now();
    total += Math.max(0, (endMs - startMs) / 60_000) - totalBreakMinutes(s.breaks);
  }
  return Math.round(Math.max(0, total));
}

type EditKey = { workerId: string; sessionIndex: number } | null;
type Draft = {
  start: string;                                    // datetime-local
  end: string;
  breaks: Array<{ start: string; end: string }>;    // datetime-local strings
};

export default function TimeLogEditor({ jobId, workers, initialTimeLog }: Props) {
  const router = useRouter();

  // State keyed by worker id — sessions array per worker.
  const [log, setLog] = useState<Record<string, Session[]>>(() => {
    const out: Record<string, Session[]> = {};
    for (const [wid, v] of Object.entries(initialTimeLog ?? {})) {
      out[wid] = normaliseSessions(v);
    }
    return out;
  });
  const [editing, setEditing] = useState<EditKey>(null);
  const [draft, setDraft] = useState<Draft>({ start: "", end: "", breaks: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function draftFromSession(s: Session | undefined): Draft {
    return {
      start: toLocalInput(s?.start),
      end:   toLocalInput(s?.end),
      breaks: (s?.breaks ?? []).map((b) => ({
        start: toLocalInput(b.start),
        end:   toLocalInput(b.end),
      })),
    };
  }

  function startEdit(workerId: string, sessionIndex: number) {
    const sessions = log[workerId] ?? [];
    const target = sessions[sessionIndex];
    setDraft(draftFromSession(target));
    setError(null);
    setEditing({ workerId, sessionIndex });
  }

  function cancelEdit() {
    setEditing(null);
    setDraft({ start: "", end: "", breaks: [] });
    setError(null);
  }

  async function sendSessions(workerId: string, sessions: Session[] | null) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/jobs/${jobId}/time`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ worker_id: workerId, sessions }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Save failed (${res.status})`);
      setLog((prev) => {
        const next = { ...prev };
        if (sessions === null || sessions.length === 0) {
          delete next[workerId];
        } else {
          next[workerId] = sessions;
        }
        return next;
      });
      setEditing(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  function draftToSession(): Session | { error: string } {
    const start = fromLocalInput(draft.start);
    if (!start) return { error: "Start time is required" };
    const end = fromLocalInput(draft.end);
    if (end && new Date(end).getTime() <= new Date(start).getTime()) {
      return { error: "End must be after start" };
    }
    const breaks: BreakEntry[] = [];
    for (const b of draft.breaks) {
      if (!b.start.trim()) continue;
      const bs = fromLocalInput(b.start);
      if (!bs) return { error: "A break has an invalid start" };
      const be = fromLocalInput(b.end);
      if (be && new Date(be).getTime() <= new Date(bs).getTime()) {
        return { error: "A break has end ≤ start" };
      }
      const out: BreakEntry = { start: bs };
      if (be) out.end = be;
      breaks.push(out);
    }
    const s: Session = { start };
    if (end) s.end = end;
    if (breaks.length > 0) s.breaks = breaks;
    return s;
  }

  async function saveEdit() {
    if (!editing) return;
    const built = draftToSession();
    if ("error" in built) { setError(built.error); return; }

    const current = log[editing.workerId] ?? [];
    const nextSessions = [...current];
    nextSessions[editing.sessionIndex] = built;
    // Sort by start so a deliberately-added earlier session lands in
    // the right place. Overlap validation is enforced server-side.
    nextSessions.sort((a, b) => {
      const as = a.start ? Date.parse(a.start) : 0;
      const bs = b.start ? Date.parse(b.start) : 0;
      return as - bs;
    });
    return sendSessions(editing.workerId, nextSessions);
  }

  async function deleteSession(workerId: string, sessionIndex: number) {
    if (!confirm("Remove this session? The worker will not be billed for this session's time.")) return;
    const current = log[workerId] ?? [];
    const nextSessions = current.filter((_, i) => i !== sessionIndex);
    return sendSessions(workerId, nextSessions.length === 0 ? null : nextSessions);
  }

  function addSession(workerId: string) {
    const current = log[workerId] ?? [];
    // Append a fresh empty session and put it into edit mode.
    const nextSessions: Session[] = [...current, {}];
    setLog((prev) => ({ ...prev, [workerId]: nextSessions }));
    setDraft({ start: "", end: "", breaks: [] });
    setError(null);
    setEditing({ workerId, sessionIndex: nextSessions.length - 1 });
  }

  function addDraftBreak() {
    setDraft((prev) => ({ ...prev, breaks: [...prev.breaks, { start: "", end: "" }] }));
  }
  function removeDraftBreak(idx: number) {
    setDraft((prev) => ({ ...prev, breaks: prev.breaks.filter((_, i) => i !== idx) }));
  }
  function updateDraftBreak(idx: number, field: "start" | "end", value: string) {
    setDraft((prev) => ({
      ...prev,
      breaks: prev.breaks.map((b, i) => (i === idx ? { ...b, [field]: value } : b)),
    }));
  }

  return (
    <div>
      <h3 style={{ fontFamily: "var(--font-display)", fontSize: 18, color: "var(--navy)", marginBottom: 4 }}>
        Time log
      </h3>
      <p style={{ fontSize: 12, color: "var(--gray)", marginBottom: 12, lineHeight: 1.5 }}>
        Workers can have multiple sessions per job — clock in, leave for another job, come back later.
        Edit any session to fix a missed clock-out, or add a session if it was recorded manually.
        Breaks are deducted from billable time. The job auto-completes once every worker has at least one session and no session is still open.
      </p>

      {workers.length === 0 && (
        <div style={{ fontSize: 13, color: "var(--gray)" }}>No workers assigned.</div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {workers.map((w) => {
          const sessions = log[w.id] ?? [];
          const anyOpen = sessions.some((s) => !!s.start && !s.end);
          const netMins = workerTotalNet(sessions);
          return (
            <div key={w.id} style={workerCardStyle}>
              <div style={workerHeaderStyle}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{
                    width: 10, height: 10, borderRadius: "50%",
                    background: w.colour ?? "#999",
                  }} />
                  <span style={{ fontWeight: 800, color: "var(--navy)", fontSize: 14 }}>{w.name}</span>
                  {sessions.length === 0 && <span style={pillStyle("grey")}>No sessions</span>}
                  {sessions.length > 0 && anyOpen && <span style={pillStyle("amber")}>Clocked in</span>}
                  {sessions.length > 0 && !anyOpen && <span style={pillStyle("green")}>Clocked out</span>}
                  {sessions.length > 1 && <span style={pillStyle("blue")}>{sessions.length} sessions</span>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 12, color: "var(--gray)" }}>
                    Total: <strong style={{ color: "var(--navy)" }}>{fmtBreakTotal(netMins)}</strong>
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => addSession(w.id)}
                    style={btnGhostSmall}
                  >
                    + Add session
                  </button>
                </div>
              </div>

              {sessions.length === 0 ? (
                <div style={{ fontSize: 12, color: "var(--gray)", padding: "8px 4px" }}>
                  No sessions recorded. Click <strong>Add session</strong> to enter one manually.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {sessions.map((s, idx) => {
                    const isEditing = editing?.workerId === w.id && editing.sessionIndex === idx;
                    const isOpen = !!s.start && !s.end;
                    const breakMins = totalBreakMinutes(s.breaks);
                    const breakCount = s.breaks?.length ?? 0;

                    if (isEditing) {
                      return (
                        <div key={idx} style={sessionEditingStyle}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <span style={sessionNoStyle}>#{idx + 1}</span>
                            <div style={cellStyle}>
                              <div style={cellLabel}>Start</div>
                              <input
                                type="datetime-local"
                                value={draft.start}
                                onChange={(ev) => setDraft((p) => ({ ...p, start: ev.target.value }))}
                                style={inputStyle}
                                aria-label="Session start"
                              />
                            </div>
                            <div style={cellStyle}>
                              <div style={cellLabel}>End</div>
                              <input
                                type="datetime-local"
                                value={draft.end}
                                onChange={(ev) => setDraft((p) => ({ ...p, end: ev.target.value }))}
                                style={inputStyle}
                                aria-label="Session end"
                              />
                            </div>
                            <div style={{ display: "flex", gap: 6 }}>
                              <button type="button" disabled={busy} onClick={saveEdit} style={btnPrimary}>
                                {busy ? "Saving…" : "Save"}
                              </button>
                              <button type="button" disabled={busy} onClick={cancelEdit} style={btnGhost}>
                                Cancel
                              </button>
                            </div>
                          </div>

                          <div style={breaksEditor}>
                            <div style={{
                              display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8,
                              marginBottom: 6, flexWrap: "wrap",
                            }}>
                              <div style={cellLabel}>Breaks ({draft.breaks.length})</div>
                              <button type="button" onClick={addDraftBreak} disabled={busy} style={btnGhostSmall}>
                                + Add break
                              </button>
                            </div>
                            {draft.breaks.length === 0 && (
                              <div style={{ fontSize: 12, color: "var(--gray)" }}>
                                No breaks in this session.
                              </div>
                            )}
                            {draft.breaks.map((b, i) => (
                              <div key={i} style={breakEditRow}>
                                <span style={{ fontSize: 11, fontWeight: 800, color: "var(--gray)", minWidth: 28 }}>#{i + 1}</span>
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
                        </div>
                      );
                    }

                    return (
                      <div key={idx} style={sessionRowStyle}>
                        <span style={sessionNoStyle}>#{idx + 1}</span>
                        <div style={cellStyle}>
                          <div style={cellLabel}>Start</div>
                          <div style={cellValue}>{fmtTime(s.start)}</div>
                        </div>
                        <div style={cellStyle}>
                          <div style={cellLabel}>End</div>
                          <div style={cellValue}>
                            {isOpen ? <em style={{ color: "#B58500" }}>still clocked in</em> : fmtTime(s.end)}
                          </div>
                        </div>
                        <div style={cellStyle}>
                          <div style={cellLabel}>On site (net)</div>
                          <div style={cellValue} title="End minus start minus break minutes — matches billing.">
                            {fmtNetSession(s)}
                          </div>
                        </div>
                        {breakCount > 0 && (
                          <div style={cellStyle}>
                            <div style={cellLabel}>Breaks</div>
                            <div style={cellValue}>
                              {breakCount} · {fmtBreakTotal(breakMins)}
                            </div>
                          </div>
                        )}
                        <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
                          <button type="button" disabled={busy} onClick={() => startEdit(w.id, idx)} style={btnGhostSmall}>
                            Edit
                          </button>
                          <button type="button" disabled={busy} onClick={() => deleteSession(w.id, idx)} style={btnDangerSmall}>
                            ×
                          </button>
                        </div>
                        {breakCount > 0 && (
                          <div style={breaksSummary}>
                            <ul style={breaksList}>
                              {s.breaks!.map((b, i) => (
                                <li key={i} style={breakItem}>
                                  <span style={{ fontWeight: 700 }}>#{i + 1}</span>{" "}
                                  {fmtShortTime(b.start)} → {b.end ? fmtShortTime(b.end) : <em>still on break</em>}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
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

const workerCardStyle: React.CSSProperties = {
  padding: 12,
  border: "1px solid rgba(0,0,0,0.08)",
  borderRadius: 10,
  background: "var(--off)",
};
const workerHeaderStyle: React.CSSProperties = {
  display: "flex", justifyContent: "space-between", alignItems: "center",
  gap: 12, marginBottom: 8, flexWrap: "wrap",
};
const sessionRowStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
  padding: "8px 10px", background: "white",
  border: "1px solid rgba(0,0,0,0.06)", borderRadius: 8,
};
const sessionEditingStyle: React.CSSProperties = {
  padding: "10px 12px", background: "white",
  border: "1.5px solid var(--navy)", borderRadius: 8,
};
const sessionNoStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 800, color: "var(--gray)",
  background: "rgba(0,0,0,0.05)", padding: "2px 8px", borderRadius: 999,
  minWidth: 28, textAlign: "center",
};
const cellStyle: React.CSSProperties = {
  display: "flex", flexDirection: "column", gap: 2, minWidth: 140,
};
const cellLabel: React.CSSProperties = {
  fontSize: 10, fontWeight: 800, color: "var(--gray)", letterSpacing: "0.4px",
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
const btnGhost: React.CSSProperties = { ...btnBase, background: "white", color: "var(--navy)", border: "1px solid rgba(0,0,0,0.15)" };
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
const breaksEditor: React.CSSProperties = {
  marginTop: 10, padding: "8px 10px",
  background: "var(--off)", borderRadius: 8,
};
const breaksSummary: React.CSSProperties = {
  flexBasis: "100%",
  marginTop: 6, padding: "6px 10px",
  background: "var(--off)", borderRadius: 8,
};
const breaksList: React.CSSProperties = {
  margin: 0, padding: 0, listStyle: "none",
  display: "flex", flexDirection: "column", gap: 2,
  fontSize: 11, color: "var(--navy)",
};
const breakItem: React.CSSProperties = { paddingLeft: 4 };
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
