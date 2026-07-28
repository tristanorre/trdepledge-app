"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DAY_KEYS, DAY_LABELS, type DayKey, fmtDayShort } from "@/lib/dates";

// Pre-payroll review screen. Thomas sees a grid of paid hours per
// worker × day for the week (sourced from worker_paid_hours, which
// the roster editor populates). He can override any cell, save the
// row, then export to CSV.
//
// Why inline-edit lives here (and not just on the roster page):
//   - The roster locks in the *plan*. Real life flexes: rain-out
//     mornings, an extra emergency job, a worker leaving early. This
//     screen is for catching those after-the-fact and getting payroll
//     right before money moves.
//   - Saving here writes source='manual' so a future roster re-save
//     won't wipe the override (see worker_paid_hours upsert logic in
//     /api/admin/roster/route.ts).

type Worker = { id: string; name: string };

type Props = {
  workers: Worker[];
  weekDates: string[];                          // Mon..Sun ISO dates
  // Manual overrides keyed by `${worker_id}|${YYYY-MM-DD}`. Missing
  // entries mean "no override" — the cell falls back to clockedHours,
  // or 0 if neither exists. These stick across roster re-saves.
  initialHours: Record<string, string>;
  // Clocked hours from jobs.time_log, computed server-side and passed
  // in as the default value for cells with no manual override. Same
  // key shape as initialHours. Presence signals "worker actually
  // worked N hours that day" — Thomas/Brad review and authorise by
  // hitting Save (which converts them into manual overrides).
  clockedHours?: Record<string, string>;
};

