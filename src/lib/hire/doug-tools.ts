// Doug's hire desk — the executor.
//
// Every tool Doug can call resolves here, and every one of them reads
// through the availability engine. There is no second copy of the rules
// for the chatbot: `list_equipment` is the same catalogue query the public
// page runs, `check_availability` is `checkHireRange`, `quote_hire` is
// `quoteHire`. If the calendar says a day is taken, Doug says so too,
// because it's the same function answering.
//
// SERVER ONLY. This imports ./repo, which holds the Supabase client — it
// is deliberately not re-exported from the @/lib/hire barrel, which client
// components import.
//
// ─────────────────────────────────────────────────────────────────────
// WHAT DOUG CANNOT REACH FROM HERE
//
//  * Customer details. Everything below goes through the PII-free read
//    path (HOLD_COLUMNS / listPublishedEquipment). A conversation with one
//    customer must never be able to surface another's name or number, and
//    the way to guarantee that is for the data never to be fetched.
//  * Unpublished equipment. `listPublishedEquipment` and the published-only
//    slug lookup mean a tool that isn't on the floor can't be talked about,
//    let alone booked.
//  * Writes. Nothing here inserts, updates or deletes. The strongest thing
//    Doug can do is type into a form the visitor then submits themselves.
// ─────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  briefFor,
  busyPeriods,
  formatAvailability,
  formatEquipmentList,
  formatPolicy,
  formatQuote,
  isHireToolName,
  type HireToolName,
} from "./doug";
import { HIRE_PHONE, HIRE_POLICY, type PolicyTopic } from "./config";
import { checkHireRange, nextFreeDate } from "./availability";
import { quoteHire } from "./charging";
import { isISODate, type ISODate } from "./dates";
import type { AvailabilityContext, Equipment } from "./types";
import {
  availabilityContextFor,
  getEquipmentBySlug,
  loadHireCatalogue,
  releaseExpiredHolds,
} from "./repo";

/** What the page should do after a `prefill_booking_form` call. */
export type HireHandoff = {
  slug: string;
  startsOn: ISODate;
  endsOn: ISODate;
};

export type HireToolOutcome = {
  /** JSON-serialisable payload sent back as the tool_result. */
  result: Record<string, unknown>;
  /** Set only by prefill_booking_form, and only on the hire page. */
  handoff?: HireHandoff;
};

/**
 * Run one of Doug's hire tools.
 *
 * Never throws for a bad input: a wrong slug or a nonsense date comes back
 * as a result Doug can read out and recover from. A thrown error would
 * leave the visitor staring at "Doug's on smoko" for a typo.
 */
export async function runHireTool(
  supabase: SupabaseClient | null,
  name: string,
  input: Record<string, unknown>,
  opts: { onHirePage: boolean },
): Promise<HireToolOutcome> {
  if (!isHireToolName(name)) {
    return { result: { error: `Unknown tool "${name}".` } };
  }

  // hire_policy is the one tool that needs no database — it reads config,
  // which is also where the accordion on the page reads from. Answer it
  // even when Supabase is down, because "what's the bond policy" is still
  // a question we can answer.
  if (name === "hire_policy") {
    const topic = String(input.topic ?? "");
    if (!(topic in HIRE_POLICY)) {
      return {
        result: {
          error: `No such term. Ask about one of: ${Object.keys(HIRE_POLICY).join(", ")}.`,
        },
      };
    }
    return { result: formatPolicy(topic as PolicyTopic) };
  }

  // Also answerable without the database: whether there's a form on this
  // page at all is a fact about the page. Checked here rather than in
  // `dispatch` so it gives the useful answer even when Supabase is down —
  // "go to the hire page" beats "the system isn't answering".
  if (name === "prefill_booking_form" && !opts.onHirePage) {
    return {
      result: {
        ok: false,
        reason: "not-on-hire-page",
        note:
          "There's no booking form on this page. Give them the link to the hire page and " +
          "tell them their dates are waiting there.",
      },
    };
  }

  if (!supabase) {
    return {
      result: {
        error:
          "The yard's system isn't answering right now, so you can't check anything. " +
          `Apologise and give them Thomas on ${HIRE_PHONE}.`,
      },
    };
  }

  try {
    return await dispatch(supabase, name, input, opts);
  } catch (err) {
    console.error("[hire/doug-tools] tool failed", name, err);
    return {
      result: {
        error:
          "That lookup didn't come back. Don't guess — tell them you'll need Thomas to " +
          `check, on ${HIRE_PHONE}.`,
      },
    };
  }
}

