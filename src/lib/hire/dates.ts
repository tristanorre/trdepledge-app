// Date arithmetic for the hire availability engine.
//
// WHY THIS EXISTS SEPARATELY FROM src/lib/dates.ts
//
// `src/lib/dates.ts` is the app-wide helper set, and its `todayISO()` is
// exactly what we want: the current calendar date in Australia/Adelaide,
// resolved through Intl, so it's correct no matter where the server runs.
// We re-export it here and use it as the anchor for "today".
//
// Its *arithmetic* helpers (`fromISODate`, `addDaysISO`) build a Date at
// noon in the SERVER's local zone and then read it back in Adelaide. That
// round-trip is fine on Vercel (UTC) — noon UTC is the same calendar day
// in Adelaide — but it shifts by a day if the server sits far enough west,
// because noon there is already tomorrow in Adelaide.
//
// Hire dates are pure calendar values: `date` columns, day-granular, no
// time-of-day component. So the engine does its arithmetic on the ISO
// strings themselves via UTC epoch-days, which involves no local zone at
// all and is therefore identical on every machine. The only place a real
// timezone is consulted is `today()`, where it belongs.
//
// Rule for anything in this directory: never call `new Date()` to decide
// what day it is. Call `today()`.

import { todayISO } from "@/lib/dates";

const MS_PER_DAY = 86_400_000;

/** An ISO calendar date, YYYY-MM-DD. Matches a Postgres `date`. */
export type ISODate = string;

/**
 * Today's date in Australia/Adelaide.
 *
 * The single "what day is it" helper for all hire logic. A server running
 * UTC is a different day to Wallaroo for the first ~9.5 hours of every
 * UTC day; going through this keeps past-date rejection honest.
 */
export function today(): ISODate {
  return todayISO();
}

/** True when `s` is a well-formed YYYY-MM-DD that names a real calendar day. */
export function isISODate(s: unknown): s is ISODate {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  // Round-trip guards against 2026-02-31 and friends, which Date.UTC
  // silently rolls forward rather than rejecting.
  return toISO(toEpochDay(s)) === s;
}

/** Days since the epoch for an ISO date. Zone-free by construction. */
export function toEpochDay(iso: ISODate): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / MS_PER_DAY;
}

/** Inverse of `toEpochDay`. */
export function toISO(epochDay: number): ISODate {
  const dt = new Date(epochDay * MS_PER_DAY);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Add `n` days (negative goes back). */
export function addDays(iso: ISODate, n: number): ISODate {
  return toISO(toEpochDay(iso) + n);
}

/** Whole days from `a` to `b`. Negative when `b` is earlier. */
export function daysBetween(a: ISODate, b: ISODate): number {
  return toEpochDay(b) - toEpochDay(a);
}

/** Weekday index, 0 = Monday … 6 = Sunday. Week starts Monday, as the UI does. */
export function weekdayIndex(iso: ISODate): number {
  // getUTCDay is 0 = Sunday; shift so Monday is 0.
  return (new Date(toEpochDay(iso) * MS_PER_DAY).getUTCDay() + 6) % 7;
}

/** Inclusive list of dates from `from` to `to`. Empty when `to` precedes `from`. */
export function eachDay(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = toEpochDay(from), end = toEpochDay(to); d <= end; d++) out.push(toISO(d));
  return out;
}

/** First day of the month containing `iso`. */
export function startOfMonth(iso: ISODate): ISODate {
  return `${iso.slice(0, 7)}-01`;
}

/** Last day of the month containing `iso`. */
export function endOfMonth(iso: ISODate): ISODate {
  const [y, m] = iso.split("-").map(Number);
  // Day 0 of next month is the last day of this one.
  return toISO(Date.UTC(y, m, 0) / MS_PER_DAY);
}

/** Shift by whole months, clamping to the last valid day (31 Jan +1 → 28/29 Feb). */
export function addMonths(iso: ISODate, n: number): ISODate {
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return toISO(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(d, lastDay)) / MS_PER_DAY,
  );
}
