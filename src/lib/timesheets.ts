// Types + helpers for the daily timesheet flow. Mirrors
// supabase/migrations/0031_daily_timesheets.sql.

export const ENTRY_TYPES = [
  "worked", "annual_leave", "sick_leave", "personal_leave",
  "unpaid_leave", "public_holiday", "day_off",
] as const;
export type EntryType = typeof ENTRY_TYPES[number];

export type DailyTimesheet = {
  id: string;
  worker_id: string;
  work_date: string;                          // YYYY-MM-DD
  entry_type: EntryType;
  hours: number;
  worker_note: string | null;
  submitted_at: string | null;
  approved_entry_type: EntryType | null;
  approved_hours: number | null;
  admin_note: string | null;
  approved_at: string | null;
  approved_by: string | null;
  leave_request_id: string | null;
  pushed_to_xero_at: string | null;
  xero_timesheet_line_id: string | null;
};

export type DailyStatus = "empty" | "draft" | "authorised" | "approved";

export function dailyStatusOf(row: DailyTimesheet | null | undefined): DailyStatus {
  if (!row) return "empty";
  if (row.approved_at) return "approved";
  if (row.submitted_at) return "authorised";
  return "draft";
}

// The effective values the payroll cares about: admin override if
// present, else the worker's submission. Only meaningful once
// approved — payroll_effective_hours(row) on an unapproved row
// returns 0 so we never accidentally pay something Thomas hasn't
// signed off on.
export function effectiveTypeApproved(row: DailyTimesheet): EntryType | null {
  if (!row.approved_at) return null;
  return (row.approved_entry_type ?? row.entry_type) as EntryType;
}
export function effectiveHoursApproved(row: DailyTimesheet): number {
  if (!row.approved_at) return 0;
  return row.approved_hours ?? row.hours ?? 0;
}

// Human-readable labels used by both worker + admin views so wording
// stays consistent.
export const ENTRY_TYPE_LABEL: Record<EntryType, string> = {
  worked:          "Worked",
  annual_leave:    "Annual leave",
  sick_leave:      "Sick leave",
  personal_leave:  "Personal leave",
  unpaid_leave:    "Unpaid leave",
  public_holiday:  "Public holiday",
  day_off:         "Day off",
};

// Which entry types decrement a leave balance on approval. Maps to
// the column name used by the increment_leave_balance RPC.
export const LEAVE_BALANCE_COLUMN: Partial<Record<EntryType, "annual_used" | "sick_used" | "personal_used">> = {
  annual_leave:    "annual_used",
  sick_leave:      "sick_used",
  personal_leave:  "personal_used",
};

// Entry types that count as PAID for payroll (feed into the
// worker_paid_hours bridge on approval + the future Xero Payroll
// push). Unpaid leave / day off / public holiday are recorded for
// the audit trail but don't push hours into payroll.
export const PAID_ENTRY_TYPES: ReadonlySet<EntryType> = new Set([
  "worked", "annual_leave", "sick_leave", "personal_leave",
]);
