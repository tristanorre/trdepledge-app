// Doug's hire desk — the pure half.
//
// Tool schemas, the prompt that turns Doug into a hire counter, and the
// formatters that turn engine output into something he can read aloud.
// No database and no clock live here, so the whole surface is unit-testable
// without Supabase; `./doug-tools` is the executor that fetches the rows.
//
// ─────────────────────────────────────────────────────────────────────
// WHY THE FORMATTERS EXIST
//
// Doug must never state a price, a bond or a date that he worked out
// himself (spec §8.3). Every figure he says has to come back from a tool
// call. That's only true if the tool result already contains the SENTENCE,
// not the ingredients — hand a model `dailyRateCents: 8000` and `days: 2`
// and it will happily multiply, which is exactly the arithmetic we don't
// want it doing. So each formatter returns pre-rendered strings ("$160",
// "Fri, 7 Aug") and the prompt tells him to quote them verbatim.
//
// The numbers themselves stay alongside for the app's own use (the booking
// handoff needs real ISO dates), never for Doug to recompute from.
// ─────────────────────────────────────────────────────────────────────

import {
  BONDS_CONFIRMED,
  COUNTER_HOURS,
  HIRE_PHONE,
  HIRE_POLICY,
  UNCONFIRMED_RATE_SLUGS,
  WEEKEND_NOTE,
  type PolicyTopic,
} from "./config";
import { fmtHireMoney, isClosedDay } from "./charging";
import { addDays, fmtHireDate, type ISODate } from "./dates";
import type { Equipment, Hold, Quote, RangeCheck } from "./types";

/** The tool names Doug is allowed to call on the hire side. */
export const HIRE_TOOL_NAMES = [
  "list_equipment",
  "check_availability",
  "quote_hire",
  "hire_policy",
  "prefill_booking_form",
] as const;

export type HireToolName = (typeof HIRE_TOOL_NAMES)[number];

export function isHireToolName(name: string): name is HireToolName {
  return (HIRE_TOOL_NAMES as readonly string[]).includes(name);
}

const POLICY_TOPICS = Object.keys(HIRE_POLICY) as PolicyTopic[];

/**
 * Tool definitions, in Anthropic Messages API shape.
 *
 * Note what is NOT here: there is no `create_booking`. Doug can look
 * things up and he can fill the form in, but a booking is only ever made
 * by a person pressing "Send booking request" — the endpoint that writes
 * a reservation re-prices and re-checks everything and is reached from
 * the page, not from a conversation.
 */
export const HIRE_TOOLS = [
  {
    name: "list_equipment",
    description:
      "List the tools available to hire, with their daily rate, bond and the next day each " +
      "one is free. Call this before naming any tool, rate or bond — the yard changes and " +
      "your memory of it is not the source of truth. Optionally filter by category.",
    input_schema: {
      type: "object" as const,
      properties: {
        category: {
          type: "string",
          description:
            "Optional category filter, e.g. \"Concreting\" or \"Earthworks\". Omit to list everything. " +
            "If you're unsure of the exact wording, omit it and filter the answer yourself.",
        },
      },
      required: [],
    },
  },
  {
    name: "check_availability",
    description:
      "Check whether a tool is free. Pass just the slug to get its next free day and the " +
      "periods it's already committed; pass collect and return dates as well to check one " +
      "specific run. Never tell a visitor a date is free without calling this first.",
    input_schema: {
      type: "object" as const,
      properties: {
        slug: {
          type: "string",
          description: "The tool's slug, exactly as returned by list_equipment (e.g. \"cement-mixer\").",
        },
        startsOn: {
          type: "string",
          description: "Collection date as YYYY-MM-DD. Omit to just ask when the tool is next free.",
        },
        endsOn: {
          type: "string",
          description: "Return date as YYYY-MM-DD. The day it comes back — it isn't charged.",
        },
      },
      required: ["slug"],
    },
  },
  {
    name: "quote_hire",
    description:
      "Price a specific run: how many days are charged, the hire fee, the bond and the total " +
      "due at pickup. Also confirms the dates are free. This is the ONLY way you may state a " +
      "price — never multiply a daily rate yourself.",
    input_schema: {
      type: "object" as const,
      properties: {
        slug:     { type: "string", description: "The tool's slug from list_equipment." },
        startsOn: { type: "string", description: "Collection date, YYYY-MM-DD." },
        endsOn:   { type: "string", description: "Return date, YYYY-MM-DD." },
      },
      required: ["slug", "startsOn", "endsOn"],
    },
  },
  {
    name: "hire_policy",
    description:
      "Get the wording of a hire term — bond, counter hours, pickup, delivery, fuel, damage, " +
      "ID requirements, how the day is counted, or cancellation. Use this for any 'what if' or " +
      "'do I have to' question rather than answering from memory; the terms are Thomas's and " +
      "they change.",
    input_schema: {
      type: "object" as const,
      properties: {
        topic: {
          type: "string",
          enum: POLICY_TOPICS,
          description: "Which term to look up.",
        },
      },
      required: ["topic"],
    },
  },
  {
    name: "prefill_booking_form",
    description:
      "Fill in the booking form on the page with a tool and a set of dates, and scroll the " +
      "visitor to it. Use this the moment someone says they want to go ahead — it saves them " +
      "re-picking what you've already agreed. It does NOT book anything: they still type their " +
      "own name and number and press the button. Only works while they're on the hire page.",
    input_schema: {
      type: "object" as const,
      properties: {
        slug:     { type: "string", description: "The tool's slug from list_equipment." },
        startsOn: { type: "string", description: "Collection date, YYYY-MM-DD." },
        endsOn:   { type: "string", description: "Return date, YYYY-MM-DD." },
      },
      required: ["slug", "startsOn", "endsOn"],
    },
  },
];

