// Date helpers used by Schedule, Time Allocation Board, Roster, and
// Payroll.
//
// All ISO dates are YYYY-MM-DD strings to match Postgres `date`
// round-tripping. Times are HH:MM (24h). Everything is **local time
// in Adelaide** — the team works on the ground in South Australia,
// so "today" must mean "the day on Thomas's phone", not UTC.
//
// IMPORTANT — server timezone gotcha:
//
// Vercel serverless lambdas run in UTC by default. Plain
// `new Date().getDate()` returns the UTC day, which between
// midnight UTC and ~09:30 ACST is the PREVIOUS day relative to
// Adelaide. The roster page was anchored to the wrong week any
// time it was loaded before mid-morning local — hours were saved
// against last week's Monday, then disappeared on the payroll page
// later in the day when the UTC clock caught up.
//
// Fix: every "what is today" / "what local date is this instant"
// helper goes through Intl.DateTimeFormat with timeZone set to
// Australia/Adelaide. That makes the code TZ-independent — works
// the same whether the server is in UTC, Sydney, or Helsinki, and
// regardless of whether DST is in effect (Adelaide observes DST;
// the formatter handles the offset for you).
//
// Setting `TZ=Australia/Adelaide` as a Vercel env var would also
// fix this, but we prefer the explicit code path so the app stays
// correct even if the env var gets removed.

const APP_TIMEZONE = "Australia/Adelaide";

export const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type DayKey = (typeof DAY_KEYS)[number];

export const DAY_LABELS: Record<DayKey, string> = {
  mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu",
  fri: "Fri", sat: "Sat", sun: "Sun",
};

// Cached formatter — re-creating Intl.DateTimeFormat on every call is
// expensive in a hot loop and we use it on every server render.
const isoDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// "en-CA" formats as YYYY-MM-DD natively, which means we don't have
// to re-assemble parts. But we still iterate the parts array because
// formatToParts is the only TZ-aware API that lets us pull the local
// day/month/year out of a Date instant cleanly.
const isoPartsFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** YYYY-MM-DD for the date in Adelaide-local time. TZ-safe. */
export function toISODate(d: Date): string {
  // formatToParts returns numeric parts as strings already padded.
  const parts = isoPartsFormatter.formatToParts(d);
  let y = "", m = "", day = "";
  for (const p of parts) {
    if (p.type === "year")  y = p.value;
    if (p.type === "month") m = p.value;
    if (p.type === "day")   day = p.value;
  }
  return `${y}-${m}-${day}`;
}

/** Current date in Adelaide as YYYY-MM-DD. */
export function todayISO(): string {
  return isoDateFormatter.format(new Date());
}

/** Parse YYYY-MM-DD as a LOCAL date at noon Adelaide time.
 *  Noon (not midnight) is deliberate — it sidesteps DST transitions:
 *  on the day DST starts/ends, midnight either doesn't exist or
 *  exists twice, and naive parsers can shift the day by ±1 hour
 *  which then shifts the weekday. Noon is always unambiguous.
 *
 *  This builds the Date so that subsequent getDay/getDate calls
 *  return the day Adelaide sees on the calendar, regardless of where
 *  the server is. */
export function fromISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  // Build a date that represents noon in Adelaide on that date. We do
  // this in two steps because there's no constructor for "this local
  // date in this timezone": create a UTC date that we know is the
  // same calendar date in Adelaide (noon UTC always falls on the
  // same Adelaide date), then trust subsequent local-getters.
  //
  // Adelaide is UTC+9:30 (or +10:30 with DST). Noon UTC = 21:30 or
  // 22:30 Adelaide — same calendar day. So `new Date(y, m-1, d, 12)`
  // (a local noon construction) is safe regardless of server TZ
  // because noon ± any reasonable TZ offset stays on the same date.
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

/** Monday of the ISO week containing `iso`. */
export function mondayOfWeek(iso: string): string {
  const d = fromISODate(iso);
  // d.getDay() works on the local representation of the Date object
  // — but because the Date is built at noon-local, the local day
  // matches Adelaide's calendar day (server TZ shift is much smaller
  // than 12h so the noon anchor doesn't cross midnight).
  const dayIdx = (d.getDay() + 6) % 7; // 0 = Mon, 6 = Sun
  d.setDate(d.getDate() - dayIdx);
  return toISODate(d);
}

