import { expect, test } from "@playwright/test";

import { chargedDays, fmtHireMoney, isClosedDay, quoteHire } from "@/lib/hire/charging";

// Anchors used throughout. August 2026:
//   Mon 3, Tue 4, Wed 5, Thu 6, Fri 7, Sat 8, Sun 9, Mon 10 … Mon 17
const MON = "2026-08-03";
const TUE = "2026-08-04";
const WED = "2026-08-05";
const FRI = "2026-08-07";
const SAT = "2026-08-08";
const SUN = "2026-08-09";
const NEXT_MON = "2026-08-10";

test.describe("closed days", () => {
  test("Saturday and Sunday are the only closed days", () => {
    expect(isClosedDay(SAT)).toBe(true);
    expect(isClosedDay(SUN)).toBe(true);
    for (const d of [MON, TUE, WED, "2026-08-06", FRI]) {
      expect(isClosedDay(d), `${d} should be open`).toBe(false);
    }
  });
});

// The four rows of the charging table in the spec. These are the numbers
// advertised on the public page, so they are the ones that must not drift.
test.describe("charged days — the spec's table", () => {
  test("Fri → Mon charges one day", () => {
    expect(chargedDays(FRI, NEXT_MON)).toBe(1);
  });

  test("Mon → Tue charges one day", () => {
    expect(chargedDays(MON, TUE)).toBe(1);
  });

  test("Mon → Wed charges two days", () => {
    expect(chargedDays(MON, WED)).toBe(2);
  });

  test("Mon → following Mon charges five days", () => {
    expect(chargedDays(MON, NEXT_MON)).toBe(5);
  });
});

test.describe("charged days — edges", () => {
  test("same-day collect and return still charges the one-day minimum", () => {
    expect(chargedDays(MON, MON)).toBe(1);
  });

  test("the return day is never charged", () => {
    // Mon→Tue and Mon→Wed differ by exactly the Tuesday.
    expect(chargedDays(MON, WED) - chargedDays(MON, TUE)).toBe(1);
  });

  test("a weekend inside the hire is free", () => {
    // Fri → Wed spans Sat and Sun; only Fri, Mon, Tue are charged.
    expect(chargedDays(FRI, "2026-08-12")).toBe(3);
  });

  test("a fortnight over two weekends charges ten days", () => {
    // Mon 3 Aug → Mon 17 Aug: two full working weeks, both weekends free.
    expect(chargedDays(MON, "2026-08-17")).toBe(10);
  });
});

test.describe("quote", () => {
  const mixer = { dailyRateCents: 5_000, bondCents: 10_000 }; // $50/day, $100 bond

  test("total due at pickup is charged days × rate + bond", () => {
    const q = quoteHire(mixer, MON, WED);
    expect(q.chargedDays).toBe(2);
    expect(q.hireSubtotalCents).toBe(10_000);
    expect(q.bondCents).toBe(10_000);
    expect(q.totalDueAtPickupCents).toBe(20_000);
  });

  test("a weekend-spanning hire costs the same as the Friday alone", () => {
    const weekend = quoteHire(mixer, FRI, NEXT_MON);
    const single = quoteHire(mixer, MON, TUE);
    expect(weekend.totalDueAtPickupCents).toBe(single.totalDueAtPickupCents);
  });

  test("arithmetic stays in integer cents", () => {
    // $79.99/day for 3 days must not drift into float error.
    const q = quoteHire({ dailyRateCents: 7_999, bondCents: 15_000 }, MON, "2026-08-06");
    expect(q.hireSubtotalCents).toBe(23_997);
    expect(q.totalDueAtPickupCents).toBe(38_997);
    expect(Number.isInteger(q.totalDueAtPickupCents)).toBe(true);
  });
});

test.describe("money formatting", () => {
  test("whole dollars carry no decimals", () => {
    expect(fmtHireMoney(5_000)).toBe("$50");
    expect(fmtHireMoney(15_000)).toBe("$150");
  });

  test("part-dollars keep two decimals", () => {
    expect(fmtHireMoney(7_999)).toBe("$79.99");
  });

  test("thousands are grouped", () => {
    expect(fmtHireMoney(125_000)).toBe("$1,250");
  });
});
