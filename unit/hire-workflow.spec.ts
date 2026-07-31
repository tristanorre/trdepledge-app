import { expect, test } from "@playwright/test";

import {
  actionsFor,
  bondActionFor,
  bondRefusalReason,
  canDecideBond,
  canTransition,
  isOverdue,
  refusalReason,
  transitionFor,
  OPEN_STATUSES,
  STATUS_LABELS,
} from "@/lib/hire/workflow";
import { amountDueAtPickup } from "@/lib/hire/types";
import type { ReservationStatus } from "@/lib/hire/types";

const ALL: ReservationStatus[] = [
  "pending",
  "confirmed",
  "out",
  "returned",
  "declined",
  "cancelled",
  "blocked",
];

test.describe("the happy path", () => {
  test("walks pending → confirmed → out → returned", () => {
    expect(transitionFor("pending", "confirm")?.to).toBe("confirmed");
    expect(transitionFor("confirmed", "mark-picked-up")?.to).toBe("out");
    expect(transitionFor("out", "check-in")?.to).toBe("returned");
  });

  test("declining branches off pending", () => {
    expect(transitionFor("pending", "decline")?.to).toBe("declined");
  });
});

test.describe("what's offered at each step", () => {
  test("a pending request can be confirmed or declined, nothing else", () => {
    expect(actionsFor("pending").map((a) => a.action)).toEqual(["confirm", "decline"]);
  });

  test("a confirmed booking can only be marked picked up", () => {
    expect(actionsFor("confirmed").map((a) => a.action)).toEqual(["mark-picked-up"]);
  });

  test("a tool that's out can only be checked in", () => {
    expect(actionsFor("out").map((a) => a.action)).toEqual(["check-in"]);
  });

  test("terminal and non-customer states offer nothing", () => {
    for (const s of ["returned", "declined", "cancelled", "blocked"] as ReservationStatus[]) {
      expect(actionsFor(s), s).toEqual([]);
    }
  });

  test("every button says what happens", () => {
    for (const s of ALL) {
      for (const a of actionsFor(s)) {
        expect(a.label.length, `${s}/${a.action}`).toBeGreaterThan(0);
        expect(a.label).not.toMatch(/^(OK|Submit|Go)$/i);
      }
    }
  });
});

test.describe("what's refused", () => {
  test("no action can skip a step", () => {
    // Straight from pending to out, or to checked-in, must not be possible.
    expect(canTransition("pending", "mark-picked-up")).toBe(false);
    expect(canTransition("pending", "check-in")).toBe(false);
    expect(canTransition("confirmed", "check-in")).toBe(false);
  });

  test("nothing can be walked backwards", () => {
    expect(canTransition("confirmed", "confirm")).toBe(false);
    expect(canTransition("out", "mark-picked-up")).toBe(false);
    expect(canTransition("returned", "check-in")).toBe(false);
  });

  test("a finished or declined booking can't be reopened", () => {
    for (const s of ["returned", "declined", "cancelled"] as ReservationStatus[]) {
      for (const a of ["confirm", "mark-picked-up", "check-in", "decline"]) {
        expect(canTransition(s, a), `${s}/${a}`).toBe(false);
      }
    }
  });

  test("a block is not a booking and takes no booking actions", () => {
    for (const a of ["confirm", "mark-picked-up", "check-in", "decline"]) {
      expect(canTransition("blocked", a), a).toBe(false);
    }
  });

  test("an unknown action is refused rather than ignored", () => {
    expect(canTransition("pending", "delete")).toBe(false);
    expect(canTransition("pending", "")).toBe(false);
    expect(refusalReason("pending", "delete")).toContain("isn't something you can do");
  });
});

test.describe("refusal messages explain, rather than just refuse", () => {
  test("a finished hire says so", () => {
    expect(refusalReason("returned", "check-in")).toContain("already been checked in");
  });

  test("an expired request is distinguished from a declined one", () => {
    expect(refusalReason("cancelled", "confirm")).toContain("expired");
    expect(refusalReason("declined", "confirm")).toContain("already declined");
    // The distinction matters — they're different conversations to have.
    expect(refusalReason("cancelled", "confirm")).not.toBe(refusalReason("declined", "confirm"));
  });

  test("a mid-flight booking tells you to refresh", () => {
    expect(refusalReason("out", "confirm")).toContain("Refresh");
  });
});

