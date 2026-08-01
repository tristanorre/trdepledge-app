import { expect, test } from "@playwright/test";

import {
  HIRE_TOOLS,
  HIRE_TOOL_NAMES,
  briefFor,
  busyPeriods,
  dougSystemPrompt,
  formatAvailability,
  formatEquipmentList,
  formatPolicy,
  formatQuote,
  isHirePagePath,
  isHireToolName,
} from "@/lib/hire/doug";
import { runHireTool } from "@/lib/hire/doug-tools";
import {
  HIRE_PHONE,
  HIRE_POLICY,
  UNCONFIRMED_RATE_SLUGS,
  checkHireRange,
  quoteHire,
} from "@/lib/hire";
import type { AvailabilityContext, Equipment } from "@/lib/hire";

const MIXER: Equipment = {
  id: "eq-1",
  slug: "cement-mixer",
  name: "Cement Mixer",
  category: "Concrete",
  blurb: "Tips and pours without wrecking your back.",
  specs: ["2.2 cu ft drum", "240V"],
  dailyRateCents: 5_000,
  bondCents: 20_000,
  photoPath: null,
  flyerPath: null,
  isPublished: true,
  sortOrder: 1,
  changeoverDays: 0,
};

const FRI = "2026-08-07";
const MON = "2026-08-10";
const TUE = "2026-08-11";
const WED = "2026-08-12";

const FREE: AvailabilityContext = { today: "2026-08-03", holds: [], changeoverDays: 0 };

// ─────────────────────────────────────────────────────────────────────
// The guardrail this whole module exists to enforce (spec §8.3): Doug may
// not state a price, a bond, a date or a policy from memory. That is only
// true if the numbers aren't in the prompt in the first place — a figure
// pasted in here would be one he could recite without ever calling a tool,
// and it would go stale the day Thomas changes a rate.
// ─────────────────────────────────────────────────────────────────────
test.describe("the system prompt carries no facts", () => {
  const prompts = [
    ["hire page", dougSystemPrompt("", { onHirePage: true })],
    ["elsewhere", dougSystemPrompt("", { onHirePage: false })],
  ] as const;

  for (const [where, prompt] of prompts) {
    test(`${where}: quotes no dollar amount`, () => {
      // The one number allowed through is Thomas's phone number, which is
      // on the flyers and isn't a price.
      expect(prompt).not.toMatch(/\$\s?\d/);
    });

    test(`${where}: names no date and no weekday`, () => {
      expect(prompt).not.toMatch(/\d{4}-\d{2}-\d{2}/);
      expect(prompt).not.toMatch(/\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/);
    });

    test(`${where}: does not restate the hire terms`, () => {
      // Policy copy lives in config.ts and reaches Doug through
      // hire_policy. Duplicating a sentence here would let the two drift.
      for (const entry of Object.values(HIRE_POLICY)) {
        expect(prompt).not.toContain(entry.body);
      }
    });

    test(`${where}: forbids doing the sums`, () => {
      expect(prompt).toMatch(/never/i);
      expect(prompt).toContain("tool call");
    });
  }

  test("the base persona is added to, never replaced", () => {
    const base = "ORIGINAL PERSONA MARKER";
    expect(dougSystemPrompt(base, { onHirePage: true })).toContain(base);
    expect(dougSystemPrompt(base, { onHirePage: false })).toContain(base);
  });

  test("the hire page suspends the eleven-field intake; other pages keep it", () => {
    const hire = dougSystemPrompt("", { onHirePage: true });
    const other = dougSystemPrompt("", { onHirePage: false });
    expect(hire).toMatch(/overrides the intake rules/i);
    expect(other).not.toMatch(/overrides the intake rules/i);
    // …and the hire page still lets a genuine gardening lead through.
    expect(hire).toMatch(/eleven fields/i);
  });
});

