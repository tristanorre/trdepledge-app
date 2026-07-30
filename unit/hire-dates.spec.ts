import { expect, test } from "@playwright/test";

import {
  addDays,
  addMonths,
  daysBetween,
  eachDay,
  endOfMonth,
  isISODate,
  startOfMonth,
  today,
  toEpochDay,
  toISO,
  weekdayIndex,
} from "@/lib/hire/dates";
import { checkHireRange } from "@/lib/hire/availability";

test.describe("ISO validation", () => {
  test("accepts real calendar dates", () => {
    for (const d of ["2026-08-03", "2028-02-29", "2026-12-31"]) {
      expect(isISODate(d), d).toBe(true);
    }
  });

  test("rejects malformed and impossible dates", () => {
    // 2026-02-31 matters: Date.UTC rolls it forward to 3 March rather than
    // failing, so a naive parser would silently book the wrong day.
    for (const d of ["2026-02-31", "2026-13-01", "2026-8-3", "03/08/2026", "", "2026-08-03T00:00:00Z"]) {
      expect(isISODate(d), String(d)).toBe(false);
    }
    expect(isISODate(null)).toBe(false);
    expect(isISODate(20260803)).toBe(false);
  });

  test("2027 is not a leap year", () => {
    expect(isISODate("2027-02-29")).toBe(false);
  });
});