test.describe("declining is guarded", () => {
  test("it asks first, and says the customer still needs telling", () => {
    const decline = transitionFor("pending", "decline")!;
    expect(decline.destructive).toBe(true);
    expect(decline.confirm).toBeTruthy();
    expect(decline.confirm).toMatch(/call or text/i);
  });

  test("confirming a booking doesn't nag", () => {
    expect(transitionFor("pending", "confirm")!.confirm).toBeUndefined();
  });
});

test.describe("supporting data", () => {
  test("every status has a label", () => {
    for (const s of ALL) expect(STATUS_LABELS[s], s).toBeTruthy();
  });

  test("open statuses are exactly the ones holding a tool", () => {
    expect([...OPEN_STATUSES]).toEqual(["pending", "confirmed", "out"]);
  });

  test("overdue means out and past its return date", () => {
    expect(isOverdue("out", "2026-08-03", "2026-08-05")).toBe(true);
    expect(isOverdue("out", "2026-08-05", "2026-08-05")).toBe(false); // due today
    expect(isOverdue("out", "2026-08-07", "2026-08-05")).toBe(false);
    // Only a tool actually out can be overdue.
    expect(isOverdue("confirmed", "2026-08-03", "2026-08-05")).toBe(false);
    expect(isOverdue("returned", "2026-08-03", "2026-08-05")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────
// The bond waiver.
//
// Thomas can decide not to take a bond — a regular he trusts, a trade
// mate, whatever reason he likes. It is deliberately NOT a lifecycle
// transition: a pending request with no bond is still pending, so it gets
// its own gate rather than doubling the state machine.
// ─────────────────────────────────────────────────────────────────────
test.describe("the bond is Thomas's call, up to a point", () => {
  test("he can decide it while the hire is still ahead of him", () => {
    for (const s of ["pending", "confirmed", "out"] as const) {
      expect(canDecideBond(s), s).toBe(true);
      expect(bondActionFor(s, false), s).not.toBeNull();
    }
  });

  test("once it's finished or gone, there's nothing to decide", () => {
    // A returned hire's money has already changed hands (or hasn't);
    // editing the record afterwards would describe a transaction that
    // never happened.
    for (const s of ["returned", "declined", "cancelled", "blocked"] as const) {
      expect(canDecideBond(s), s).toBe(false);
      expect(bondActionFor(s, false), s).toBeNull();
      expect(bondActionFor(s, true), s).toBeNull();
    }
  });

  test("the button offers the opposite of what's currently set", () => {
    expect(bondActionFor("pending", false)?.action).toBe("waive-bond");
    expect(bondActionFor("pending", true)?.action).toBe("reinstate-bond");
  });

  test("both directions ask first — this one costs real money", () => {
    expect(bondActionFor("confirmed", false)?.confirm).toBeTruthy();
    expect(bondActionFor("confirmed", true)?.confirm).toBeTruthy();
  });

  test("waiving before confirming is the tidy path, and the prompt says so", () => {
    // The confirmation text quotes the total. Waive first and the customer
    // is told the right figure; waive after and they've had the higher one.
    expect(bondActionFor("pending", false)?.confirm).toMatch(/before you confirm/i);
    expect(bondActionFor("out", false)?.confirm).toMatch(/already been texted/i);
  });

  test("a refusal explains itself rather than just saying no", () => {
    expect(bondRefusalReason("returned")).toMatch(/finished/i);
    expect(bondRefusalReason("cancelled")).toMatch(/expired/i);
    expect(bondRefusalReason("declined")).toMatch(/declined/i);
  });

  test("bond actions are not lifecycle transitions", () => {
    // If these ever became transitions they'd need a `to` status, and
    // waiving a bond doesn't move a booking anywhere.
    for (const s of ["pending", "confirmed", "out"] as const) {
      expect(canTransition(s, "waive-bond"), s).toBe(false);
      expect(canTransition(s, "reinstate-bond"), s).toBe(false);
    }
  });
});

test.describe("what's actually due at the counter", () => {
  const base = { hireTotalCents: 10_000, bondTotalCents: 10_000 };

  test("bond included by default", () => {
    expect(amountDueAtPickup({ ...base, bondWaived: false })).toBe(20_000);
  });

  test("waiving drops the bond and nothing else", () => {
    expect(amountDueAtPickup({ ...base, bondWaived: true })).toBe(10_000);
  });

  test("the waived bond is still recorded, not erased", () => {
    // "We let this one off $100" is a different fact from "this item has
    // no bond", and only the first tells you what the goodwill cost.
    const booking = { ...base, bondWaived: true };
    expect(booking.bondTotalCents).toBe(10_000);
    expect(amountDueAtPickup(booking)).toBe(10_000);
  });
});
