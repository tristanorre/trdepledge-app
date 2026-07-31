import { NextResponse } from "next/server";

import { canTransition, refusalReason, transitionFor } from "@/lib/hire";
import { confirmedForCustomer } from "@/lib/hire/sms";
import { getAdminReservation } from "@/lib/hire/repo";
import { after } from "@/lib/after";
import { requireApiAdmin, requireSupabase } from "@/lib/api-auth";
import { sendSms } from "@/lib/twilio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Move a booking along the lifecycle:
//
//   pending ──confirm──> confirmed ──mark picked up──> out ──check in──> returned
//      └────decline────> declined
//
// The admin UI decides which buttons to SHOW using the same state machine,
// but that's a convenience — this route decides what actually happens. A
// stale tab, a double-tap, or a hand-rolled request all land here and get
// checked against the booking's current status, not the one the browser
// last saw.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireApiAdmin();
  if (auth instanceof NextResponse) return auth;

  const supabase = requireSupabase();
  if (supabase instanceof NextResponse) return supabase;

  let body: { action?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = String(body.action ?? "");

  try {
    const reservation = await getAdminReservation(supabase, params.id);
    if (!reservation) {
      return NextResponse.json({ error: "That booking no longer exists." }, { status: 404 });
    }

    // Blocks are managed on the availability screen. Refusing here stops a
    // stray request turning one of Thomas's own periods into a customer hire.
    if (reservation.kind !== "hire") {
      return NextResponse.json(
        { error: "That's one of your blocked periods — release it on the availability screen." },
        { status: 409 },
      );
    }

    if (!canTransition(reservation.status, action)) {
      // 409, not 400: the request is well-formed, the booking has just moved
      // on since the page was drawn.
      return NextResponse.json(
        { error: refusalReason(reservation.status, action), status: reservation.status },
        { status: 409 },
      );
    }

    const target = transitionFor(reservation.status, action)!;

    // Guard the update on the status we checked, so two admins acting at
    // once can't both win. If the row moved underneath us the update matches
    // nothing and we report the conflict rather than silently doing nothing.
    const { data, error } = await supabase
      .from("reservations")
      .update({ status: target.to })
      .eq("id", reservation.id)
      .eq("status", reservation.status)
      .select("id, status")
      .maybeSingle();

    if (error) {
      console.error("[admin/hire/reservations] update failed", error);
      return NextResponse.json(
        { error: "That didn't save. Try again." },
        { status: 500 },
      );
    }
    if (!data) {
      return NextResponse.json(
        { error: "Someone just changed that booking. Refresh and take another look." },
        { status: 409 },
      );
    }

    // Confirming is the one transition the customer hears about. Declining
    // stays a phone call on purpose — a template can't explain why, and the
    // decline dialog says so.
    //
    // Dispatched after the write and outside the response path: a Twilio
    // outage must not undo a confirmation Thomas has already made.
    let texted = false;
    if (action === "confirm" && reservation.customerPhone) {
      texted = true;
      after(
        sendSms(
          reservation.customerPhone,
          confirmedForCustomer({
            reference: reservation.reference ?? "",
            customerName: reservation.customerName ?? "",
            customerPhone: reservation.customerPhone,
            equipmentName: reservation.equipmentName,
            startsOn: reservation.startsOn,
            endsOn: reservation.endsOn,
            totalDueAtPickupCents: reservation.hireTotalCents + reservation.bondTotalCents,
          }),
          { trigger_type: "auto", recipient_name: reservation.customerName },
          supabase,
        ).catch((err) => console.error("[admin/hire/reservations] confirm SMS failed", err)),
      );
    }

    return NextResponse.json({ ok: true, status: data.status, action, texted });
  } catch (err) {
    console.error("[admin/hire/reservations] unexpected failure", err);
    return NextResponse.json({ error: "That didn't save. Try again." }, { status: 500 });
  }
}
