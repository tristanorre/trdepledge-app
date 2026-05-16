"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState } from "react";
import {
  DAY_KEYS, DAY_LABELS, addDaysISO, fmtWeekRange, mondayOfWeek,
  type DayKey,
} from "@/lib/dates";
import type { WorkerListEntry } from "@/lib/types";
import type { RosterRow } from "@/lib/schedule";

type Props = {
  weekStart: string;
  workers: WorkerListEntry[];
  initialRows: RosterRow[];
  // Previous-week rows, used by the "Copy from last week" shortcut.
  // Empty array if there's nothing to copy.
  previousWeekRows: RosterRow[];
  // Per-day paid hours already saved for this week, keyed by
  // `${worker_id}|${day_key}`. Empty string means not rostered for
  // that day; any positive number is the paid hours figure.
  initialPaidHours: Record<string, string>;
  previousPaidHours: Record<string, string>;
};

type Editable = {
  worker_id: string;
  // Per-day paid hours as string (raw input). Parsed at save time.
  // "" / "0" / undefined = not rostered. > 0 = rostered for that many
  // hours, which is the figure that lands on payroll.
  daily_hours: Record<DayKey, string>;
  start_time: string;
  end_time: string;
};

function emptyHours(): Record<DayKey, string> {
  return { mon: "", tue: "", wed: "", thu: "", fri: "", sat: "", sun: "" };
}