/** Add `n` days to `iso`. Negative goes back. */
export function addDaysISO(iso: string, n: number): string {
  const d = fromISODate(iso);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/** Map an ISO date to its DayKey ("mon"…"sun"). */
export function dayKeyOf(iso: string): DayKey {
  const d = fromISODate(iso);
  const idx = (d.getDay() + 6) % 7;
  return DAY_KEYS[idx];
}

/** Sequence of 7 ISO dates starting from a Monday. */
export function weekDates(monday: string): string[] {
  return DAY_KEYS.map((_, i) => addDaysISO(monday, i));
}

// Formatters used for display — all explicitly Adelaide-zoned so
// the "Mon 19 May" header matches what Thomas's phone shows.
const dayShortFormatter = new Intl.DateTimeFormat("en-AU", {
  timeZone: APP_TIMEZONE,
  weekday: "short", day: "numeric", month: "short",
});
const dayLongFormatter = new Intl.DateTimeFormat("en-AU", {
  timeZone: APP_TIMEZONE,
  weekday: "long", day: "numeric", month: "long", year: "numeric",
});

/** "Mon 5 May" style. */
export function fmtDayShort(iso: string): string {
  return dayShortFormatter.format(fromISODate(iso));
}

/** "Monday, 5 May 2026" style — for headlines. */
export function fmtDayLong(iso: string): string {
  return dayLongFormatter.format(fromISODate(iso));
}

/** "5–11 May 2026" style — for week ranges. */
export function fmtWeekRange(monday: string): string {
  const start = fromISODate(monday);
  const end = fromISODate(addDaysISO(monday, 6));
  // Pull the Adelaide-local month for each end so we can suppress the
  // start-month when both ends fall in the same month.
  const startMonth = new Intl.DateTimeFormat("en-AU", {
    timeZone: APP_TIMEZONE, month: "numeric",
  }).format(start);
  const endMonth = new Intl.DateTimeFormat("en-AU", {
    timeZone: APP_TIMEZONE, month: "numeric",
  }).format(end);
  const sameMonth = startMonth === endMonth;
  const startStr = new Intl.DateTimeFormat("en-AU", {
    timeZone: APP_TIMEZONE,
    day: "numeric",
    ...(sameMonth ? {} : { month: "short" }),
  }).format(start);
  const endStr = new Intl.DateTimeFormat("en-AU", {
    timeZone: APP_TIMEZONE,
    day: "numeric", month: "short", year: "numeric",
  }).format(end);
  return `${startStr}–${endStr}`;
}

/** Convert "HH:MM" or "HH:MM:SS" to minutes after midnight. Null-safe. */
export function timeToMinutes(t: string | null | undefined): number | null {
  if (!t) return null;
  const [h, m] = t.split(":");
  const hh = Number(h);
  const mm = Number(m ?? "0");
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return hh * 60 + mm;
}

// "Now" in Adelaide local time. Use these instead of `new Date()
// .getHours()` / .getMinutes() on any server-side code path — Vercel
// lambdas run in UTC, so naive local getters return UTC values and
// produce wrong-time-of-day bugs (the most user-visible was the admin
// dashboard greeting saying "Good morning" at 8 PM Adelaide because
// UTC was still 9 AM).

const partsFormatter = new Intl.DateTimeFormat("en-AU", {
  timeZone: APP_TIMEZONE,
  hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit",
});

/** Hour / minute / second of the current Adelaide instant. */
export function nowInAppTZParts(d = new Date()): { hours: number; minutes: number; seconds: number } {
  const parts = partsFormatter.formatToParts(d);
  let h = 0, m = 0, s = 0;
  for (const p of parts) {
    if (p.type === "hour")   h = Number(p.value);
    if (p.type === "minute") m = Number(p.value);
    if (p.type === "second") s = Number(p.value);
  }
  // Intl returns "24" for midnight in some locales — clamp.
  if (h === 24) h = 0;
  return { hours: h, minutes: m, seconds: s };
}

/** "HH:MM" of an instant in Adelaide local time. Used by cron filters
 *  that compare against the `scheduled_time` time column (also stored
 *  in local time). */
export function fmtHMInAppTZ(d: Date): string {
  const { hours, minutes } = nowInAppTZParts(d);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/** Format minutes after midnight as "Hh AM/PM" or similar. */
export function minutesToLabel(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const period = h >= 12 ? "pm" : "am";
  const display = ((h + 11) % 12) + 1;
  return m === 0 ? `${display}${period}` : `${display}:${String(m).padStart(2, "0")}${period}`;
}
