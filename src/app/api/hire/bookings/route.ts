import { NextResponse } from "next/server";

import {
  PENDING_HOLD_HOURS,
  checkHireRange,
  holdExpiresAt,
  makeReference,
  quoteHire,
  toDbAmount,
  validateBooking,
} from "@/lib/hire";
import {
  availabilityContextFor,
  getEquipmentBySlug,
  releaseExpiredHolds,
} from "@/lib/hire/repo";
import { adminBookingsUrl, hireNotifyMobile, newRequestForThomas } from "@/lib/hire/sms";
import { after } from "@/lib/after";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { sendSms } from "@/lib/twilio";
import { getServiceClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public endpoint. Creates a PENDING reservation — a request, not a booking.
// Nothing is charged here and nothing is confirmed; Thomas does that from the
// admin console (phase 5) and the customer gets a text (phase 6).
//
// ─────────────────────────────────────────────────────────────────────
// WHAT THIS ROUTE REFUSES TO TRUST
//
//  * The total. Recomputed from the equipment row every time. A tampered
//    payload gets charged the database rate, not the submitted figure —
//    the client's numbers are never even read.
//  * The equipment. Looked up by slug with `is_published` enforced, so
//    posting directly can't book a tool that isn't on the public floor.
//  * The dates. Re-checked against the live diary through the same engine
//    the calendar uses, and then again by the database's exclusion
//    constraint, which is the only thing that can settle a race.
//  * The shape. `validateBooking` runs here as well as in the browser.
// ─────────────────────────────────────────────────────────────────────

/** Postgres error codes we handle by name rather than by string matching. */
const EXCLUSION_VIOLATION = "23P01";
const UNIQUE_VIOLATION = "23505";

/** How many times to re-roll a reference before giving up. */
const REFERENCE_ATTEMPTS = 5;

export async function POST(req: Request) {
  // Rate limit. 5 requests / 10 min per IP — far above a person fixing a
  // typo, far below a script. Matches the enquiry form's budget.
  const ip = clientIp(req);
  const limit = rateLimit(`hire-bookings:${ip}`, { max: 5, windowMs: 10 * 60 * 1000 });
  if (!limit.ok) {
    return NextResponse.json(
      {
        error:
          "That's a few requests in a row. Give it a few minutes, or call Thomas on 0474 844 204.",
      },
      { status: 429, headers: { "Retry-After": String(Math.ceil(limit.resetMs / 1000)) } },
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!raw || typeof raw !== "object") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  const body = raw as Record<string, unknown>;

  // Honeypot. The form ships a hidden `website` field a real browser never
  // fills. Respond 200 so the bot believes it worked and doesn't retry with
  // a different shape — same trick as the enquiry form.
  if (typeof body.website === "string" && body.website.trim()) {
    console.warn("[hire/bookings] honeypot triggered, ignoring", { ip });
    return NextResponse.json({ ok: true, persisted: false });
  }

  const validation = validateBooking({
    slug: body.slug as string,
    startsOn: body.startsOn as string,
    endsOn: body.endsOn as string,
    name: body.name as string,
    phone: body.phone as string,
    email: body.email as string,
    jobNotes: body.jobNotes as string,
    acceptedTerms: body.acceptedTerms === true,
  });
  if (!validation.ok) {
    return NextResponse.json(
      { error: validation.message, problems: validation.problems },
      { status: 400 },
    );
  }
  const booking = validation.value;

  const supabase = getServiceClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Bookings are briefly unavailable. Call Thomas on 0474 844 204." },
      { status: 503 },
    );
  }

  try {
    // Release anything whose 24 hours are up BEFORE checking availability.
    // The calendar already ignores expired pendings, so without this sweep
    // the engine could call a day free while the exclusion constraint —
    // which still sees the stale row — rejects the insert.
    await releaseExpiredHolds(supabase);

    // Published-only lookup: rule 4. An unpublished tool is not bookable,
    // including by posting straight at this endpoint.
    const equipment = await getEquipmentBySlug(supabase, booking.slug);
    if (!equipment) {
      return NextResponse.json(
        { error: "That tool isn't available to hire. Pick another from the list." },
        { status: 404 },
      );
    }

    const ctx = await availabilityContextFor(supabase, equipment);
    const check = checkHireRange(booking.startsOn, booking.endsOn, ctx);
    if (!check.ok) {
      return NextResponse.json({ error: check.message, reason: check.reason }, { status: 409 });
    }

    // Priced from the equipment row. The client's figures are never read.
    const quote = quoteHire(equipment, booking.startsOn, booking.endsOn);
    const expiresAt = holdExpiresAt(new Date(), PENDING_HOLD_HOURS);

    // Retry only for reference collisions. An overlap is a real conflict and
    // must not be retried — the dates genuinely went while they were typing.
    for (let attempt = 0; attempt < REFERENCE_ATTEMPTS; attempt++) {
      const reference = makeReference();
      const { error } = await supabase.from("reservations").insert({
        equipment_id: equipment.id,
        kind: "hire",
        status: "pending",
        starts_on: booking.startsOn,
        ends_on: booking.endsOn,
        reference,
        customer_name: booking.name,
        customer_phone: booking.phone,
        customer_email: booking.email,
        job_notes: booking.jobNotes,
        charged_days: quote.chargedDays,
        hire_total: toDbAmount(quote.hireSubtotalCents),
        bond_total: toDbAmount(quote.bondCents),
        expires_at: expiresAt,
      });

      if (!error) {
        // Tell Thomas. Dispatched AFTER the insert and outside the response
        // path: a Twilio outage must never cost a customer their booking.
        // `after()` keeps the serverless instance alive long enough for the
        // send to finish, which a bare floating promise would not.
        after(
          sendSms(
            hireNotifyMobile(),
            newRequestForThomas(
              {
                reference,
                customerName: booking.name,
                customerPhone: booking.phone,
                equipmentName: equipment.name,
                startsOn: booking.startsOn,
                endsOn: booking.endsOn,
                totalDueAtPickupCents: quote.totalDueAtPickupCents,
              },
              adminBookingsUrl(),
            ),
            { trigger_type: "auto", recipient_name: "Thomas Depledge" },
            supabase,
          ).catch((err) => console.error("[hire/bookings] notify failed", err)),
        );

        return NextResponse.json({
          ok: true,
          reference,
          equipment: { name: equipment.name, slug: equipment.slug },
          startsOn: booking.startsOn,
          endsOn: booking.endsOn,
          chargedDays: quote.chargedDays,
          hireSubtotalCents: quote.hireSubtotalCents,
          bondCents: quote.bondCents,
          totalDueAtPickupCents: quote.totalDueAtPickupCents,
          holdExpiresAt: expiresAt,
        });
      }

      const code = (error as { code?: string }).code;

      if (code === EXCLUSION_VIOLATION) {
        // Someone else's insert landed between our check and ours. This is
        // the race the database exists to settle — report it plainly and
        // tell them what to do next.
        return NextResponse.json(
          {
            error:
              "Someone just booked those dates. Pick another run on the calendar — it's been refreshed.",
            reason: "crosses-held-day",
          },
          { status: 409 },
        );
      }

      if (code === UNIQUE_VIOLATION) {
        // Almost certainly the reference. Re-roll and try again.
        console.warn("[hire/bookings] reference collision, retrying", { attempt });
        continue;
      }

      console.error("[hire/bookings] insert failed", error);
      return NextResponse.json(
        { error: "That didn't save. Try again, or call Thomas on 0474 844 204." },
        { status: 500 },
      );
    }

    console.error("[hire/bookings] exhausted reference attempts");
    return NextResponse.json(
      { error: "That didn't save. Try again, or call Thomas on 0474 844 204." },
      { status: 500 },
    );
  } catch (err) {
    console.error("[hire/bookings] unexpected failure", err);
    return NextResponse.json(
      { error: "That didn't save. Try again, or call Thomas on 0474 844 204." },
      { status: 500 },
    );
  }
}