function parseHours(raw: string): number {
  const n = parseFloat(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(24, Math.round(n * 100) / 100);
}

export default function PayrollHoursEditor({
  workers, weekDates, initialHours, clockedHours = {},
}: Props) {
  const router = useRouter();
  // Editable map keyed by `${worker_id}|${date}` (same shape as input).
  // Only holds MANUAL overrides — the clocked fallback lives in the
  // clockedHours prop (immutable).
  const [hours, setHours] = useState<Record<string, string>>(initialHours);
  // Per-worker "saving" / "saved" / "error" state — keyed by worker_id.
  const [busy, setBusy] = useState<Record<string, "saving" | "saved" | string>>({});
  const weekdayDates = weekDates.slice(0, 5); // Mon-Fri for pay-period total

  function key(workerId: string, date: string) {
    return `${workerId}|${date}`;
  }

  // Value shown in the cell. Manual override wins; otherwise fall
  // back to what the worker clocked. Both are strings so the input
  // renders identically — the ONLY distinction is visual (see the
  // `hasOverride` flag inside the render).
  function displayValue(workerId: string, date: string): string {
    const k = key(workerId, date);
    if (hours[k] !== undefined) return hours[k];
    return clockedHours[k] ?? "";
  }
  function hasOverride(workerId: string, date: string): boolean {
    return hours[key(workerId, date)] !== undefined;
  }

  function rowTotal(workerId: string, dates: string[]): number {
    return dates.reduce((sum, d) => sum + parseHours(displayValue(workerId, d)), 0);
  }

  function setCell(workerId: string, date: string, raw: string) {
    const cleaned = raw.replace(/[^\d.]/g, "");
    setHours((cur) => ({ ...cur, [key(workerId, date)]: cleaned }));
    // Clear the "saved" badge if Thomas keeps editing — confusing
    // otherwise.
    setBusy((cur) => {
      if (cur[workerId] === "saved") {
        const next = { ...cur };
        delete next[workerId];
        return next;
      }
      return cur;
    });
  }

  async function saveRow(workerId: string) {
    setBusy((cur) => ({ ...cur, [workerId]: "saving" }));
    try {
      // Save the effective value (override if present, else clocked)
      // as a manual override. Effectively means "Thomas authorised
      // these hours." If a cell shows nothing (no override, no
      // clocked), we send null → server clears any lingering row.
      const cells = weekDates.map((d) => {
        const shown = displayValue(workerId, d);
        return {
          work_date: d,
          hours: shown === "" ? null : parseHours(shown),
        };
      });
      const res = await fetch("/api/admin/paid-hours", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ worker_id: workerId, cells }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Save failed");
      setBusy((cur) => ({ ...cur, [workerId]: "saved" }));
      router.refresh();
    } catch (err) {
      setBusy((cur) => ({
        ...cur,
        [workerId]: err instanceof Error ? err.message : "Save failed",
      }));
    }
  }

  // Team-wide total: paid hours across every worker × every weekday.
  // Useful for the "what's this week's wages bill" gut-check before
  // exporting.
  const teamWeekdayTotal = workers.reduce(
    (sum, w) => sum + rowTotal(w.id, weekdayDates),
    0,
  );
  const teamFullWeekTotal = workers.reduce(
    (sum, w) => sum + rowTotal(w.id, weekDates),
    0,
  );

  if (workers.length === 0) {
    return (
      <div style={emptyStyle}>
        <div style={{ fontSize: 36, marginBottom: 8 }}>⏱</div>
        <div style={{ fontWeight: 700, color: "var(--navy)", marginBottom: 6 }}>
          No active workers.
        </div>
        <div style={{ color: "var(--gray)", fontSize: 14 }}>
          Add workers in HR before setting up payroll.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={tableWrap}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thWorker}>Worker</th>
              {weekDates.map((d, i) => (
                <th key={d} style={i < 5 ? thDay : thWeekend} title={d}>
                  <div>{DAY_LABELS[DAY_KEYS[i]]}</div>
                  <div style={{ fontSize: 9, fontWeight: 500, color: "var(--gray)", marginTop: 2 }}>
                    {fmtDayShort(d).split(" ").slice(1).join(" ")}
                  </div>
                </th>
              ))}
              <th style={thTotal}>Pay period<br /><span style={{ fontWeight: 500 }}>(Mon–Fri)</span></th>
              <th style={thSave}> </th>
            </tr>
          </thead>
          <tbody>
            {workers.map((w) => {
              const state = busy[w.id];
              const isSaving = state === "saving";
              const isSaved = state === "saved";
              const errMsg = state && state !== "saving" && state !== "saved" ? state : null;
              const total = rowTotal(w.id, weekdayDates);
              return (
                <tr key={w.id}>
                  <td style={tdWorker}>{w.name}</td>
                  {weekDates.map((d, i) => {
                    const v = displayValue(w.id, d);
                    const override = hasOverride(w.id, d);
                    const isSet = parseHours(v) > 0;
                    const isWeekend = i >= 5;
                    // Three visual states:
                    //   1. Manual override (green / yellow-on-weekend) — Thomas has authorised this value
                    //   2. Clocked pre-fill (soft blue) — worker actually clocked these hours; NOT yet authorised. Save to lock in.
                    //   3. Empty (grey off) — no clocked data, no override
                    const bg  = !isSet ? "var(--off)"
                                : override ? (isWeekend ? "#FEF3C7" : "var(--lime)")
                                : "#DBEAFE";
                    const brd = !isSet ? "rgba(0,0,0,0.06)"
                                : override ? (isWeekend ? "#FCD34D" : "var(--lime)")
                                : "#93C5FD";
                    return (
                      <td key={d} style={tdCenter}>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={v}
                          onChange={(e) => setCell(w.id, d, e.target.value)}
                          placeholder="—"
                          aria-label={`${w.name} ${DAY_LABELS[DAY_KEYS[i]]} paid hours`}
                          title={
                            !isSet ? "No hours"
                            : override ? "Authorised (manual)"
                            : "Clocked from job — save to authorise"
                          }
                          style={{
                            ...hoursInput,
                            background: bg,
                            color: isSet ? "var(--navy)" : "var(--gray)",
                            fontWeight: isSet ? 800 : 500,
                            borderColor: brd,
                          }}
                        />
                      </td>
                    );
                  })}
                  <td style={tdTotal}>
                    <span style={{
                      fontFamily: "var(--font-display)",
                      fontSize: 16,
                      color: total > 0 ? "var(--navy)" : "var(--gray)",
                    }}>
                      {total > 0 ? `${total}h` : "—"}
                    </span>
                  </td>
                  <td style={tdSave}>
                    <button
                      type="button"
                      onClick={() => saveRow(w.id)}
                      disabled={isSaving}
                      style={isSaved ? saveBtnSaved : saveBtn}
                      aria-label={`Save ${w.name}'s hours`}
                    >
                      {isSaving ? "…" : isSaved ? "✓" : "Save"}
                    </button>
                    {errMsg && (
                      <div style={{ fontSize: 10, color: "#B91C1C", marginTop: 4, maxWidth: 80 }} title={errMsg}>
                        ⚠ {errMsg.length > 18 ? errMsg.slice(0, 18) + "…" : errMsg}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            <tr>
              <td style={{ ...tdWorker, fontWeight: 800 }}>Team total</td>
              <td colSpan={5} style={tdCenter}>
                <span style={{ fontSize: 12, color: "var(--gray)" }}>Mon–Fri →</span>
              </td>
              <td colSpan={2} style={tdCenter}>
                {teamFullWeekTotal !== teamWeekdayTotal && (
                  <span style={{ fontSize: 11, color: "var(--gray)", marginRight: 8 }}>
                    weekend +{(teamFullWeekTotal - teamWeekdayTotal).toFixed(1)}h
                  </span>
                )}
              </td>
              <td style={{ ...tdTotal, fontWeight: 800 }}>
                <span style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 18,
                  color: "var(--navy)",
                }}>
                  {teamWeekdayTotal > 0 ? `${teamWeekdayTotal}h` : "—"}
                </span>
              </td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 12, fontSize: 12, color: "var(--gray)", lineHeight: 1.6, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          <LegendSwatch color="#DBEAFE" border="#93C5FD" label="Clocked from job — awaiting your Save" />
          <LegendSwatch color="var(--lime)" border="var(--lime)" label="Authorised (manual)" />
          <LegendSwatch color="#FEF3C7" border="#FCD34D" label="Weekend override" />
        </div>
        <div>
          Pay-period total (Mon–Fri) is what gets exported to Xero. Weekend hours are tracked separately and not rolled in.
          Hitting <strong>Save</strong> on a row locks the shown values in as manual overrides — re-saving the roster won&apos;t overwrite them.
        </div>
      </div>
    </div>
  );
}

const tableWrap: React.CSSProperties = {
  background: "white", borderRadius: 14,
  border: "1px solid rgba(0,0,0,0.06)",
  overflowX: "auto",
};
const tableStyle: React.CSSProperties = {
  width: "100%", borderCollapse: "collapse", minWidth: 900,
};
const thBase: React.CSSProperties = {
  fontSize: 11, fontWeight: 800, letterSpacing: "1px",
  textTransform: "uppercase", color: "var(--gray)",
  padding: "10px 8px", textAlign: "left",
  borderBottom: "1px solid var(--gray-light)",
  background: "var(--off)",
};
const thWorker: React.CSSProperties = { ...thBase, paddingLeft: 14, minWidth: 160 };
const thDay: React.CSSProperties = { ...thBase, textAlign: "center", width: 64 };
const thWeekend: React.CSSProperties = { ...thBase, textAlign: "center", width: 64, background: "#FEF7E0" };
const thTotal: React.CSSProperties = { ...thBase, textAlign: "right", width: 110, paddingRight: 12 };
const thSave: React.CSSProperties = { ...thBase, width: 80 };
const tdBase: React.CSSProperties = { padding: "10px 8px", borderBottom: "1px solid var(--gray-light)", fontSize: 14 };
const tdWorker: React.CSSProperties = { ...tdBase, paddingLeft: 14, color: "var(--navy)", fontWeight: 700 };
const tdCenter: React.CSSProperties = { ...tdBase, textAlign: "center" };
const tdTotal: React.CSSProperties = { ...tdBase, textAlign: "right", paddingRight: 12 };
const tdSave: React.CSSProperties = { ...tdBase, width: 80 };
const hoursInput: React.CSSProperties = {
  width: 52, height: 40, borderRadius: 10,
  border: "1.5px solid",
  textAlign: "center",
  fontSize: 14,
  fontFamily: "inherit",
  padding: "0 4px",
};
const saveBtn: React.CSSProperties = {
  background: "var(--navy)", color: "white",
  border: "none", borderRadius: 8,
  padding: "6px 12px", fontSize: 12, fontWeight: 800,
  cursor: "pointer", minHeight: 32, minWidth: 60,
};
const saveBtnSaved: React.CSSProperties = {
  ...saveBtn,
  background: "rgba(34,134,58,0.14)",
  color: "#15803D",
};
const emptyStyle: React.CSSProperties = {
  background: "white", borderRadius: 16, padding: 32,
  textAlign: "center", boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
};

function LegendSwatch({ color, border, label }: { color: string; border: string; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span
        aria-hidden="true"
        style={{
          display: "inline-block",
          width: 16, height: 16, borderRadius: 4,
          background: color,
          border: `1.5px solid ${border}`,
        }}
      />
      {label}
    </span>
  );
}