async function dispatch(
  supabase: SupabaseClient,
  name: Exclude<HireToolName, "hire_policy">,
  input: Record<string, unknown>,
  opts: { onHirePage: boolean },
): Promise<HireToolOutcome> {
  switch (name) {
    case "list_equipment": {
      const { entries } = await loadHireCatalogue(supabase);
      const items = entries.map((e) => briefFor(e.equipment, e.nextFree));
      const category = typeof input.category === "string" ? input.category : undefined;
      return { result: formatEquipmentList(items, category) };
    }

    case "check_availability": {
      const found = await resolve(supabase, input.slug);
      if ("error" in found) return { result: found };
      const { equipment, ctx } = found;

      const brief = briefFor(equipment, nextFreeDate(ctx));
      const busy = busyPeriods(ctx.holds);

      const startsOn = asDate(input.startsOn);
      const endsOn = asDate(input.endsOn);

      // Dates are optional here: "when's the mixer free?" is a different
      // question from "can I have it Tuesday to Thursday?", and both are
      // asked constantly.
      if (!startsOn || !endsOn) {
        return { result: formatAvailability({ equipment: brief, busy }) };
      }

      return {
        result: formatAvailability({
          equipment: brief,
          busy,
          check: checkHireRange(startsOn, endsOn, ctx),
          startsOn,
          endsOn,
        }),
      };
    }

    case "quote_hire": {
      const startsOn = asDate(input.startsOn);
      const endsOn = asDate(input.endsOn);
      if (!startsOn || !endsOn) {
        return {
          result: {
            error: "Need both a collection and a return date as YYYY-MM-DD before I can price it.",
          },
        };
      }

      const found = await resolve(supabase, input.slug);
      if ("error" in found) return { result: found };
      const { equipment, ctx } = found;

      // Price nothing that can't be had. Quoting a run that's already gone
      // is worse than saying no — they'd hold that figure against us.
      const check = checkHireRange(startsOn, endsOn, ctx);
      if (!check.ok) {
        return {
          result: formatAvailability({
            equipment: briefFor(equipment, nextFreeDate(ctx)),
            busy: busyPeriods(ctx.holds),
            check,
            startsOn,
            endsOn,
          }),
        };
      }

      return {
        result: formatQuote({
          equipment: briefFor(equipment, nextFreeDate(ctx)),
          quote: quoteHire(equipment, startsOn, endsOn),
          startsOn,
          endsOn,
        }),
      };
    }

    case "prefill_booking_form": {
      // The onHirePage guard already ran in runHireTool, before the
      // database was consulted at all.
      const startsOn = asDate(input.startsOn);
      const endsOn = asDate(input.endsOn);
      if (!startsOn || !endsOn) {
        return { result: { ok: false, error: "Need both dates as YYYY-MM-DD." } };
      }

      const found = await resolve(supabase, input.slug);
      if ("error" in found) return { result: found };
      const { equipment, ctx } = found;

      // Re-check even though quote_hire almost certainly just did. The
      // form is about to say "these dates are yours" — if a request landed
      // in between, better Doug catches it than the customer does after
      // typing their number in.
      const check = checkHireRange(startsOn, endsOn, ctx);
      if (!check.ok) {
        return {
          result: formatAvailability({
            equipment: briefFor(equipment, nextFreeDate(ctx)),
            busy: busyPeriods(ctx.holds),
            check,
            startsOn,
            endsOn,
          }),
        };
      }

      return {
        handoff: { slug: equipment.slug, startsOn, endsOn },
        result: {
          ok: true,
          tool: equipment.name,
          note:
            "Done — the form below is filled in with that tool and those dates, and the page " +
            "has scrolled to it. Tell them it just needs their name, mobile and email, and " +
            "that sending it holds the dates while Thomas confirms by text.",
        },
      };
    }
  }
}

/**
 * Look an item up and build its availability context in one go.
 *
 * Sweeps expired holds first: a request that has sat unanswered past its
 * 24 hours no longer holds its dates, and Doug should offer them the same
 * moment the calendar does.
 */
async function resolve(
  supabase: SupabaseClient,
  rawSlug: unknown,
): Promise<{ equipment: Equipment; ctx: AvailabilityContext } | { error: string }> {
  const slug = typeof rawSlug === "string" ? rawSlug.trim() : "";
  if (!slug) return { error: "Need the tool's slug. Call list_equipment first." };

  await releaseExpiredHolds(supabase);

  const equipment = await getEquipmentBySlug(supabase, slug);
  if (!equipment) {
    // Published-only lookup, so this covers both "no such tool" and "not on
    // the floor". Doug is told the same thing either way — an unpublished
    // item must not be discoverable by guessing at slugs.
    return {
      error:
        `No tool on the floor with the slug "${slug}". Call list_equipment and use a slug ` +
        "from the result — don't invent one.",
    };
  }

  return { equipment, ctx: await availabilityContextFor(supabase, equipment) };
}

function asDate(v: unknown): ISODate | null {
  return typeof v === "string" && isISODate(v.trim()) ? v.trim() : null;
}
