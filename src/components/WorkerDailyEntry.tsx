"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ENTRY_TYPE_LABEL, type EntryType } from "@/lib/timesheets";

// One row for one day on /worker/hours. Handles worker's entry-type
// pick + hours input + optional note + Save-draft / Authorise
// actions. Locked when admin has already approved this day.
//
// The clocked-reference figure (from time_log) is shown as a
// read-only line so the worker can sanity-check their entry against
// what they actually clocked on jobs.

type Props = {
  workDate: string;                     // YYYY-MM-DD
  dayLabel: string;                     // "Mon 5 Aug"
  isToday: boolean;
  clockedHours: number;                 // reference — what they clocked on jobs
  entryType: EntryType;
  hours: number;
  workerNote: string | null;
  submittedAt: string | null;           // null = draft
  approvedAt: string | null;            // set = locked
  approvedEntryType: EntryType | null;
  approvedHours: number | null;
  approvedLeaveType: EntryType | null;  // if a leave_request covers this date
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

function fmtHM(h: number): string {
  if (!Number.isFinite(h) || h <= 0) return "—";
  const totalMin = Math.round(h * 60);
  const H = Math.floor(totalMin / 60);
  const M = totalMin % 60;
  if (H <= 0) return `${M}m`;
  if (M === 0) return `${H}h`;
  return `${H}h ${String(M).padStart(2, "0")}m`;
}

export default function WorkerDailyEntry(props: Props) {
  const router = useRouter();
  const locked = !!props.approvedAt;
  const authorised = !!props.submittedAt && !locked;

  const [entryType, setEntryType] = useState<EntryType>(props.entryType);
  const [hoursStr, setHoursStr] = useState<string>(
    props.hours > 0 ? String(props.hours) : "",
  );
  const [note, setNote] = useState<string>(props.workerNote ?? "");
  const [showNote, setShowNote] = useState<boolean>(!!props.workerNote);
  const [busy, setBusy] = useState<null | "save" | "auth">(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(authorise: boolean) {
    if (locked) return;
    const parsed = parseFloat(hoursStr);
    const hours = Number.isFinite(parsed) && parsed >= 0 ? Math.min(24, parsed) : 0;
    if (authorise && entryType === "worked" && hours <= 0) {
      setError("Enter your hours before authorising a worked day.");
      return;
    }
    setBusy(authorise ? "auth" : "save");
    setError(null);
    try {
      const res = await fetch("/api/worker/timesheet/day", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          work_date: props.workDate,
          entry_type: entryType,
          hours,
          worker_note: note.trim() || null,
          authorise,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Save failed (${res.status})`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(null);
    }
  }

  const bg = locked
    ? "rgba(34,134,58,0.10)"
    : authorised
    ? "rgba(255,229,0,0.14)"
    : props.isToday
    ? "rgba(208,255,89,0.18)"
    : "white";
  const border = locked
    ? "rgba(34,134,58,0.35)"
    : authorised
    ? "rgba(133,114,0,0.30)"
    : props.isToday
    ? "rgba(208,255,89,0.6)"
    : "rgba(0,0,0,0.08)";

  return (
    <div style={{ ...rowStyle, background: bg, borderColor: border }}>
      <div style={dayHeaderStyle}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.8px", color: "var(--gray)", textTransform: "uppercase" }}>
            {props.dayLabel}
          </div>
          {props.isToday && (
            <div style={{ fontSize: 10, fontWeight: 800, color: "#15803D", letterSpacing: "0.8px", textTransform: "uppercase" }}>
              Today
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {locked && <span style={pillGreen}>✓ Approved</span>}
          {authorised && <span style={pillAmber}>Authorised — awaiting approval</span>}
          {!locked && !authorised && <span style={pillGrey}>Draft</span>}
          {props.approvedLeaveType && !locked && (
            <span style={pillBlue}>
              {ENTRY_TYPE_LABEL[props.approvedLeaveType]} approved
            </span>
          )}
        </div>
      </div>

      <div style={referenceStyle}>
        Clocked on jobs: <strong>{fmtHM(props.clockedHours)}</strong>
        <span style={{ marginLeft: 8, color: "var(--gray)" }}>
          (reference — you can enter a different figure below)
        </span>
      </div>

      <div style={fieldRowStyle}>
        <select
          value={entryType}
          onChange={(e) => setEntryType(e.target.value as EntryType)}
          disabled={locked || busy !== null}
          aria-label={`Entry type for ${props.dayLabel}`}
          style={selectStyle}
        >
          {ENTRY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <input
          type="number"
          inputMode="decimal"
          step="0.25"
          min="0"
          max="24"
          value={hoursStr}
          onChange={(e) => setHoursStr(e.target.value)}
          placeholder="Hours"
          disabled={locked || busy !== null}
          aria-label={`Hours for ${props.dayLabel}`}
          style={hoursInputStyle}
        />
        <span style={{ fontSize: 12, color: "var(--gray)" }}>hrs</span>
      </div>

      {showNote ? (
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={locked || busy !== null}
          placeholder="Optional note for Thomas (e.g. site issue, extra travel)"
          rows={2}
          maxLength={500}
          style={noteInputStyle}
        />
      ) : (
        !locked && (
          <button
            type="button"
            onClick={() => setShowNote(true)}
            style={addNoteBtnStyle}
          >
            + Add note
          </button>
        )
      )}

      {locked && (
        <div style={approvedBoxStyle}>
          Admin approved: <strong>
            {ENTRY_TYPE_LABEL[(props.approvedEntryType ?? entryType)]}
            {" · "}
            {fmtHM(props.approvedHours ?? 0)}
          </strong>
        </div>
      )}

      {!locked && (
        <div style={actionRowStyle}>
          <button
            type="button"
            onClick={() => submit(false)}
            disabled={busy !== null}
            style={saveBtnStyle}
          >
            {busy === "save" ? "Saving…" : "Save draft"}
          </button>
          <button
            type="button"
            onClick={() => submit(true)}
            disabled={busy !== null}
            style={authoriseBtnStyle}
          >
            {busy === "auth"
              ? "Authorising…"
              : authorised
              ? "Re-authorise"
              : "Authorise day"}
          </button>
        </div>
      )}

      {error && (
        <div role="alert" style={errorStyle}>⚠ {error}</div>
      )}
    </div>
  );
}

const rowStyle: React.CSSProperties = {
  display: "flex", flexDirection: "column", gap: 8,
  padding: "12px 14px", borderRadius: 12,
  border: "1px solid",
};
const dayHeaderStyle: React.CSSProperties = {
  display: "flex", justifyContent: "space-between", alignItems: "flex-start",
  gap: 8, flexWrap: "wrap",
};
const referenceStyle: React.CSSProperties = {
  fontSize: 12, color: "var(--navy)",
  padding: "6px 10px",
  background: "rgba(0,0,0,0.04)", borderRadius: 8,
};
const fieldRowStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
};
const selectStyle: React.CSSProperties = {
  fontSize: 14, padding: "8px 10px", borderRadius: 8,
  border: "1.5px solid rgba(0,0,0,0.15)",
  background: "white", color: "var(--navy)",
  fontFamily: "inherit", flex: "1 1 160px",
};
const hoursInputStyle: React.CSSProperties = {
  fontSize: 14, padding: "8px 10px", borderRadius: 8,
  border: "1.5px solid rgba(0,0,0,0.15)",
  background: "white", color: "var(--navy)",
  fontFamily: "inherit", width: 80, textAlign: "center",
};
const noteInputStyle: React.CSSProperties = {
  fontSize: 13, padding: "8px 10px", borderRadius: 8,
  border: "1.5px solid rgba(0,0,0,0.15)",
  background: "white", color: "var(--navy)",
  fontFamily: "inherit", width: "100%", resize: "vertical",
  boxSizing: "border-box",
};
const addNoteBtnStyle: React.CSSProperties = {
  alignSelf: "flex-start",
  padding: "4px 10px", fontSize: 11, fontWeight: 700,
  background: "transparent", color: "var(--navy)",
  border: "1px dashed rgba(0,0,0,0.2)", borderRadius: 8,
  cursor: "pointer",
};
const actionRowStyle: React.CSSProperties = {
  display: "flex", gap: 8, flexWrap: "wrap",
};
const saveBtnStyle: React.CSSProperties = {
  padding: "8px 14px", fontSize: 13, fontWeight: 700,
  background: "white", color: "var(--navy)",
  border: "1px solid rgba(0,0,0,0.15)", borderRadius: 8,
  cursor: "pointer",
};
const authoriseBtnStyle: React.CSSProperties = {
  padding: "8px 16px", fontSize: 13, fontWeight: 800,
  background: "var(--navy)", color: "white",
  border: "none", borderRadius: 8, cursor: "pointer",
};
const approvedBoxStyle: React.CSSProperties = {
  padding: "8px 10px", background: "rgba(34,134,58,0.10)",
  borderRadius: 8, fontSize: 13, color: "#15803D",
};
const errorStyle: React.CSSProperties = {
  padding: "8px 10px", background: "rgba(220,38,38,0.10)",
  color: "#B91C1C", borderRadius: 8, fontSize: 12, fontWeight: 600,
};
const pillBase: React.CSSProperties = {
  fontSize: 10, fontWeight: 800, letterSpacing: "0.4px",
  textTransform: "uppercase",
  padding: "3px 8px", borderRadius: 999,
};
const pillGreen: React.CSSProperties = { ...pillBase, background: "rgba(34,134,58,0.14)", color: "#15803D" };
const pillAmber: React.CSSProperties = { ...pillBase, background: "rgba(255,229,0,0.22)", color: "#857200" };
const pillGrey:  React.CSSProperties = { ...pillBase, background: "rgba(0,0,0,0.06)",     color: "var(--gray)" };
const pillBlue:  React.CSSProperties = { ...pillBase, background: "rgba(26,79,181,0.12)", color: "#1A4FB5" };
