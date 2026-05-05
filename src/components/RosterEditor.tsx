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
};

type Editable = {
  worker_id: string;
  days: Set<DayKey>;
  start_time: string;
  end_time: string;
};

export default function RosterEditor({ weekStart, workers, initialRows }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const initialMap = new Map(initialRows.map((r) => [r.worker_id, r]));
  const [rows, setRows] = useState<Editable[]>(() =>
    workers.map((w) => {
      const r = initialMap.get(w.id);
      return {
        worker_id: w.id,
        days: new Set<DayKey>(r?.days ?? []),
        start_time: r?.start_time ?? "07:00",
        end_time: r?.end_time ?? "17:00",
      };
    })
  );
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  function gotoWeek(monday: string) {
    const next = new URLSearchParams(params);
    next.set("week_start", mondayOfWeek(monday));
    router.push(`${pathname}?${next.toString()}`);
  }

  function toggleDay(workerId: string, day: DayKey) {
    setRows((cur) => cur.map((r) => {
      if (r.worker_id !== workerId) return r;
      const days = new Set(r.days);
      if (days.has(day)) days.delete(day); else days.add(day);
      return { ...r, days };
    }));
  }

  function setTime(workerId: string, key: "start_time" | "end_time", value: string) {
    setRows((cur) => cur.map((r) => r.worker_id === workerId ? { ...r, [key]: value } : r));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        week_start: weekStart,
        rows: rows.map((r) => ({
          worker_id: r.worker_id,
          days: Array.from(r.days),
          start_time: r.start_time || null,
          end_time: r.end_time || null,
        })),
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
        <div style={{ display: "flex", gap: 6 }}>
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
              <th style={thTime}>Start</th>
              <th style={thTime}>End</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={DAY_KEYS.length + 3} style={{ padding: 24, color: "var(--gray)", textAlign: "center" }}>No active workers.</td></tr>
            )}
            {rows.map((r) => {
              const w = workers.find((x) => x.id === r.worker_id)!;
              return (
                <tr key={r.worker_id}>
                  <td style={tdWorker}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 10, height: 10, borderRadius: "50%", background: w.colour, flexShrink: 0 }} />
                      {w.name}
                    </span>
                  </td>
                  {DAY_KEYS.map((d) => {
                    const on = r.days.has(d);
                    return (
                      <td key={d} style={tdCenter}>
                        <button
                          type="button"
                          onClick={() => toggleDay(r.worker_id, d)}
                          aria-pressed={on}
                          aria-label={`${w.name} ${DAY_LABELS[d]}`}
                          style={{
                            ...dayBtn,
                            background: on ? "var(--lime)" : "var(--off)",
                            color: on ? "var(--navy)" : "var(--gray)",
                            fontWeight: on ? 800 : 600,
                          }}
                        >
                          {on ? "●" : "—"}
                        </button>
                      </td>
                    );
                  })}
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
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 12, color: "var(--gray)" }}>
          Tap a day to toggle. Times apply to every rostered day for that worker.
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
  minWidth: 720,
};
const thBase: React.CSSProperties = {
  fontSize: 11, fontWeight: 800, letterSpacing: "1px",
  textTransform: "uppercase", color: "var(--gray)",
  padding: "12px 8px", textAlign: "left",
  borderBottom: "1px solid var(--gray-light)",
  background: "var(--off)",
};
const thWorker: React.CSSProperties = { ...thBase, paddingLeft: 14, minWidth: 160 };
const thDay: React.CSSProperties = { ...thBase, textAlign: "center", width: 60 };
const thTime: React.CSSProperties = { ...thBase, width: 100 };
const tdBase: React.CSSProperties = { padding: "10px 8px", borderBottom: "1px solid var(--gray-light)", fontSize: 14 };
const tdWorker: React.CSSProperties = { ...tdBase, paddingLeft: 14, color: "var(--navy)", fontWeight: 700 };
const tdCenter: React.CSSProperties = { ...tdBase, textAlign: "center" };
const tdTime: React.CSSProperties = { ...tdBase };
const dayBtn: React.CSSProperties = {
  width: 40, height: 40, borderRadius: 10, border: "none",
  cursor: "pointer", fontSize: 16,
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
