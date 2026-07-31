import { expect, test } from "@playwright/test";

import {
  SMS_SOFT_LIMIT,
  confirmedForCustomer,
  forcesUnicode,
  hireNotifyMobile,
  newRequestForThomas,
  type BookingSmsContext,
} from "@/lib/hire/sms";

const CTX: BookingSmsContext = {
  reference: "TRD-4KHW",
  customerName: "Jane Citizen",
  customerPhone: "0400 000 000",
  equipmentName: "Cement Mixer",
  startsOn: "2026-08-07", // Fri
  endsOn: "2026-08-10", // Mon
  totalDueAtPickupCents: 20_000,
};

const ADMIN_URL = "https://app.trdepledgegardeningandmaintenance.com/admin/hire/bookings";

test.describe("the text to Thomas", () => {
  test("carries everything he needs to act", () => {
    const msg = newRequestForThomas(CTX, ADMIN_URL);
    expect(msg).toContain("Cement Mixer");
    expect(msg).toContain("Jane Citizen");
    expect(msg).toContain("0400 000 000");
    expect(msg).toContain("Fri, 7 Aug");
    expect(msg).toContain("Mon, 10 Aug");
    expect(msg).toContain("$200");
    expect(msg).toContain("TRD-4KHW");
    expect(msg).toContain(ADMIN_URL);
  });

  test("leads with the tool, not with pleasantries", () => {
    expect(newRequestForThomas(CTX, ADMIN_URL)).toMatch(/^New hire request:/);
  });
});

test.describe("the text to the customer", () => {
  test("only goes out on confirmation, and says confirmed", () => {
    const msg = confirmedForCustomer(CTX);
    expect(msg).toContain("is confirmed");
    // A request is not a booking; the confirmation copy is the one place
    // that word is allowed, and it must not leak into anything else.
    expect(msg).not.toMatch(/request/i);
  });

  test("carries what they need at the counter", () => {
    const msg = confirmedForCustomer(CTX);
    expect(msg).toContain("Cement Mixer");
    expect(msg).toContain("Fri, 7 Aug");
    expect(msg).toContain("Mon, 10 Aug");
    expect(msg).toContain("$200");
    expect(msg).toContain("photo ID");
    expect(msg).toContain("bond");
    expect(msg).toContain("TRD-4KHW");
    expect(msg).toContain("0474 844 204");
  });

  test("a waived bond changes what they are told to bring", () => {
    const withBond = confirmedForCustomer(CTX);
    const noBond = confirmedForCustomer({ ...CTX, bondWaived: true });

    expect(withBond).toContain("a card for the bond");
    expect(noBond).not.toContain("a card for the bond");
    expect(noBond).toContain("no bond on this one");

    // Photo ID is an identity check, not a bond condition — it survives.
    expect(noBond).toContain("photo ID");
  });

  test("uses the first name only", () => {
    expect(confirmedForCustomer(CTX)).toContain("Hi Jane,");
    expect(confirmedForCustomer(CTX)).not.toContain("Jane Citizen");
  });

  test("survives a one-word or blank name rather than reading oddly", () => {
    expect(confirmedForCustomer({ ...CTX, customerName: "Jane" })).toContain("Hi Jane,");
    expect(confirmedForCustomer({ ...CTX, customerName: "  " })).toContain("Hi there,");
  });
});

// The expensive failure mode. A GSM-7 segment is 160 characters; one
// non-GSM character (a curly quote, an en dash, an emoji) drops the whole
// message to 70-character UCS-2 segments and multiplies the bill. Easy to
// introduce with a copy edit, invisible until the Twilio invoice arrives.
test.describe("encoding and length", () => {
  const messages = [
    ["to Thomas", newRequestForThomas(CTX, ADMIN_URL)],
    ["to customer", confirmedForCustomer(CTX)],
    // The waived-bond variant is a different sentence, so it needs its own
    // budget check — it is not covered by the one above.
    ["to customer, no bond", confirmedForCustomer({ ...CTX, bondWaived: true })],
  ] as const;

  for (const [who, msg] of messages) {
    test(`${who}: stays inside two GSM segments`, () => {
      expect(msg.length, msg).toBeLessThanOrEqual(SMS_SOFT_LIMIT);
    });

    test(`${who}: uses no character that forces UCS-2`, () => {
      expect(forcesUnicode(msg), msg).toBe(false);
    });
  }

  test("the guard actually catches the usual offenders", () => {
    // Guard against the guard: a regex that matched nothing would make the
    // tests above pass vacuously.
    expect(forcesUnicode("plain ascii text")).toBe(false);
    expect(forcesUnicode("curly ’quote’")).toBe(true);
    expect(forcesUnicode("en – dash")).toBe(true);
    expect(forcesUnicode("emoji 🚜")).toBe(true);
    expect(forcesUnicode("ellipsis…")).toBe(true);
  });

  test("a long tool name still fits", () => {
    const long = confirmedForCustomer({
      ...CTX,
      equipmentName: "60L Steel Lawn Roller with Extension Handle",
      customerName: "Bartholomew Fotheringay-Smythe",
    });
    expect(long.length).toBeLessThanOrEqual(SMS_SOFT_LIMIT);
  });
});

test.describe("who gets notified", () => {
  const original = process.env.HIRE_NOTIFY_MOBILE;
  test.afterEach(() => {
    if (original === undefined) delete process.env.HIRE_NOTIFY_MOBILE;
    else process.env.HIRE_NOTIFY_MOBILE = original;
  });

  test("falls back to the flyer number when unset", () => {
    delete process.env.HIRE_NOTIFY_MOBILE;
    expect(hireNotifyMobile()).toBe("0474 844 204");
  });

  test("the env var wins when set", () => {
    process.env.HIRE_NOTIFY_MOBILE = "0400 111 222";
    expect(hireNotifyMobile()).toBe("0400 111 222");
  });

  test("a blank env var falls back rather than texting nobody", () => {
    process.env.HIRE_NOTIFY_MOBILE = "   ";
    expect(hireNotifyMobile()).toBe("0474 844 204");
  });
});
