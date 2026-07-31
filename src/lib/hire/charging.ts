// How a hire is priced. Rule 6 and 7 of the availability spec.
//
// THE RULE
//
// Count each day from `starts_on` up to but EXCLUDING `ends_on`, skipping
// Saturday and Sunday. Minimum one day — or TWO if the hire spans a
// weekend.
//
//   Fri → Mon            2 days  (Fri counts, weekend free, 2-day minimum)
//   Mon → Tue            1 day
//   Mon → Wed            2 days
//   Mon → following Mon  5 days
//   Fri → Wed            3 days  (Fri, Mon, Tue)
//
// The return day isn't charged because the tool comes back that morning,
// and weekend days aren't charged because the counter is shut — nobody
// could collect on a Saturday, so the gear would sit idle regardless.
//
// THE WEEKEND MINIMUM is Thomas's call, and it overrides the original
// build spec, which had Fri → Mon at one day. A tool that goes out Friday
// and comes back Monday is off the floor for three days; billing one was
// too generous. The weekend still isn't *charged* — it just can't drag a
// hire below two days.
//
// This is advertised in three places on the public page (hero strip, terms
// accordion, and Doug's answers). If this function changes, that copy has
// to change with it — `HIRE_POLICY.duration` and `WEEKEND_NOTE` in
// ./config are the only places the wording lives.

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
 * customer doesn't pay for it. Same-day collect-and-return bills the
 * minimum one day.
 *
 * A hire that keeps the tool over a weekend bills at least two days, even
 * though the weekend days themselves are still free. Collecting Friday and
 * returning Monday therefore costs two, not one.
 */
export function chargedDays(startsOn: ISODate, endsOn: ISODate): number {
  let n = 0;
  let spansWeekend = false;
  for (let d = startsOn; d < endsOn; d = addDays(d, 1)) {
    if (isClosedDay(d)) spansWeekend = true;
    else n++;
  }
  return Math.max(n, spansWeekend ? 2 : 1);
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