// ─────────────────────────────────────────────────────────────────────
// Result formatters
// ─────────────────────────────────────────────────────────────────────

/** One row of the catalogue as Doug receives it. */
export type EquipmentBrief = {
  name: string;
  slug: string;
  category: string;
  blurb: string | null;
  specs: string[];
  /** Pre-rendered — "$80". Quote verbatim. */
  dailyRate: string;
  bond: string;
  /** True when the figure hasn't been signed off by Thomas yet. */
  rateUnconfirmed: boolean;
  bondUnconfirmed: boolean;
  /** "Tue, 12 Aug", or null when nothing comes free inside the horizon. */
  nextFree: string | null;
  /** ISO form, for passing straight back into another tool call. */
  nextFreeDate: ISODate | null;
};

export function briefFor(
  equipment: Equipment,
  nextFree: ISODate | null,
): EquipmentBrief {
  return {
    name: equipment.name,
    slug: equipment.slug,
    category: equipment.category,
    blurb: equipment.blurb,
    specs: equipment.specs,
    dailyRate: `${fmtHireMoney(equipment.dailyRateCents)} per day`,
    bond: `${fmtHireMoney(equipment.bondCents)} refundable bond`,
    rateUnconfirmed: UNCONFIRMED_RATE_SLUGS.includes(equipment.slug),
    bondUnconfirmed: !BONDS_CONFIRMED,
    nextFree: nextFree ? fmtHireDate(nextFree) : null,
    nextFreeDate: nextFree,
  };
}

export function formatEquipmentList(
  items: EquipmentBrief[],
  category?: string,
): Record<string, unknown> {
  const filtered = category
    ? items.filter((i) => i.category.toLowerCase() === category.trim().toLowerCase())
    : items;

  return {
    items: filtered,
    // Said once here rather than in the prompt, so it can't drift from the
    // flags on each row.
    note:
      filtered.length === 0
        ? category
          ? `Nothing on the floor under "${category}". List everything and offer the closest fit.`
          : "Nothing is listed for hire right now. Tell them to call Thomas."
        : "Quote these figures exactly as written. Where a figure is flagged unconfirmed, say " +
          `it's indicative and Thomas will confirm on ${HIRE_PHONE}.`,
  };
}

/** A committed period, described without saying who has it or why. */
export type BusyPeriod = { from: string; to: string };

