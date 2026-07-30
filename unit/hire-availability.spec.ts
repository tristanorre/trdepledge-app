import { expect, test } from "@playwright/test";

import {
  checkBlockRange,
  checkHireRange,
  dayState,
  heldDaysBetween,
  isDayAvailable,
  monthCalendar,
  nextFreeDate,
} from "@/lib/hire/availability";
import type { AvailabilityContext, Hold } from "@/lib/hire/types";

// August 2026: Mon 3, Tue 4, Wed 5, Thu 6, Fri 7, Sat 8, Sun 9, Mon 10.
const MON = "2026-08-03";
const TUE = "2026-08-04";
const WED = "2026-08-05";
const THU = "2026-08-06";
const FRI = "2026-08-07";
const SAT = "2026-08-08";
const SUN = "2026-08-09";
const NEXT_MON = "2026-08-10";

function ctx(over: Partial<AvailabilityContext> = {}): AvailabilityContext {
  return { today: MON, holds: [], changeoverDays: 0, ...over };
}

const hire = (startsOn: string, endsOn: string): Hold => ({ startsOn, endsOn, kind: "hire" });
const block = (startsOn: string, endsOn: string): Hold => ({ startsOn, endsOn, kind: "block" });

test.describe("rule 1 — reservations hold their days", () => {
  test("every day of a hire reads as out, inclusive of both ends", () => {
    const c = ctx({ holds: [hire(TUE, THU)] });
    expect(dayState(TUE, c)).toBe("out");
    expect(dayState(WED, c)).toBe("out");
    expect(dayState(THU, c)).toBe("out");
  });

  test("the return day is held — the tool isn't back until it's back", () => {
    // Mirrors the database constraint, which uses an inclusive daterange.
    const c = ctx({ holds: [hire(TUE, WED)] });
    expect(isDayAvailable(WED, c)).toBe(false);
    expect(isDayAvailable(THU, c)).toBe(true);
  });

  test("Thomas's blocks are distinguishable from customer hires", () => {
    expect(dayState(TUE, ctx({ holds: [block(TUE, TUE)] }))).toBe("blocked");
    expect(dayState(TUE, ctx({ holds: [hire(TUE, TUE)] }))).toBe("out");
  });

  test("days either side of a hold stay free", () => {
    const c = ctx({ holds: [hire(WED, WED)] });
    expect(dayState(TUE, c)).toBe("free");
    expect(dayState(THU, c)).toBe("free");
  });
});

test.describe("rule 2 — the counter is shut at the weekend", () => {
  test("Saturday and Sunday are never selectable", () => {
    const c = ctx();
    expect(dayState(SAT, c)).toBe("closed");
    expect(dayState(SUN, c)).toBe("closed");
    expect(isDayAvailable(SAT, c)).toBe(false);
    expect(isDayAvailable(SUN, c)).toBe(false);
  });

  test("a hire may span the weekend but not start or end on one", () => {
    const c = ctx();
    expect(checkHireRange(FRI, NEXT_MON, c).ok).toBe(true); // spans Sat+Sun
    expect(checkHireRange(SAT, NEXT_MON, c).ok).toBe(false); // collects Saturday
    expect(checkHireRange(FRI, SUN, c).ok).toBe(false); // returns Sunday
  });

  test("a hire spanning the weekend still marks it held for everyone else", () => {
    // Rule 2 is about the counter; the tool is physically out regardless.
    const c = ctx({ holds: [hire(FRI, NEXT_MON)] });
    expect(heldDaysBetween(FRI, NEXT_MON, c)).toEqual([FRI, SAT, SUN, NEXT_MON]);

    const cal = monthCalendar(MON, c);
    const sat = cal.days.find((d) => d.date === SAT)!;
    // `state` reports "closed" because that's what governs selection, but
    // `held` tells the admin calendar the gear is genuinely out.
    expect(sat.state).toBe("closed");
    expect(sat.held).toBe(true);
    expect(sat.selectable).toBe(false);
  });

  test("a free weekend is closed but not held", () => {
    const sat = monthCalendar(MON, ctx()).days.find((d) => d.date === SAT)!;
    expect(sat.state).toBe("closed");
    expect(sat.held).toBe(false);
  });
});

test.describe("rule 3 — the past is never available", () => {
  test("yesterday is not selectable", () => {
    const c = ctx({ today: WED });
    expect(dayState(TUE, c)).toBe("past");
    expect(isDayAvailable(TUE, c)).toBe(false);
  });

  test("today is selectable when nothing holds it", () => {
    const c = ctx({ today: WED });
    expect(dayState(WED, c)).toBe("free");
    expect(monthCalendar(WED, c).days.find((d) => d.date === WED)!.isToday).toBe(true);
  });

  test("a past date is rejected with a next step, not a bare error", () => {
    const res = checkHireRange(TUE, THU, ctx({ today: WED }));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe("starts-in-past");
    expect(res.message).toContain("Pick a day from today onwards");
  });
});

