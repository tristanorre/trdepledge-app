import { expect, test } from "@playwright/test";

import {
  actionsFor,
  canTransition,
  isOverdue,
  refusalReason,
  transitionFor,
  OPEN_STATUSES,
  STATUS_LABELS,
} from "@/lib/hire/workflow";
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
