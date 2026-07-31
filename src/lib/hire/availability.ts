// The availability engine. Rules 1–5 of the hire spec.
//
// This is the whole system. The public calendar, the admin calendar and
// Doug's tools all read these functions — availability is never
// re-implemented in the browser or described in a prompt.
//
// Everything here is PURE: it takes an `AvailabilityContext` (today's date
// in Adelaide, the holds already on the books, the item's changeover gap)
// and returns an answer. No database, no clock. `./repo` is the only part
// that touches Supabase, and it does so by building a context and calling
// in here. That split is what makes the rules unit-testable without a
// database and identical on every caller.
//
// ─────────────────────────────────────────────────────────────────────
// THE ONE INVARIANT THAT MATTERS
//
// The set of days this engine reports as unavailable must be a SUPERSET of
// what the `no_double_booking` exclusion constraint rejects. The database
// is the enforcement layer; this is the prediction. If the engine ever
// says "free" where the constraint says "no", a customer gets told their
// dates are held and then hits an error — the worst outcome in the system.
//
// The constraint holds `daterange(starts_on, ends_on, '[]')` — inclusive
// at BOTH ends. So the return day is already held: a tool coming back
// Tuesday cannot be collected by someone else on Tuesday. `changeoverDays`
// extends that tail further; 0 means "matches the constraint exactly".
// ─────────────────────────────────────────────────────────────────────

import { AVAILABILITY_HORIZON_DAYS } from "./config";
import { isClosedDay } from "./charging";
import { addDays, eachDay, endOfMonth, isISODate, startOfMonth, weekdayIndex, type ISODate } from "./dates";
import type { AvailabilityContext, CalendarDay, DayState, Hold, RangeCheck } from "./types";

/** A hold widened by the item's changeover gap. */
type OccupiedSpan = { startsOn: ISODate; endsOn: ISODate; kind: Hold["kind"] };

/**
 * Widen each hold by the changeover gap.
 *
 * `changeoverDays` of 1 means the day after a return is also unavailable,
 * so the tool can be checked over before it goes out again. It only ever
 * grows the span, which keeps the superset invariant above intact.
 */
export function occupiedSpans(ctx: AvailabilityContext): OccupiedSpan[] {
  const gap = Math.max(0, ctx.changeoverDays | 0);
  return ctx.holds.map((h) => ({
    startsOn: h.startsOn,
    endsOn: gap > 0 ? addDays(h.endsOn, gap) : h.endsOn,
    kind: h.kind,
  }));
}

/** The span holding `iso`, or null when the day is free of commitments. */
function spanCovering(iso: ISODate, spans: OccupiedSpan[]): OccupiedSpan | null {
  for (const s of spans) {
    if (iso >= s.startsOn && iso <= s.endsOn) return s;
  }
  return null;
}

/**
 * What a single day looks like.
 *
 * Order is deliberate and matches the approved prototype: a past day reads
 * as past even if it was booked, and a weekend reads as closed even when
 * the tool is out — because in both cases the reason the customer can't
 * have it is the earlier one. `dayInfo()` returns both facts when the
 * caller needs them.
 */
export function dayState(iso: ISODate, ctx: AvailabilityContext): DayState {
  return dayInfo(iso, ctx).state;
}

/** Full picture of a day: its state, whether the tool is committed, selectability. */
export function dayInfo(
  iso: ISODate,
  ctx: AvailabilityContext,
  spans: OccupiedSpan[] = occupiedSpans(ctx),
): CalendarDay {
  const span = spanCovering(iso, spans);
  const held = span !== null;

  let state: DayState;
  if (iso < ctx.today) state = "past";
  else if (isClosedDay(iso)) state = "closed";
  else if (span) state = span.kind === "block" ? "blocked" : "out";
  else state = "free";

  return {
    date: iso,
    state,
    isToday: iso === ctx.today,
    selectable: state === "free",
    held,
  };
}

/** True when a customer may collect or return on this day. */
export function isDayAvailable(iso: ISODate, ctx: AvailabilityContext): boolean {
  return dayInfo(iso, ctx).selectable;
}

/**
 * The month grid the calendar renders.
 *
 * `leadingBlanks` is how many empty cells precede the 1st, with the week
 * starting Monday — the UI shouldn't have to work that out itself.
 */
export function monthCalendar(
  anchor: ISODate,
  ctx: AvailabilityContext,
): { month: ISODate; leadingBlanks: number; days: CalendarDay[] } {
  const first = startOfMonth(anchor);
  const spans = occupiedSpans(ctx);
  return {
    month: first,
    leadingBlanks: weekdayIndex(first),
    days: eachDay(first, endOfMonth(anchor)).map((d) => dayInfo(d, ctx, spans)),
  };
}

