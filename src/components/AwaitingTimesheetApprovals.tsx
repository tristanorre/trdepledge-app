"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ENTRY_TYPE_LABEL, type EntryType } from "@/lib/timesheets";

// /admin/hr/payroll — "Awaiting your approval" section.
//
// Lists every daily_timesheets row for the week that a worker has
// authorised (submitted_at set) but no admin has approved yet.
// Admin can adjust hours + entry_type inline, add a note, then hit
// Approve (per row) or Approve all (per worker).

export type PendingRow = {
  id: string;
  worker_id: string;
  worker_name: string;
  work_date: string;                // YYYY-MM-DD
  day_label: string;                // "Tue 5 Aug"
  entry_type: EntryType;            // worker-submitted
  hours: number;                    // worker-submitted
  worker_note: string | null;
  submitted_at: string;             // ISO
};

type Props = {
  weekStart: string;
  rows: PendingRow[];
};

const ENTRY_OPTIONS: Array<{ value: EntryType; label: string }> = [
  { value: "worked",         label: "Worked" },
  { value: "annual_leave",   label: "Annual leave" },
  { value: "sick_leave",     label: "Sick leave" },
  { value: "personal_leave", label: "Personal leave" },
  { value: "public_holiday", label: "Public holiday" },
  { value: "unpaid_leave",   label: "Unpaid leave" },
  { value: "day_off",        label: "Day off" },
];