export function formatAvailability(args: {
  equipment: EquipmentBrief;
  busy: BusyPeriod[];
  /** Present only when the visitor named dates. */
  check?: RangeCheck;
  startsOn?: string;
  endsOn?: string;
}): Record<string, unknown> {
  const base: Record<string, unknown> = {
    tool: args.equipment.name,
    slug: args.equipment.slug,
    nextFree: args.equipment.nextFree,
    nextFreeDate: args.equipment.nextFreeDate,
    alreadyBooked: args.busy,
    counterHours: COUNTER_HOURS.weekdays + ", closed Saturday and Sunday",
  };

  if (!args.check) {
    return {
      ...base,
      note:
        args.busy.length === 0
          ? "Nothing booked in that window — any weekday is collectable."
          : "Those periods are spoken for. Everything else is free.",
    };
  }

  if (args.check.ok) {
    return {
      ...base,
      requested: { collect: fmtSafe(args.startsOn), return: fmtSafe(args.endsOn) },
      available: true,
      note: "Those dates are free. Offer to price it with quote_hire.",
    };
  }

  return {
    ...base,
    requested: { collect: fmtSafe(args.startsOn), return: fmtSafe(args.endsOn) },
    available: false,
    reason: args.check.reason,
    // The engine's own wording. It's written as a next step, not a
    // complaint, and it's the same sentence the calendar shows — so Doug
    // and the page can't tell a visitor two different things.
    message: args.check.message,
    note: "Say this in your own voice, but keep the suggested next step.",
  };
}

export function formatQuote(args: {
  equipment: EquipmentBrief;
  quote: Quote;
  startsOn: ISODate;
  endsOn: ISODate;
}): Record<string, unknown> {
  const { quote } = args;
  const spansWeekend = keepsToolOverWeekend(args.startsOn, args.endsOn);

  return {
    tool: args.equipment.name,
    slug: args.equipment.slug,
    collect: fmtHireDate(args.startsOn),
    return: fmtHireDate(args.endsOn),
    chargedDays: quote.chargedDays,
    dailyRate: fmtHireMoney(quote.dailyRateCents),
    hireFee: fmtHireMoney(quote.hireSubtotalCents),
    bond: fmtHireMoney(quote.bondCents),
    totalDueAtPickup: fmtHireMoney(quote.totalDueAtPickupCents),
    bondUnconfirmed: args.equipment.bondUnconfirmed,
    rateUnconfirmed: args.equipment.rateUnconfirmed,
    weekendNote: spansWeekend ? WEEKEND_NOTE : null,
    note:
      "Quote these strings verbatim — do not recalculate anything. Nothing is paid online; " +
      "the total is due at the counter. Then offer prefill_booking_form.",
  };
}

export function formatPolicy(topic: PolicyTopic): Record<string, unknown> {
  const entry = HIRE_POLICY[topic];
  return {
    topic,
    title: entry.title,
    body: entry.body,
    unconfirmed: entry.unconfirmed === true,
    note: entry.unconfirmed
      ? `This wording contains a figure Thomas hasn't signed off. Say it's indicative and he'll confirm on ${HIRE_PHONE}.`
      : "Say this in your own voice without changing what it means.",
  };
}

/**
 * True when the customer keeps the tool across a day the counter is shut.
 *
 * Presentation only — it decides whether to hand Doug the weekend line so
 * he can explain a total that looks larger than the day count suggests.
 * The charged figure itself always comes from `chargedDays`, and the two
 * ask the same question of the same half-open range, so they can't
 * disagree about which runs the note applies to.
 */
function keepsToolOverWeekend(startsOn: ISODate, endsOn: ISODate): boolean {
  for (let d = startsOn; d < endsOn; d = addDays(d, 1)) {
    if (isClosedDay(d)) return true;
  }
  return false;
}

function fmtSafe(iso?: string): string | null {
  return iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? fmtHireDate(iso) : null;
}

/**
 * Collapse holds into the periods a visitor can be told about.
 *
 * Deliberately drops `kind`: whether a tool is out with a customer or on
 * one of Thomas's own jobs is none of the next caller's business, and the
 * answer is the same either way.
 */
export function busyPeriods(holds: Hold[], limit = 8): BusyPeriod[] {
  return [...holds]
    .sort((a, b) => a.startsOn.localeCompare(b.startsOn))
    .slice(0, limit)
    .map((h) => ({ from: fmtHireDate(h.startsOn), to: fmtHireDate(h.endsOn) }));
}