test.describe("changeover gap — the per-item switch", () => {
  test("at 0 the tool is collectable the day after it comes back", () => {
    const c = ctx({ holds: [hire(TUE, WED)], changeoverDays: 0 });
    expect(isDayAvailable(THU, c)).toBe(true);
  });

  test("at 1 the day after the return is held too", () => {
    const c = ctx({ holds: [hire(TUE, WED)], changeoverDays: 1 });
    expect(isDayAvailable(THU, c)).toBe(false);
    expect(isDayAvailable(FRI, c)).toBe(true);
  });

  test("the gap only ever widens a hold, never narrows it", () => {
    // Guards the invariant that the engine must never offer a day the
    // database's exclusion constraint would reject.
    const held0 = heldDaysBetween(MON, NEXT_MON, ctx({ holds: [hire(TUE, WED)], changeoverDays: 0 }));
    const held2 = heldDaysBetween(MON, NEXT_MON, ctx({ holds: [hire(TUE, WED)], changeoverDays: 2 }));
    for (const d of held0) expect(held2).toContain(d);
    expect(held2.length).toBeGreaterThan(held0.length);
  });
});

test.describe("next free date", () => {
  test("returns today when the tool is on the floor", () => {
    expect(nextFreeDate(ctx({ today: MON }))).toBe(MON);
  });

  test("skips over a booking", () => {
    expect(nextFreeDate(ctx({ today: MON, holds: [hire(MON, TUE)] }))).toBe(WED);
  });

  test("skips the weekend", () => {
    // Booked out to Friday, so the next collectable day is the Monday.
    expect(nextFreeDate(ctx({ today: MON, holds: [hire(MON, FRI)] }))).toBe(NEXT_MON);
  });

  test("returns null when nothing frees up inside the horizon", () => {
    expect(nextFreeDate(ctx({ today: MON, holds: [hire(MON, "2027-01-01")] }), 30)).toBeNull();
  });
});

test.describe("checking a proposed hire", () => {
  test("a clear weekday run is accepted", () => {
    expect(checkHireRange(TUE, THU, ctx()).ok).toBe(true);
  });

  test("a run crossing a booked day is refused and says what to do", () => {
    const res = checkHireRange(MON, FRI, ctx({ holds: [hire(WED, WED)] }));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe("crosses-held-day");
    expect(res.message).toContain("Pick a shorter hire or a later start");
  });

  test("a run crossing one of Thomas's blocks is refused", () => {
    expect(checkHireRange(MON, FRI, ctx({ holds: [block(WED, WED)] })).ok).toBe(false);
  });

  test("a return before the collection is refused", () => {
    const res = checkHireRange(THU, TUE, ctx());
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe("ends-before-starts");
  });

  test("a malformed date is refused rather than coerced", () => {
    for (const bad of ["", "not-a-date", "2026-02-31", "03/08/2026", "2026-8-3"]) {
      const res = checkHireRange(bad, THU, ctx());
      expect(res.ok, `${bad} should be rejected`).toBe(false);
      if (!res.ok) expect(res.reason).toBe("invalid-date");
    }
  });

  test("the weekend refusal explains the free weekend rather than just refusing", () => {
    const res = checkHireRange(FRI, SUN, ctx());
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.message).toContain("return it on the Monday");
  });
});

test.describe("checking dates Thomas wants to block", () => {
  test("Thomas may block a weekend — his own job doesn't stop for the counter", () => {
    expect(checkBlockRange(SAT, SUN, ctx()).ok).toBe(true);
  });

  test("Thomas cannot block dates a customer already holds", () => {
    const res = checkBlockRange(TUE, THU, ctx({ holds: [hire(WED, WED)] }));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe("crosses-held-day");
    // Blocking must not silently take a tool off a customer.
    expect(res.message).toContain("give them a call");
  });

  test("an existing block reports differently to a customer hire", () => {
    const res = checkBlockRange(TUE, TUE, ctx({ holds: [block(TUE, TUE)] }));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.message).toContain("already blocked");
  });

  test("a changeover gap does not stop Thomas booking his own job", () => {
    // The gap protects the next customer, not Thomas's diary.
    const c = ctx({ holds: [hire(TUE, WED)], changeoverDays: 1 });
    expect(checkBlockRange(THU, THU, c).ok).toBe(true);
  });

  test("blocking in the past is refused", () => {
    expect(checkBlockRange(TUE, THU, ctx({ today: WED })).ok).toBe(false);
  });
});

test.describe("month calendar", () => {
  test("August 2026 starts on a Monday, so there are no leading blanks", () => {
    const cal = monthCalendar(MON, ctx());
    expect(cal.month).toBe("2026-08-01");
    // 1 Aug 2026 is a Saturday → 5 blanks before it with a Monday week start.
    expect(cal.leadingBlanks).toBe(5);
    expect(cal.days).toHaveLength(31);
  });

  test("days before today in the same month read as past", () => {
    const cal = monthCalendar(MON, ctx({ today: NEXT_MON }));
    expect(cal.days.find((d) => d.date === MON)!.state).toBe("past");
    expect(cal.days.find((d) => d.date === NEXT_MON)!.state).toBe("free");
  });

  test("February 2028 gets its leap day", () => {
    expect(monthCalendar("2028-02-10", ctx({ today: "2028-02-01" })).days).toHaveLength(29);
  });
});