test.describe("arithmetic", () => {
  test("adding days crosses month and year boundaries", () => {
    expect(addDays("2026-08-03", 1)).toBe("2026-08-04");
    expect(addDays("2026-08-31", 1)).toBe("2026-09-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });

  test("adding days crosses a leap day", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2028-02-29", 1)).toBe("2028-03-01");
    expect(addDays("2027-02-28", 1)).toBe("2027-03-01");
  });

  test("epoch-day conversion round-trips", () => {
    for (const d of ["2026-08-03", "2028-02-29", "1999-12-31", "2031-06-15"]) {
      expect(toISO(toEpochDay(d))).toBe(d);
    }
  });

  test("weekday index runs Monday to Sunday", () => {
    const expected: Record<string, number> = {
      "2026-08-03": 0, // Mon
      "2026-08-04": 1,
      "2026-08-05": 2,
      "2026-08-06": 3,
      "2026-08-07": 4, // Fri
      "2026-08-08": 5, // Sat
      "2026-08-09": 6, // Sun
    };
    for (const [d, i] of Object.entries(expected)) expect(weekdayIndex(d), d).toBe(i);
  });

  test("daysBetween is signed", () => {
    expect(daysBetween("2026-08-03", "2026-08-10")).toBe(7);
    expect(daysBetween("2026-08-10", "2026-08-03")).toBe(-7);
    expect(daysBetween("2026-08-03", "2026-08-03")).toBe(0);
  });

  test("eachDay is inclusive, and empty when reversed", () => {
    expect(eachDay("2026-08-03", "2026-08-05")).toEqual(["2026-08-03", "2026-08-04", "2026-08-05"]);
    expect(eachDay("2026-08-03", "2026-08-03")).toEqual(["2026-08-03"]);
    expect(eachDay("2026-08-05", "2026-08-03")).toEqual([]);
  });

  test("month boundaries", () => {
    expect(startOfMonth("2026-08-17")).toBe("2026-08-01");
    expect(endOfMonth("2026-08-17")).toBe("2026-08-31");
    expect(endOfMonth("2026-02-10")).toBe("2026-02-28");
    expect(endOfMonth("2028-02-10")).toBe("2028-02-29");
  });

  test("adding months clamps to the last valid day", () => {
    expect(addMonths("2026-08-31", 1)).toBe("2026-09-30");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-01-15", -1)).toBe("2025-12-15");
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-15");
  });
});

// ─────────────────────────────────────────────────────────────────────
// Timezone. The spec calls this a correctness issue, not a detail: a
// server running UTC is a different calendar day to Wallaroo for the last
// ~9.5 hours of every UTC day, and would silently accept bookings in the
// past.
//
// These tests freeze the clock and move the server's zone around. The
// engine must give the same answer every time.
// ─────────────────────────────────────────────────────────────────────
test.describe.serial("Australia/Adelaide is the source of truth for 'today'", () => {
  const RealDate = globalThis.Date;
  const realTZ = process.env.TZ;

  function freezeAt(instant: string) {
    const fixed = new RealDate(instant).getTime();
    class FrozenDate extends RealDate {
      constructor(...args: unknown[]) {
        if (args.length === 0) super(fixed);
        // @ts-expect-error — forwarding the real Date overloads verbatim.
        else super(...args);
      }
      static now() {
        return fixed;
      }
    }
    globalThis.Date = FrozenDate as DateConstructor;
  }

  test.afterEach(() => {
    globalThis.Date = RealDate;
    if (realTZ === undefined) delete process.env.TZ;
    else process.env.TZ = realTZ;
  });

  test("late in the UTC day, today() is already tomorrow in Adelaide", () => {
    // 20:00 UTC on 3 Aug is 05:30 on 4 Aug in Adelaide (UTC+9:30, no DST
    // in August). A server reading its own UTC clock would say the 3rd.
    process.env.TZ = "UTC";
    freezeAt("2026-08-03T20:00:00Z");
    expect(today()).toBe("2026-08-04");
  });

  test("the same instant early in the UTC day agrees with UTC", () => {
    process.env.TZ = "UTC";
    freezeAt("2026-08-03T02:00:00Z"); // 11:30 Adelaide, same date
    expect(today()).toBe("2026-08-03");
  });

  test("daylight saving is handled — Adelaide runs UTC+10:30 in January", () => {
    process.env.TZ = "UTC";
    freezeAt("2026-01-15T14:00:00Z"); // 00:30 on the 16th in Adelaide
    expect(today()).toBe("2026-01-16");
  });

  test("today() ignores the server's zone entirely", () => {
    const answers = new Set<string>();
    for (const tz of ["UTC", "America/New_York", "Pacific/Midway", "Pacific/Kiritimati", "Europe/Helsinki"]) {
      process.env.TZ = tz;
      freezeAt("2026-08-03T20:00:00Z");
      answers.add(today());
    }
    // One instant, one Adelaide date, no matter where the box sits.
    expect([...answers]).toEqual(["2026-08-04"]);
  });

  test("date arithmetic is identical under a hostile server zone", () => {
    const run = () => ({
      add: addDays("2026-08-03", 1),
      back: addDays("2026-08-01", -1),
      weekday: weekdayIndex("2026-08-08"),
      monthEnd: endOfMonth("2026-08-03"),
      span: eachDay("2026-08-07", "2026-08-10"),
    });

    process.env.TZ = "UTC";
    const utc = run();
    for (const tz of ["Pacific/Midway", "Pacific/Kiritimati", "America/Anchorage"]) {
      process.env.TZ = tz;
      expect(run(), tz).toEqual(utc);
    }
    expect(utc.add).toBe("2026-08-04");
    expect(utc.weekday).toBe(5); // Saturday
  });

  test("yesterday in Adelaide cannot be booked, even when UTC still calls it today", () => {
    // The acceptance test from the spec. At 20:00 UTC on 3 Aug it is
    // already the 4th in Wallaroo, so the 3rd is in the past — a server
    // trusting its own UTC clock would happily accept it.
    process.env.TZ = "UTC";
    freezeAt("2026-08-03T20:00:00Z");

    const c = { today: today(), holds: [], changeoverDays: 0 };
    expect(c.today).toBe("2026-08-04");

    const res = checkHireRange("2026-08-03", "2026-08-05", c);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe("starts-in-past");

    // …and the 4th, which is today in Adelaide, is still bookable.
    expect(checkHireRange("2026-08-04", "2026-08-05", c).ok).toBe(true);
  });
});
