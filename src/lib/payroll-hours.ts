import type { SupabaseClient } from "@supabase/supabase-js";
import { hoursForEntry, type TimeLog, type TimeEntry } from "@/lib/cost";
import { toISODate } from "@/lib/dates";

// Pulls clocked hours (from jobs.time_log) into a per-(worker, day)
// map that the payroll grid can use as the default. Complements the
// manual overrides in worker_paid_hours — the roster page still owns
// forward-planning; this only reflects what actually happened.
//
// Bucketing by day: an entry's Adelaide-local start date. If a worker
// clocked in Tuesday 8am AEST and out Tuesday 3pm AEST on a job
// originally scheduled for Wednesday, those 7 hours count on Tuesday
// (when they actually worked) — that matches what a wages timesheet
// records. Gardening shifts don't cross midnight so we don't need
// mid-day splitting.

export type ClockedHours = Record<string, number>; // key: `${worker_id}|${YYYY-MM-DD}`

export function clockedHoursKey(workerId: string, isoDate: string): string {
  return `${workerId}|${isoDate}`;
}

export async function computeClockedHoursForWeek(
  supabase: SupabaseClient,
  workerIds: string[],
  weekStartIso: string,
  weekEndIso: string,
): Promise<ClockedHours> {
  const out: ClockedHours = {};
  if (workerIds.length === 0) return out;

  // Widen the query by one day on each side to catch any entry that
  // started at 23:xx local time on the boundary. The filter is by
  // scheduled `date`, so a job dated the day before the week could
  // still have hours falling inside the week when start is late UTC.
  // Cheap safety net — bucketing then discards out-of-range dates.
  // Fetch every job in the window that involves any of these workers.
  // Extra day on each side catches boundary-time entries. We skip the
  // "time_log <> {}" filter because PostgREST's jsonb-equality
  // predicates are awkward for empty objects — the inner loop no-ops
  // on empty logs, so the extra rows are near-free.
  const { data, error } = await supabase
    .from("jobs")
    .select("id, time_log")
    .overlaps("assigned_worker_ids", workerIds)
    .gte("date", addDaysIsoUnsafe(weekStartIso, -1))
    .lte("date", addDaysIsoUnsafe(weekEndIso,   +1));
  if (error) {
    console.error("[computeClockedHoursForWeek]", error);
    return out;
  }

  for (const row of (data ?? []) as Array<{ id: string; time_log: TimeLog | null }>) {
    const log = row.time_log ?? {};
    for (const wid of workerIds) {
      const entry: TimeEntry | undefined = log[wid];
      if (!entry?.start) continue;
      // Bucket by Adelaide-local start date. The end/breaks may span
      // an unusual boundary in theory; in practice these are 4-8h
      // day shifts, so all hours belong to the start-date bucket.
      const startedOn = toISODate(new Date(entry.start));
      if (startedOn < weekStartIso || startedOn > weekEndIso) continue;
      const hrs = hoursForEntry(entry);
      if (hrs <= 0) continue;
      const key = clockedHoursKey(wid, startedOn);
      out[key] = round2((out[key] ?? 0) + hrs);
    }
  }
  return out;
}

// Round to 2dp — timesheet display + Xero CSVs both use 2dp hours.
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Small local addDays that avoids the circular import with lib/dates
// (this file is used by both server pages and the API route).
function addDaysIsoUnsafe(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}
