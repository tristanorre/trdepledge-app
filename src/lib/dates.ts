// Date helpers used by Schedule, Time Allocation Board, and Roster.
//
// All ISO dates are YYYY-MM-DD strings to match Postgres `date` round-tripping.
// Times are HH:MM (24h). Everything is local time — Australia doesn't have
// half-hour offsets that bite scheduling, and the team works on the
// ground, so "today" means "the day on Thomas's phone".

export const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type DayKey = (typeof DAY_KEYS)[number];

export const DAY_LABELS: Record<DayKey, string> = {
  mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu",
  fri: "Fri", sat: "Sat", sun: "Sun",
};

/** YYYY-MM-DD for the local date (no UTC weirdness). */
export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayISO(): string {
  return toISODate(new Date());
}

/** Parse YYYY-MM-DD as a local date (NOT UTC). */
export function fromISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Monday of the week containing `iso`. (ISO 8601: weeks start Monday.) */
export function mondayOfWeek(iso: string): string {
  const d = fromISODate(iso);
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

/** "Mon 5 May" style. */
export function fmtDayShort(iso: string): string {
  const d = fromISODate(iso);
  return d.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
}

/** "Monday, 5 May 2026" style — for headlines. */
export function fmtDayLong(iso: string): string {
  const d = fromISODate(iso);
  return d.toLocaleDateString("en-AU", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

/** "5–11 May 2026" style — for week ranges. */
export function fmtWeekRange(monday: string): string {
  const start = fromISODate(monday);
  const end = fromISODate(addDaysISO(monday, 6));
  const sameMonth = start.getMonth() === end.getMonth();
  const startStr = start.toLocaleDateString("en-AU", { day: "numeric", month: sameMonth ? undefined : "short" });
  const endStr = end.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
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

/** Format minutes after midnight as "Hh AM/PM" or similar. */
export function minutesToLabel(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const period = h >= 12 ? "pm" : "am";
  const display = ((h + 11) % 12) + 1;
  return m === 0 ? `${display}${period}` : `${display}:${String(m).padStart(2, "0")}${period}`;
}