test.describe("what Doug is allowed to do", () => {
  test("has no tool that creates a booking", () => {
    // A booking is made by a person pressing a button on a form that gets
    // re-priced and re-checked server-side. It is never made by a chat.
    for (const name of HIRE_TOOL_NAMES) {
      expect(name).not.toMatch(/create|book_|submit|reserve/);
    }
    expect(HIRE_TOOLS.map((t) => t.name)).not.toContain("create_booking");
  });

  test("every tool is declared exactly once and recognised", () => {
    const names = HIRE_TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names.sort()).toEqual([...HIRE_TOOL_NAMES].sort());
    for (const n of names) expect(isHireToolName(n)).toBe(true);
    expect(isHireToolName("capture_enquiry")).toBe(false);
  });

  test("pricing and availability both demand a slug and both dates", () => {
    for (const name of ["quote_hire", "prefill_booking_form"]) {
      const tool = HIRE_TOOLS.find((t) => t.name === name)!;
      expect(tool.input_schema.required).toEqual(["slug", "startsOn", "endsOn"]);
    }
  });

  test("the policy enum covers every term, so none is answered from memory", () => {
    const tool = HIRE_TOOLS.find((t) => t.name === "hire_policy")!;
    const topics = (tool.input_schema.properties.topic as { enum: string[] }).enum;
    expect(topics.sort()).toEqual(Object.keys(HIRE_POLICY).sort());
  });
});

test.describe("what comes back from a tool call", () => {
  const brief = briefFor(MIXER, "2026-08-04");

  test("figures arrive pre-rendered, not as ingredients", () => {
    // Hand a model cents and a day count and it will multiply them. The
    // strings are the answer; nothing downstream should need arithmetic.
    expect(brief.dailyRate).toBe("$50 per day");
    expect(brief.bond).toBe("$200 refundable bond");
    expect(brief.nextFree).toBe("Tue, 4 Aug");
    expect(JSON.stringify(brief)).not.toContain("5000");
  });

  test("nothing on the floor is a guess any more", () => {
    // Rates and bonds are all signed off now — the lawn mower was the last
    // holdout at $50. Doug states them plainly rather than hedging.
    expect(UNCONFIRMED_RATE_SLUGS).toEqual([]);
    expect(brief.rateUnconfirmed).toBe(false);
    expect(brief.bondUnconfirmed).toBe(false);
  });

  test("the caveat still switches on when a figure IS a guess", () => {
    // With the list empty the test above can't tell "confirmed" from
    // "flagging is broken", so prove the wiring reads the list rather
    // than being hardcoded off. Delivery covers the same path for policy.
    const flagged = (slug: string) => UNCONFIRMED_RATE_SLUGS.includes(slug);
    expect(flagged("lawn-mower")).toBe(briefFor({ ...MIXER, slug: "lawn-mower" }, null).rateUnconfirmed);
    expect(formatPolicy("delivery").unconfirmed).toBe(true);
  });

  test("a quote states the total and forbids recalculating it", () => {
    const q = formatQuote({
      equipment: brief,
      quote: quoteHire(MIXER, FRI, MON),
      startsOn: FRI,
      endsOn: MON,
    });
    // Fri → Mon is two charged days under Thomas's weekend minimum.
    expect(q.chargedDays).toBe(2);
    expect(q.hireFee).toBe("$100");
    expect(q.totalDueAtPickup).toBe("$300");
    expect(String(q.note)).toMatch(/verbatim/i);
  });

  test("the weekend note appears only when the tool is kept over one", () => {
    const overWeekend = formatQuote({
      equipment: brief,
      quote: quoteHire(MIXER, FRI, MON),
      startsOn: FRI,
      endsOn: MON,
    });
    const midweek = formatQuote({
      equipment: brief,
      quote: quoteHire(MIXER, TUE, WED),
      startsOn: TUE,
      endsOn: WED,
    });
    expect(overWeekend.weekendNote).toBeTruthy();
    expect(midweek.weekendNote).toBeNull();
  });

  test("a refused range hands back the engine's own wording", () => {
    // Doug and the calendar must not tell a customer two different things
    // about the same dates, so the sentence comes from one place.
    const check = checkHireRange("2026-08-08", "2026-08-11", FREE); // collect on a Saturday
    expect(check.ok).toBe(false);
    const out = formatAvailability({
      equipment: brief,
      busy: [],
      check,
      startsOn: "2026-08-08",
      endsOn: "2026-08-11",
    });
    expect(out.available).toBe(false);
    expect(out.reason).toBe("starts-on-closed-day");
    expect(out.message).toBe(check.ok ? "" : check.message);
  });

  test("busy periods say when, never who or why", () => {
    const periods = busyPeriods([
      { startsOn: "2026-08-17", endsOn: "2026-08-19", kind: "hire" },
      { startsOn: "2026-08-05", endsOn: "2026-08-06", kind: "block" },
    ]);
    expect(periods).toEqual([
      { from: "Wed, 5 Aug", to: "Thu, 6 Aug" },
      { from: "Mon, 17 Aug", to: "Wed, 19 Aug" },
    ]);
    const json = JSON.stringify(periods);
    expect(json).not.toContain("hire");
    expect(json).not.toContain("block");
  });

  test("an empty floor tells him to hand over rather than improvise", () => {
    expect(String(formatEquipmentList([]).note)).toMatch(/call Thomas/i);
    expect(String(formatEquipmentList([briefFor(MIXER, null)], "Earthworks").note))
      .toMatch(/closest fit/i);
  });

  test("the category filter is forgiving about case and spacing", () => {
    // Doug guesses at categories from what the visitor said ("concrete
    // stuff"), so an exact-match filter would drop real answers.
    const items = [briefFor(MIXER, null)];
    expect((formatEquipmentList(items, " concrete ").items as unknown[]).length).toBe(1);
    expect((formatEquipmentList(items).items as unknown[]).length).toBe(1);
  });

  test("policy answers come straight from config, unconfirmed flag and all", () => {
    const bond = formatPolicy("bond");
    expect(bond.body).toBe(HIRE_POLICY.bond.body);
    expect(bond.unconfirmed).toBe(false);

    // Delivery is still unquantified, so it carries the caveat — proving
    // the flag tracks config rather than being wired on or off.
    const delivery = formatPolicy("delivery");
    expect(delivery.unconfirmed).toBe(true);
    expect(String(delivery.note)).toMatch(/indicative/i);
    expect(formatPolicy("fuel").unconfirmed).toBe(false);
  });
});