function parseHours(raw: string): number {
  const n = parseFloat(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  // Cap at 24h/day and round to one decimal for storage cleanliness.
  return Math.min(24, Math.round(n * 10) / 10);
}

function weekTotal(daily: Record<DayKey, string>): number {
  return DAY_KEYS.reduce((sum, d) => sum + parseHours(daily[d] ?? ""), 0);
}

export default function RosterEditor({
  weekStart,
  workers,
  initialRows,
  previousWeekRows,
  initialPaidHours,
  previousPaidHours,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const initialMap = new Map(initialRows.map((r) => [r.worker_id, r]));

  // Build initial daily_hours from the saved paid-hours map. If a
  // worker has a `days` entry but no paid-hours row (legacy data
  // from before this feature shipped), we leave the hours blank so
  // Thomas sees a clear "needs to be filled in" gap.
  function buildDailyHours(workerId: string, hoursMap: Record<string, string>): Record<DayKey, string> {
    const out = emptyHours();
    for (const d of DAY_KEYS) {
      const v = hoursMap[`${workerId}|${d}`];
      if (v) out[d] = v;
    }
    return out;
  }

  const [rows, setRows] = useState<Editable[]>(() =>
    workers.map((w) => {
      const r = initialMap.get(w.id);
      return {
        worker_id: w.id,
        daily_hours: buildDailyHours(w.id, initialPaidHours),
        start_time: r?.start_time ?? "07:00",
        end_time: r?.end_time ?? "17:00",
      };
    }),
  );

  function copyFromLastWeek() {
    if (previousWeekRows.length === 0 && Object.keys(previousPaidHours).length === 0) return;
    if (
      (initialRows.length > 0 || Object.keys(initialPaidHours).length > 0) &&
      !confirm("Replace this week's roster with last week's? Unsaved changes will be lost.")
    ) return;
    const prevMap = new Map(previousWeekRows.map((r) => [r.worker_id, r]));
    setRows(workers.map((w) => {
      const r = prevMap.get(w.id);
      return {
        worker_id: w.id,
        daily_hours: buildDailyHours(w.id, previousPaidHours),
        start_time: r?.start_time ?? "07:00",
        end_time: r?.end_time ?? "17:00",
      };
    }));
  }

  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  function gotoWeek(monday: string) {
    const next = new URLSearchParams(params);
    next.set("week_start", mondayOfWeek(monday));
    router.push(`${pathname}?${next.toString()}`);
  }

  function setDayHours(workerId: string, day: DayKey, value: string) {
    setRows((cur) => cur.map((r) => {
      if (r.worker_id !== workerId) return r;
      // Light input sanitisation — strip non-numeric chars on the way in
      // so paste of "7.5h" still becomes "7.5". Empty allowed.
      const cleaned = value.replace(/[^\d.]/g, "");
      return { ...r, daily_hours: { ...r.daily_hours, [day]: cleaned } };
    }));
  }

  function setTime(workerId: string, key: "start_time" | "end_time", value: string) {
    setRows((cur) => cur.map((r) => r.worker_id === workerId ? { ...r, [key]: value } : r));
  }

  // Helpful default: when Thomas sets a worker's start/end times, give
  // him a "Fill 8h × 5" shortcut to set Mon-Fri to 8h each.
  function fillWeekdaysWith(workerId: string, hours: number) {
    setRows((cur) => cur.map((r) => {
      if (r.worker_id !== workerId) return r;
      const next: Record<DayKey, string> = { ...r.daily_hours };
      for (const d of ["mon", "tue", "wed", "thu", "fri"] as DayKey[]) {
        next[d] = String(hours);
      }
      return { ...r, daily_hours: next };
    }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        week_start: weekStart,
        rows: rows.map((r) => {
          // Days array stays as the set of days with paid_hours > 0 —
          // keeps the time-allocation board + worker schedule
          // backward-compatible.
          const activeDays = DAY_KEYS.filter((d) => parseHours(r.daily_hours[d]) > 0);
          // Paid hours: send the parsed numeric value so the API doesn't
          // have to re-validate strings.
          const daily_hours = DAY_KEYS.reduce<Record<string, number>>((acc, d) => {
            const h = parseHours(r.daily_hours[d]);
            if (h > 0) acc[d] = h;
            return acc;
          }, {});
          return {
            worker_id: r.worker_id,
            days: activeDays,
            daily_hours,
            start_time: r.start_time || null,
            end_time: r.end_time || null,
          };
        }),
      };
      const res = await fetch("/api/admin/roster", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save");
      setSavedAt(new Date());
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  // Aggregate: total paid hours across the team for the visible week.
  // Useful for at-a-glance "how much labour are we paying for this week"
  // before payroll runs.
  const teamTotal = rows.reduce((sum, r) => sum + weekTotal(r.daily_hours), 0);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 22, color: "var(--navy)" }}>
            Week of {fmtWeekRange(weekStart)}
          </div>
          {savedAt && (
            <div style={{ fontSize: 12, color: "var(--gray)", marginTop: 4 }}>
              Saved {savedAt.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })}
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {(previousWeekRows.length > 0 || Object.keys(previousPaidHours).length > 0) && (
            <button
              type="button"
              onClick={copyFromLastWeek}
              style={navBtn}
              title="Replace this week's roster with last week's"
            >
              ↺ Copy last week
            </button>
          )}
          <button type="button" onClick={() => gotoWeek(addDaysISO(weekStart, -7))} style={navBtn} aria-label="Previous week">‹ Week</button>
          <button type="button" onClick={() => gotoWeek(addDaysISO(weekStart,  7))} style={navBtn} aria-label="Next week">Week ›</button>
        </div>
      </div>

      <div style={tableWrap}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thWorker}>Worker</th>
              {DAY_KEYS.map((d) => (
                <th key={d} style={thDay}>{DAY_LABELS[d]}</th>
              ))}
              <th style={thTotal}>Total</th>
              <th style={thTime}>Start</th>
              <th style={thTime}>End</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={DAY_KEYS.length + 4} style={{ padding: 24, color: "var(--gray)", textAlign: "center" }}>No active workers.</td></tr>
            )}
            {rows.map((r) => {
              const w = workers.find((x) => x.id === r.worker_id)!;
              const total = weekTotal(r.daily_hours);
              return (
                <tr key={r.worker_id}>
                  <td style={tdWorker}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 10, height: 10, borderRadius: "50%", background: w.colour, flexShrink: 0 }} />
                      {w.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => fillWeekdaysWith(r.worker_id, 8)}
                      style={fillBtn}
                      title="Fill Mon-Fri with 8h each"
                    >
                      8h × 5
                    </button>
                  </td>
                  {DAY_KEYS.map((d) => {
                    const val = r.daily_hours[d];
                    const isSet = parseHours(val) > 0;
                    return (
                      <td key={d} style={tdCenter}>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={val}
                          onChange={(e) => setDayHours(r.worker_id, d, e.target.value)}
                          placeholder="—"
                          aria-label={`${w.name} ${DAY_LABELS[d]} paid hours`}
                          style={{
                            ...hoursInput,
                            background: isSet ? "var(--lime)" : "var(--off)",
                            color: isSet ? "var(--navy)" : "var(--gray)",
                            fontWeight: isSet ? 800 : 500,
                            borderColor: isSet ? "var(--lime)" : "rgba(0,0,0,0.06)",
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
                  <td style={tdTime}>
                    <input
                      type="time"
                      value={r.start_time}
                      onChange={(e) => setTime(r.worker_id, "start_time", e.target.value)}
                      style={timeInput}
                    />
                  </td>
                  <td style={tdTime}>
                    <input
                      type="time"
                      value={r.end_time}
                      onChange={(e) => setTime(r.worker_id, "end_time", e.target.value)}
                      style={timeInput}
                    />
                  </td>
                </tr>
              );
            })}
            {rows.length > 0 && (
              <tr>
                <td style={{ ...tdWorker, fontWeight: 800 }}>Team total</td>
                <td colSpan={DAY_KEYS.length} />
                <td style={{ ...tdTotal, fontWeight: 800 }}>
                  <span style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 18,
                    color: "var(--navy)",
                  }}>
                    {teamTotal > 0 ? `${teamTotal}h` : "—"}
                  </span>
                </td>
                <td colSpan={2} />
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 12, color: "var(--gray)", lineHeight: 1.5, maxWidth: 540 }}>
          Type paid hours into each day (e.g. <strong>8</strong>, <strong>7.5</strong>). Empty = not rostered. The total drives payroll — edit it
          again on the <strong>Payroll</strong> page after a rained-out day or extra job, before exporting to Xero.
        </div>
        <button type="button" onClick={save} disabled={saving} className="form-submit" style={{ marginTop: 0, width: "auto", paddingLeft: 24, paddingRight: 24 }}>
          {saving ? "Saving…" : "Save roster"}
        </button>
      </div>

      {error && <div className="form-error" role="alert" style={{ marginTop: 8 }}>⚠ {error}</div>}
    </div>
  );
}

const tableWrap: React.CSSProperties = {
  background: "white", borderRadius: 14,
  border: "1px solid rgba(0,0,0,0.06)",
  overflowX: "auto",
};
const tableStyle: React.CSSProperties = {
  width: "100%", borderCollapse: "collapse",
  minWidth: 820,
};
const thBase: React.CSSProperties = {
  fontSize: 11, fontWeight: 800, letterSpacing: "1px",
  textTransform: "uppercase", color: "var(--gray)",
  padding: "12px 8px", textAlign: "left",
  borderBottom: "1px solid var(--gray-light)",
  background: "var(--off)",
};
const thWorker: React.CSSProperties = { ...thBase, paddingLeft: 14, minWidth: 180 };
const thDay: React.CSSProperties = { ...thBase, textAlign: "center", width: 64 };
const thTotal: React.CSSProperties = { ...thBase, textAlign: "right", width: 80, paddingRight: 14 };
const thTime: React.CSSProperties = { ...thBase, width: 100 };
const tdBase: React.CSSProperties = { padding: "10px 8px", borderBottom: "1px solid var(--gray-light)", fontSize: 14 };
const tdWorker: React.CSSProperties = { ...tdBase, paddingLeft: 14, color: "var(--navy)", fontWeight: 700 };
const tdCenter: React.CSSProperties = { ...tdBase, textAlign: "center" };
const tdTotal: React.CSSProperties = { ...tdBase, textAlign: "right", paddingRight: 14 };
const tdTime: React.CSSProperties = { ...tdBase };
const hoursInput: React.CSSProperties = {
  width: 52, height: 40, borderRadius: 10,
  border: "1.5px solid",
  textAlign: "center",
  fontSize: 14,
  fontFamily: "inherit",
  padding: "0 4px",
};
const timeInput: React.CSSProperties = {
  width: 100, padding: "8px 10px",
  border: "1.5px solid var(--gray-light)", borderRadius: 8,
  fontSize: 14,
};
const navBtn: React.CSSProperties = {
  background: "var(--off)", color: "var(--navy)",
  border: "none", borderRadius: 8,
  padding: "8px 12px", fontSize: 13, fontWeight: 700,
  cursor: "pointer", minHeight: 36,
};
const fillBtn: React.CSSProperties = {
  background: "transparent", color: "var(--gray)",
  border: "1px solid rgba(0,0,0,0.12)", borderRadius: 6,
  padding: "2px 8px", fontSize: 10, fontWeight: 700,
  marginLeft: 8,
  cursor: "pointer",
  letterSpacing: "0.4px",
  textTransform: "uppercase",
};