/**
 * The next day this tool can actually be collected, or null if nothing
 * comes free inside the horizon (the card then reads "Ask us about dates").
 */
export function nextFreeDate(
  ctx: AvailabilityContext,
  horizonDays: number = AVAILABILITY_HORIZON_DAYS,
): ISODate | null {
  const spans = occupiedSpans(ctx);
  for (let i = 0; i < horizonDays; i++) {
    const d = addDays(ctx.today, i);
    if (dayInfo(d, ctx, spans).selectable) return d;
  }
  return null;
}

/** Held days inside a window — what the public availability endpoint exposes. Dates only, never PII. */
export function heldDaysBetween(
  from: ISODate,
  to: ISODate,
  ctx: AvailabilityContext,
): ISODate[] {
  const spans = occupiedSpans(ctx);
  return eachDay(from, to).filter((d) => spanCovering(d, spans) !== null);
}

/**
 * Check a proposed collect/return pair.
 *
 * Messages are written as a next step rather than a complaint — the
 * customer should always be told what to do, not just that they can't.
 * The booking endpoint runs this before insert; the database constraint
 * is still the final word on conflicts.
 */
export function checkHireRange(
  startsOn: string,
  endsOn: string,
  ctx: AvailabilityContext,
): RangeCheck {
  if (!isISODate(startsOn) || !isISODate(endsOn)) {
    return {
      ok: false,
      reason: "invalid-date",
      message: "Pick your collect and return dates on the calendar.",
    };
  }

  if (endsOn < startsOn) {
    return {
      ok: false,
      reason: "ends-before-starts",
      message: "The return date falls before the collection date — pick the day you'll bring it back.",
    };
  }

  if (startsOn < ctx.today) {
    return {
      ok: false,
      reason: "starts-in-past",
      message: "That collection date has passed. Pick a day from today onwards.",
    };
  }

  if (isClosedDay(startsOn)) {
    return {
      ok: false,
      reason: "starts-on-closed-day",
      message:
        "We're shut on the weekend, so you can't collect on a Saturday or Sunday. " +
        "Collect on the Friday instead — the weekend isn't charged.",
    };
  }

  if (isClosedDay(endsOn)) {
    return {
      ok: false,
      reason: "ends-on-closed-day",
      message:
        "We're shut on the weekend, so you can't bring it back on a Saturday or Sunday. " +
        "Keep it over the weekend and return it on the Monday — you won't be charged for those days.",
    };
  }

  // Every day of the run must be clear, including the return day: the tool
  // is committed right up to the moment it comes back.
  const spans = occupiedSpans(ctx);
  for (const d of eachDay(startsOn, endsOn)) {
    if (spanCovering(d, spans)) {
      return {
        ok: false,
        reason: "crosses-held-day",
        message:
          "That run crosses a day the tool is already booked. " +
          "Pick a shorter hire or a later start — the calendar shows what's free.",
      };
    }
  }

  return { ok: true };
}

/**
 * Check dates Thomas wants to block out.
 *
 * Deliberately more permissive than a customer hire: Thomas can block a
 * weekend (the tool is at his own job over the weekend even though the
 * counter is shut) and can block from today. He cannot block dates a
 * customer already holds — that's a phone call, not a database write.
 */
export function checkBlockRange(
  startsOn: string,
  endsOn: string,
  ctx: AvailabilityContext,
): RangeCheck {
  if (!isISODate(startsOn) || !isISODate(endsOn)) {
    return { ok: false, reason: "invalid-date", message: "Pick the dates you want to block out." };
  }

  if (endsOn < startsOn) {
    return {
      ok: false,
      reason: "ends-before-starts",
      message: "The last day falls before the first — pick the end of the block.",
    };
  }

  if (startsOn < ctx.today) {
    return {
      ok: false,
      reason: "starts-in-past",
      message: "That start date has passed. Block from today onwards.",
    };
  }

  // Compare against the raw holds, not the widened spans: a changeover gap
  // is there to protect the next customer, and shouldn't stop Thomas
  // putting his own job in the diary the day after a return.
  for (const d of eachDay(startsOn, endsOn)) {
    const clash = ctx.holds.find((h) => d >= h.startsOn && d <= h.endsOn);
    if (clash) {
      return {
        ok: false,
        reason: "crosses-held-day",
        message:
          clash.kind === "hire"
            ? "A customer already holds those dates. If you need the tool back, give them a call — " +
              "blocking it here won't tell them."
            : "Those dates are already blocked out.",
      };
    }
  }

  return { ok: true };
}
