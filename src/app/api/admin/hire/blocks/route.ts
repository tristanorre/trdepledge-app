import { NextResponse } from "next/server";

import { BLOCK_REASONS, checkBlockRange, isISODate } from "@/lib/hire";
import { availabilityContextFor, getEquipmentBySlug, releaseExpiredHolds } from "@/lib/hire/repo";
import { requireApiAdmin, requireSupabase } from "@/lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EXCLUSION_VIOLATION = "23P01";

// Block dates out for Thomas's own jobs, servicing, or a tool being lent.
//
// Blocks live in the same `reservations` table as customer hires, which is
// what lets one database constraint prevent every kind of double-booking —
// including a customer booking over one of Thomas's jobs, and this route
// blocking over a customer's.
//
// THE RULE THAT MATTERS: blocking over dates a customer already holds is
// refused, never silently applied. If Thomas needs a tool back off someone,
// that's a phone call — quietly marking it blocked here would leave the
// customer still expecting to collect it.
export async function POST(req: Request) {
  const auth = await requireApiAdmin();
  if (auth instanceof NextResponse) return auth;

  const supabase = requireSupabase();
  if (supabase instanceof NextResponse) return supabase;

  let body: { slug?: string; startsOn?: string; endsOn?: string; reason?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const slug = String(body.slug ?? "").trim();
  const startsOn = String(body.startsOn ?? "").trim();
  const endsOn = String(body.endsOn ?? "").trim();
  const reason = String(body.reason ?? "").trim();

  if (!slug) {
    return NextResponse.json({ error: "Pick which tool you're blocking out." }, { status: 400 });
  }
  if (!isISODate(startsOn) || !isISODate(endsOn)) {
    return NextResponse.json({ error: "Pick the dates you want to block out." }, { status: 400 });
  }
  // A free-text reason would drift; the four options are what the bookings
  // list and Thomas's own memory rely on.
  if (!(BLOCK_REASONS as readonly string[]).includes(reason)) {
    return NextResponse.json({ error: "Pick a reason for the block." }, { status: 400 });
  }

  try {
    await releaseExpiredHolds(supabase);

    // Admin can block unpublished gear too — it's still his to schedule.
    const equipment = await getEquipmentBySlug(supabase, slug, { includeUnpublished: true });
    if (!equipment) {
      return NextResponse.json({ error: "That tool isn't on the books." }, { status: 404 });
    }

    const ctx = await availabilityContextFor(supabase, equipment);
    const check = checkBlockRange(startsOn, endsOn, ctx);
    if (!check.ok) {
      return NextResponse.json({ error: check.message, reason: check.reason }, { status: 409 });
    }

    const { data, error } = await supabase
      .from("reservations")
      .insert({
        equipment_id: equipment.id,
        kind: "block",
        status: "blocked",
        starts_on: startsOn,
        ends_on: endsOn,
        block_reason: reason,
      })
      .select("id")
      .single();

    if (error) {
      if ((error as { code?: string }).code === EXCLUSION_VIOLATION) {
        // Something landed between the check and the insert. The constraint
        // is the authority, so report what it decided.
        return NextResponse.json(
          {
            error:
              "Those dates just got taken. Refresh the calendar and pick again.",
          },
          { status: 409 },
        );
      }
      console.error("[admin/hire/blocks] insert failed", error);
      return NextResponse.json({ error: "That didn't save. Try again." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, id: data.id, startsOn, endsOn, reason });
  } catch (err) {
    console.error("[admin/hire/blocks] unexpected failure", err);
    return NextResponse.json({ error: "That didn't save. Try again." }, { status: 500 });
  }
}