export default function AwaitingTimesheetApprovals({ weekStart, rows }: Props) {
  const router = useRouter();

  // Per-row overrides. Empty entry = "use worker's submission as-is".
  const [overrides, setOverrides] = useState<Record<string, { hours?: string; entry_type?: EntryType; admin_note?: string }>>({});
  const [busy, setBusy] = useState<string | null>(null);          // row id being processed
  const [busyWorker, setBusyWorker] = useState<string | null>(null); // worker id being bulk-approved
  const [error, setError] = useState<string | null>(null);

  if (rows.length === 0) {
    return (
      <div style={emptyStyle}>
        <div style={{ fontSize: 24, marginBottom: 6 }}>✓</div>
        <div style={{ fontWeight: 700, color: "var(--navy)", marginBottom: 4 }}>
          No timesheets awaiting your approval this week.
        </div>
        <div style={{ color: "var(--gray)", fontSize: 13 }}>
          When workers authorise their days on <code>/worker/hours</code>, they'll appear here.
        </div>
      </div>
    );
  }

  function updateOverride(rowId: string, patch: Partial<{ hours: string; entry_type: EntryType; admin_note: string }>) {
    setOverrides((prev) => ({ ...prev, [rowId]: { ...prev[rowId], ...patch } }));
  }

  function overrideFor(rowId: string, row: PendingRow): {
    approved_hours: number | null;
    approved_entry_type: EntryType | null;
    admin_note: string | null;
  } {
    const o = overrides[rowId] ?? {};
    const hoursNum = o.hours !== undefined ? parseFloat(o.hours) : NaN;
    const approved_hours =
      Number.isFinite(hoursNum) && hoursNum !== row.hours
        ? Math.min(24, Math.max(0, Math.round(hoursNum * 100) / 100))
        : null;
    const approved_entry_type = o.entry_type && o.entry_type !== row.entry_type ? o.entry_type : null;
    const admin_note = o.admin_note?.trim() || null;
    return { approved_hours, approved_entry_type, admin_note };
  }

  async function approveOne(row: PendingRow) {
    setBusy(row.id);
    setError(null);
    try {
      const over = overrideFor(row.id, row);
      const res = await fetch("/api/admin/timesheet/approve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          worker_id: row.worker_id,
          work_date: row.work_date,
          ...over,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Approve failed (${res.status})`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Approve failed");
    } finally {
      setBusy(null);
    }
  }

  async function approveWorkerWeek(workerId: string, workerRows: PendingRow[]) {
    setBusyWorker(workerId);
    setError(null);
    try {
      const overrideList = workerRows
        .map((r) => {
          const over = overrideFor(r.id, r);
          if (over.approved_hours === null && over.approved_entry_type === null && !over.admin_note) return null;
          return { work_date: r.work_date, ...over };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);
      const res = await fetch("/api/admin/timesheet/approve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          worker_id: workerId,
          week_start: weekStart,
          overrides: overrideList,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Bulk approve failed (${res.status})`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bulk approve failed");
    } finally {
      setBusyWorker(null);
    }
  }

  // Group rows by worker for the render — bulk approve is per-worker.
  const byWorker = new Map<string, { name: string; rows: PendingRow[] }>();
  for (const r of rows) {
    const g = byWorker.get(r.worker_id) ?? { name: r.worker_name, rows: [] };
    g.rows.push(r);
    byWorker.set(r.worker_id, g);
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <h3 style={sectionTitleStyle}>
          Awaiting your approval
          <span style={countBadgeStyle}>{rows.length}</span>
        </h3>
        <span style={{ fontSize: 12, color: "var(--gray)" }}>
          Approve here to record the hours + push into the payroll export.
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {Array.from(byWorker.entries()).map(([workerId, group]) => (
          <div key={workerId} style={workerCardStyle}>
            <div style={workerHeaderStyle}>
              <div style={{ fontWeight: 800, color: "var(--navy)", fontSize: 15 }}>
                {group.name}
                <span style={{ marginLeft: 8, fontSize: 12, color: "var(--gray)", fontWeight: 500 }}>
                  {group.rows.length} day{group.rows.length === 1 ? "" : "s"} pending
                </span>
              </div>
              <button
                type="button"
                onClick={() => approveWorkerWeek(workerId, group.rows)}
                disabled={busyWorker === workerId || busy !== null}
                style={btnPrimarySmall}
              >
                {busyWorker === workerId ? "Approving all…" : `Approve all ${group.rows.length}`}
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {group.rows.map((row) => {
                const o = overrides[row.id] ?? {};
                const editedType = o.entry_type ?? row.entry_type;
                const editedHours = o.hours ?? String(row.hours);
                return (
                  <div key={row.id} style={pendingRowStyle}>
                    <div style={{ minWidth: 90 }}>
                      <div style={dayLabelStyle}>{row.day_label}</div>
                      <div style={{ fontSize: 10, color: "var(--gray)" }}>
                        submitted {new Date(row.submitted_at).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                      </div>
                    </div>

                    <select
                      value={editedType}
                      onChange={(e) => updateOverride(row.id, { entry_type: e.target.value as EntryType })}
                      disabled={busy === row.id || busyWorker === row.worker_id}
                      style={selectStyle}
                      aria-label={`${row.day_label} entry type`}
                    >
                      {ENTRY_OPTIONS.map((op) => (
                        <option key={op.value} value={op.value}>{op.label}</option>
                      ))}
                    </select>

                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.25"
                      min="0"
                      max="24"
                      value={editedHours}
                      onChange={(e) => updateOverride(row.id, { hours: e.target.value })}
                      disabled={busy === row.id || busyWorker === row.worker_id}
                      style={hoursInputStyle}
                      aria-label={`${row.day_label} hours`}
                    />
                    <span style={{ fontSize: 12, color: "var(--gray)" }}>hrs</span>

                    <input
                      type="text"
                      value={o.admin_note ?? ""}
                      onChange={(e) => updateOverride(row.id, { admin_note: e.target.value })}
                      placeholder="Note for record (optional)"
                      disabled={busy === row.id || busyWorker === row.worker_id}
                      maxLength={500}
                      style={noteInputStyle}
                    />

                    <button
                      type="button"
                      onClick={() => approveOne(row)}
                      disabled={busy !== null || busyWorker === row.worker_id}
                      style={btnPrimarySmall}
                    >
                      {busy === row.id ? "Approving…" : "Approve"}
                    </button>

                    {row.worker_note && (
                      <div style={workerNoteStyle} title="Worker's note">
                        <strong>Worker:</strong> {row.worker_note}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
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

const sectionTitleStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)", fontSize: 20, color: "var(--navy)",
  margin: 0, display: "inline-flex", alignItems: "center", gap: 10,
};
const countBadgeStyle: React.CSSProperties = {
  background: "rgba(255,229,0,0.22)", color: "#857200",
  fontSize: 12, fontWeight: 800, letterSpacing: "0.5px",
  padding: "3px 10px", borderRadius: 999,
};
const emptyStyle: React.CSSProperties = {
  background: "white", borderRadius: 12, padding: 24,
  border: "1px solid rgba(0,0,0,0.06)",
  textAlign: "center", color: "var(--navy)",
};
const workerCardStyle: React.CSSProperties = {
  background: "white", borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.08)",
  padding: 12,
};
const workerHeaderStyle: React.CSSProperties = {
  display: "flex", justifyContent: "space-between", alignItems: "center",
  gap: 8, marginBottom: 10, flexWrap: "wrap",
};
const pendingRowStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
  padding: "8px 10px",
  background: "rgba(255,229,0,0.06)",
  border: "1px solid rgba(133,114,0,0.18)",
  borderRadius: 8,
};
const dayLabelStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 800, letterSpacing: "0.5px",
  color: "var(--navy)", textTransform: "uppercase",
};
const selectStyle: React.CSSProperties = {
  fontSize: 13, padding: "6px 8px", borderRadius: 8,
  border: "1.5px solid rgba(0,0,0,0.15)",
  background: "white", color: "var(--navy)",
  fontFamily: "inherit", minWidth: 140,
};
const hoursInputStyle: React.CSSProperties = {
  fontSize: 13, padding: "6px 8px", borderRadius: 8,
  border: "1.5px solid rgba(0,0,0,0.15)",
  background: "white", color: "var(--navy)",
  fontFamily: "inherit", width: 72, textAlign: "center",
};
const noteInputStyle: React.CSSProperties = {
  fontSize: 13, padding: "6px 8px", borderRadius: 8,
  border: "1.5px solid rgba(0,0,0,0.15)",
  background: "white", color: "var(--navy)",
  fontFamily: "inherit", flex: "1 1 180px", minWidth: 140,
};
const btnPrimarySmall: React.CSSProperties = {
  padding: "6px 14px", fontSize: 12, fontWeight: 800,
  background: "var(--navy)", color: "white",
  border: "none", borderRadius: 8, cursor: "pointer",
  minHeight: 34,
};
const workerNoteStyle: React.CSSProperties = {
  flexBasis: "100%", fontSize: 12, color: "var(--navy)",
  padding: "4px 8px", background: "rgba(0,0,0,0.04)", borderRadius: 6,
};
