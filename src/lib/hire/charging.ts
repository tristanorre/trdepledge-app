// How a hire is priced. Rule 6 and 7 of the availability spec.
//
// THE RULE
//
// Count each day from `starts_on` up to but EXCLUDING `ends_on`, skipping
// Saturday and Sunday. Minimum one day.
//
//   Fri → Mon            1 day   (Fri counts; Sat/Sun free; Mon is the return)
//   Mon → Tue            1 day
//   Mon → Wed            2 days
//   Mon → following Mon  5 days
//
// The return day isn't charged because the tool comes back that morning,
// and the weekend isn't charged because the counter is shut — nobody could
// collect it on a Saturday, so the gear would sit idle regardless.
//
// This is advertised in three places on the public page (hero strip, terms
// accordion, and Doug's answers). If this function changes, that copy has
// to change with it — `HIRE_POLICY.duration` in ./config is the one place
// the wording lives.

import { CLOSED_DAY_INDICES } from "./config";
import { addDays, weekdayIndex, type ISODate } from "./dates";
import type { Equipment, Quote } from "./types";

/** True when the counter is shut — Saturday or Sunday. */
export function isClosedDay(iso: ISODate): boolean {
  return CLOSED_DAY_INDICES.includes(weekdayIndex(iso));
}

/**
 * Chargeable days between collection and return.
 *
 * Half-open on purpose: `endsOn` is the day the tool comes back, and the
 * customer doesn't pay for it. Same-day collect-and-return still bills the
 * minimum one day.
 */
export function chargedDays(startsOn: ISODate, endsOn: ISODate): number {
  let n = 0;
  for (let d = startsOn; d < endsOn; d = addDays(d, 1)) {
    if (!isClosedDay(d)) n++;
  }
  return Math.max(n, 1);
}

/**
 * Price a hire.
 *
 * Rates and bonds come from the equipment row — never from the client.
 * The booking endpoint recomputes this server-side and ignores any total
 * the browser submits.
 */
export function quoteHire(
  equipment: Pick<Equipment, "dailyRateCents" | "bondCents">,
  startsOn: ISODate,
  endsOn: ISODate,
): Quote {
  const days = chargedDays(startsOn, endsOn);
  const hireSubtotalCents = days * equipment.dailyRateCents;
  return {
    chargedDays: days,
    dailyRateCents: equipment.dailyRateCents,
    hireSubtotalCents,
    bondCents: equipment.bondCents,
    totalDueAtPickupCents: hireSubtotalCents + equipment.bondCents,
  };
}

/** "$80" / "$1,250" — whole dollars, the way the flyers and prototype write it. */
export function fmtHireMoney(cents: number): string {
  const dollars = cents / 100;
  const whole = Number.isInteger(dollars);
  return (
    "$" +
    dollars.toLocaleString("en-AU", {
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: 2,
    })
  );
}
