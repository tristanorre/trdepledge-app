// Month-range helpers for the costs dashboard. Dates are local (Australia)
// and we treat the month as inclusive on both ends so queries against
// jobs.date (a Postgres date, no tz) line up cleanly.

import { fromISODate, toISODate } from "@/lib/dates";

export function monthStart(iso: string): string {
  const d = fromISODate(iso);
  return toISODate(new Date(d.getFullYear(), d.getMonth(), 1));
}

export function monthEnd(iso: string): string {
  const d = fromISODate(iso);
  // Day 0 of next month = last day of this month.
  return toISODate(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

export function addMonthsISO(iso: string, n: number): string {
  const d = fromISODate(iso);
  return toISODate(new Date(d.getFullYear(), d.getMonth() + n, 1));
}

export function fmtMonth(iso: string): string {
  const d = fromISODate(iso);
  return d.toLocaleDateString("en-AU", { month: "long", year: "numeric" });
}
