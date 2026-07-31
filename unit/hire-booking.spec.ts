import { expect, test } from "@playwright/test";

import {
  holdExpiresAt,
  makeReference,
  problemsMessage,
  validateBooking,
  type BookingInput,
} from "@/lib/hire/booking";

const VALID: BookingInput = {
  slug: "cement-mixer",
  startsOn: "2026-08-03", // Mon
  endsOn: "2026-08-05", // Wed
  name: "Jane Citizen",
  phone: "0400 000 000",
  email: "jane@example.com",
  jobNotes: "Laying pavers down the side of the house.",
  acceptedTerms: true,
};

test.describe("a complete request", () => {
  test("is accepted and trimmed", () => {
    const res = validateBooking({ ...VALID, name: "  Jane Citizen  " });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.name).toBe("Jane Citizen");
    expect(res.value.slug).toBe("cement-mixer");
    expect(res.value.jobNotes).toBe("Laying pavers down the side of the house.");
  });

  test("omitted job notes become null rather than an empty string", () => {
    const res = validateBooking({ ...VALID, jobNotes: "   " });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.jobNotes).toBeNull();
  });

  test("over-long fields are truncated, not rejected", () => {
    const res = validateBooking({ ...VALID, name: "a".repeat(500) });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.name).toHaveLength(120);
  });
});

test.describe("problems are reported together", () => {
  test("an empty request lists every problem in one message", () => {
    const res = validateBooking({});
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.problems).toEqual(["equipment", "dates", "name", "phone", "email", "terms"]);
    expect(res.message).toContain("Nearly there —");
  });

  test("the message reads as a next step, not a complaint", () => {
    const res = validateBooking({ ...VALID, name: "", email: "nope" });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    // The spec's own example wording.
    expect(res.message).toBe("Nearly there — add your name, check your email address.");
  });

  test("one problem still reads naturally", () => {
    expect(problemsMessage(["terms"])).toBe("Nearly there — tick the ID and terms box.");
  });
});

test.describe("field rules", () => {
  test("accepts the ways Australians write a phone number", () => {
    for (const phone of ["0400 000 000", "+61 400 000 000", "(08) 8821 0000", "0400000000"]) {
      expect(validateBooking({ ...VALID, phone }).ok, phone).toBe(true);
    }
  });

  test("rejects a phone that is too short or clearly not a number", () => {
    for (const phone of ["", "12345", "call me", "0400-000-000x"]) {
      expect(validateBooking({ ...VALID, phone }).ok, phone).toBe(false);
    }
  });

  test("rejects an email without an @ and a dotted domain", () => {
    for (const email of ["", "jane", "jane@example", "jane at example.com"]) {
      expect(validateBooking({ ...VALID, email }).ok, email).toBe(false);
    }
  });

  test("the terms box must be ticked, not merely present", () => {
    expect(validateBooking({ ...VALID, acceptedTerms: false }).ok).toBe(false);
    // A truthy-but-not-true value must not slip through a JSON payload.
    expect(validateBooking({ ...VALID, acceptedTerms: "yes" as unknown as boolean }).ok).toBe(false);
  });

  test("rejects malformed and reversed dates", () => {
    expect(validateBooking({ ...VALID, startsOn: "2026-02-31" }).ok).toBe(false);
    expect(validateBooking({ ...VALID, startsOn: "03/08/2026" }).ok).toBe(false);
    expect(validateBooking({ ...VALID, startsOn: "2026-08-05", endsOn: "2026-08-03" }).ok).toBe(false);
  });

  test("same-day collect and return is allowed — it bills the one-day minimum", () => {
    expect(validateBooking({ ...VALID, endsOn: VALID.startsOn }).ok).toBe(true);
  });
});

test.describe("references", () => {
  test("look like TRD-XXXX", () => {
    expect(makeReference()).toMatch(/^TRD-[A-Z2-9]{4}$/);
  });

  test("avoid characters that get misheard on the phone", () => {
    // No O/0, I/1/L, S/5, B/8 — Thomas reads these out loud.
    const refs = Array.from({ length: 300 }, () => makeReference().slice(4)).join("");
    expect(refs).not.toMatch(/[O0IL1S5B8]/);
  });

  test("are drawn from the byte array given, so the mapping is checkable", () => {
    // Alphabet is "ACDEFGHJKMNPQRTUVWXYZ2346" (25 symbols).
    expect(makeReference(new Uint8Array([0, 1, 2, 3]))).toBe("TRD-ACDE");
  });

  test("are not obviously repetitive across a large sample", () => {
    const seen = new Set(Array.from({ length: 500 }, () => makeReference()));
    // 25^4 ≈ 390k, so 500 draws should collide rarely; allow a little slack.
    expect(seen.size).toBeGreaterThan(495);
  });
});

test.describe("hold expiry", () => {
  test("is the configured number of hours after the request", () => {
    const from = new Date("2026-08-03T09:00:00Z");
    expect(holdExpiresAt(from, 24)).toBe("2026-08-04T09:00:00.000Z");
  });

  test("carries across a month boundary", () => {
    expect(holdExpiresAt(new Date("2026-08-31T23:00:00Z"), 24)).toBe("2026-09-01T23:00:00.000Z");
  });
});
