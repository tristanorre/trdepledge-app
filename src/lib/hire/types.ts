// DIY Hire domain types.
//
// MONEY: integers (cents), per the house rule in CLAUDE.md.
//
// The `equipment` table stores `daily_rate` / `bond` as numeric(10,2) —
// dollars — which supabase-js hands back as *strings* to avoid float loss.
// The repo layer parses those into integer cents at the boundary, so every
// calculation in this module is exact integer arithmetic and nothing
// downstream ever sees a float. `toDbAmount()` converts back when writing.

import type { ISODate } from "./dates";

export type ReservationKind = "hire" | "block";

export type ReservationStatus =
  | "pending"
  | "confirmed"
  | "out"
  | "returned"
  | "declined"
  | "cancelled"
  | "blocked";

/**
 * Statuses that hold dates against the calendar.
 *
 * MUST stay in step with the `no_double_booking` exclusion constraint in
 * the database — that constraint is the real enforcement, this list is how
 * the UI predicts it. If they drift, the page will offer a customer dates
 * the insert then rejects.
 */
export const HOLDING_STATUSES: readonly ReservationStatus[] = [
  "pending",
  "confirmed",
  "out",
  "blocked",
];

export type Equipment = {
  id: string;
  slug: string;
  name: string;
  category: string;
  blurb: string | null;
  specs: string[];
  dailyRateCents: number;
  bondCents: number;
  photoPath: string | null;
  flyerPath: string | null;
  isPublished: boolean;
  sortOrder: number;
  /**
   * Days to hold the tool after its return date before the next customer
   * may collect it. 0 = next customer collects the day after return.
   * Per-item so the changeover gap can be turned on without a code change.
   */
  changeoverDays: number;
};

/** A span of dates held against a piece of equipment. Inclusive both ends. */
export type Hold = {
  startsOn: ISODate;
  endsOn: ISODate;
  /** `block` = Thomas's own dates; `hire` = a customer. Drives calendar styling. */
  kind: ReservationKind;
};

/** What the calendar shows for a single day. */
export type DayState =
  /** Before today in Adelaide. Never selectable. */
  | "past"
  /** Saturday or Sunday — the counter is shut, so no pickup or return. */
  | "closed"
  /** Held by a customer hire. */
  | "out"
  /** Held by one of Thomas's blocks. Admin renders this distinctly. */
  | "blocked"
  /** Collectable and returnable. */
  | "free";

export type CalendarDay = {
  date: ISODate;
  state: DayState;
  /** True when this is today in Adelaide. */
  isToday: boolean;
  /** True when a customer may pick this day as a collect or return date. */
  selectable: boolean;
  /**
   * True when the tool is committed on this day, independent of `state`.
   *
   * A hire spanning a weekend makes Saturday both `closed` (nobody can
   * collect) and held (the tool is physically out). `state` reports the
   * first fact because that's what governs selection; this reports the
   * second, so the admin calendar can show the gear as out over a weekend
   * without re-deriving it.
   */
  held: boolean;
};

/** Everything the pure availability functions need. No database, no clock. */
export type AvailabilityContext = {
  /** Today in Adelaide. Injected rather than read, so the rules are testable. */
  today: ISODate;
  /** Date spans already held for this equipment. */
  holds: Hold[];
  /** From the equipment row. */
  changeoverDays: number;
};

export type Quote = {
  chargedDays: number;
  dailyRateCents: number;
  hireSubtotalCents: number;
  bondCents: number;
  /** Hire subtotal + bond. Payable at the counter — nothing is taken online. */
  totalDueAtPickupCents: number;
};

/** Result of checking a proposed hire range. Messages are written as next steps. */
export type RangeCheck =
  | { ok: true }
  | { ok: false; reason: RangeRejection; message: string };

export type RangeRejection =
  | "invalid-date"
  | "ends-before-starts"
  | "starts-in-past"
  | "starts-on-closed-day"
  | "ends-on-closed-day"
  | "crosses-held-day";

/**
 * What the customer actually hands over at the counter.
 *
 * The single place the bond waiver is applied. `bondTotalCents` always
 * records what the bond would have been — waiving doesn't erase it, because
 * "we let this one off $100" is worth knowing later — so every caller that
 * shows or texts a total has to come through here rather than adding the
 * two columns itself.
 */
export function amountDueAtPickup(booking: {
  hireTotalCents: number;
  bondTotalCents: number;
  bondWaived: boolean;
}): number {
  return booking.hireTotalCents + (booking.bondWaived ? 0 : booking.bondTotalCents);
}

/** Parse a numeric(10,2) string from Postgres into integer cents. */
export function toCents(dbAmount: string | number | null | undefined): number {
  if (dbAmount == null) return 0;
  // Math.round rather than truncation: "50.00" is exact in binary, but
  // amounts like "80.10" are not, and 8009.999… must land on 8010.
  return Math.round(Number(dbAmount) * 100);
}

/** Format integer cents for a numeric(10,2) column. */
export function toDbAmount(cents: number): string {
  return (cents / 100).toFixed(2);
}