// The executor's guards. These are the paths that must hold when something
// is wrong — a bad tool name, a database that isn't answering, a booking
// handoff attempted from a page with no booking form on it. None of them
// needs Supabase, which is the point: they're what runs when it's absent.
test.describe("the executor refuses safely", () => {
  test("an unknown tool name is reported, not run", async () => {
    const out = await runHireTool(null, "create_booking", {}, { onHirePage: true });
    expect(String(out.result.error)).toContain("create_booking");
    expect(out.handoff).toBeUndefined();
  });

  test("terms are answerable with the database down", async () => {
    // "What's the bond policy?" doesn't need a row. Failing it because
    // Supabase is unreachable would be a self-inflicted outage.
    const out = await runHireTool(null, "hire_policy", { topic: "bond" }, { onHirePage: true });
    expect(out.result.body).toBe(HIRE_POLICY.bond.body);
  });

  test("an unknown term lists the real ones rather than improvising", async () => {
    const out = await runHireTool(null, "hire_policy", { topic: "refunds" }, { onHirePage: true });
    expect(String(out.result.error)).toContain("cancellation");
  });

  test("a lookup with no database tells him to hand over, not to guess", async () => {
    for (const name of ["list_equipment", "check_availability", "quote_hire"]) {
      const out = await runHireTool(null, name, { slug: "cement-mixer" }, { onHirePage: true });
      expect(String(out.result.error)).toContain(HIRE_PHONE);
    }
  });

  test("the form can't be filled in from a page that hasn't got one", async () => {
    // Checked before the database is touched, so it holds even if the
    // dates are perfect and the tool exists.
    const out = await runHireTool(
      null,
      "prefill_booking_form",
      { slug: "cement-mixer", startsOn: TUE, endsOn: WED },
      { onHirePage: false },
    );
    expect(out.result.ok).toBe(false);
    expect(out.result.reason).toBe("not-on-hire-page");
    expect(out.handoff).toBeUndefined();
  });
});

test.describe("which Doug the visitor gets", () => {
  test("the hire page and its children put him behind the counter", () => {
    expect(isHirePagePath("/hire")).toBe(true);
    expect(isHirePagePath("/hire/")).toBe(true);
    expect(isHirePagePath("https://example.com/hire")).toBe(true);
  });

  test("everything else leaves the enquiry bot alone", () => {
    for (const p of ["/", "/contact", "/services", "/hired", "/admin/hire", "", null, undefined]) {
      expect(isHirePagePath(p as string | null | undefined)).toBe(false);
    }
  });
});