// ─────────────────────────────────────────────────────────────────────
// The prompt
//
// Appended to Doug's existing persona, never in place of it. On the hire
// page the appended section explicitly overrides the lead-capture rules;
// everywhere else it's a short note telling him a hire desk exists.
//
// No rate, bond, date or policy sentence appears in this text. That's the
// point: if it isn't here, he has to call a tool for it.
// ─────────────────────────────────────────────────────────────────────

const HIRE_TOOL_RULES = `
# Hire — the rules you cannot break

- NEVER state a rate, a bond, a total, a charged-day count or an availability date that did not come back from a tool call in THIS conversation. Not from memory, not from earlier in the chat if the dates have changed, not by doing the sums yourself.
- Tool results hand you figures and dates already written out. Say them exactly as written. Do not round one, convert one, or add two together.
- If a tool result flags something as unconfirmed, say so plainly — "that bond's indicative, Thomas will confirm" — rather than presenting it as settled.
- Sending a booking request is not a booking. It holds the dates while Thomas confirms, and he texts back. Never say a booking is confirmed.
- Nothing is paid online. The hire fee and bond are both paid at the counter at pickup.
- You cannot make a booking yourself. prefill_booking_form fills the form in for them; they still type their details and press the button.
- If someone wants something the tools can't answer — delivery cost, a tool that isn't listed, an argument about a bond — hand them to Thomas on ${HIRE_PHONE}.`;

const HIRE_DESK_MODE = `
# YOU ARE ON THE HIRE PAGE — this section overrides the intake rules above

The visitor is looking at DIY tool hire, not asking for a gardener. Do NOT run the eleven-field enquiry flow here: no address, no postcode, no client type, no "is this one-off or ongoing". Asking a bloke who wants a cement mixer for two days whether he's NDIS-funded will lose him.

Your job on this page, in order:

1. Work out what they're doing — the job, not the tool. "Laying a slab" tells you more than "mixer".
2. Call list_equipment and suggest what fits. Say what it costs per day and what the bond is, straight from the tool result.
3. Call check_availability for the days they want. If those days don't work, the tool result tells you what to offer instead — offer it.
4. Call quote_hire once the dates are settled, and give them the total due at pickup.
5. The moment they're happy, call prefill_booking_form and tell them it's filled in below and just needs their name and number.

Keep it short and useful. One question at a time, same as always. Answer terms questions with hire_policy rather than from memory.

If they turn out to want Thomas to do the work rather than hire the gear — "actually can he just come and do it" — switch straight into your normal enquiry intake and collect the eleven fields as usual. That's a better lead than a hire.`;

const HIRE_AVAILABLE_ELSEWHERE = `
# If they ask about hiring tools

T.R. Depledge also hires gear out — mixer, digger, hammer, packer, roller, mower — by the day from the yard. If the visitor asks about hiring rather than having Thomas do the work, drop the enquiry questions for as long as it takes to answer properly: use list_equipment, check_availability, quote_hire and hire_policy, and never quote a rate or a date you didn't get from one of them.

Then point them at the hire page (/hire) to pick their dates and send the request — the booking form only exists there, so prefill_booking_form won't work from here.

Once they've got their answer, pick the enquiry flow back up where you left it, unless it's clear they only ever wanted to hire something. Don't force the eleven fields on someone who just wants a mixer for the weekend.`;

/**
 * Doug's system prompt for this turn.
 *
 * `base` is the existing lead-capture persona, passed in rather than
 * imported so this module stays free of the marketing side and testable
 * on its own.
 */
export function dougSystemPrompt(base: string, opts: { onHirePage: boolean }): string {
  return [
    base,
    HIRE_TOOL_RULES,
    opts.onHirePage ? HIRE_DESK_MODE : HIRE_AVAILABLE_ELSEWHERE,
  ].join("\n\n");
}

/** True when a page path should put Doug behind the hire counter. */
export function isHirePagePath(path: string | undefined | null): boolean {
  if (!path) return false;
  try {
    // Accept a full URL or a bare path — the widget sends location.pathname,
    // but a hand-rolled caller might send either.
    const p = path.startsWith("http") ? new URL(path).pathname : path;
    return p === "/hire" || p.startsWith("/hire/");
  } catch {
    return false;
  }
}
