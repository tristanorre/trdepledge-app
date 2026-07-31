import { NextResponse } from "next/server";

import { STATUS_LABELS, toDbAmount, validateEquipment } from "@/lib/hire";
import { openReservationsForEquipment } from "@/lib/hire/repo";
import { requireApiAdmin, requireSupabase } from "@/lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Edit an item. The slug is never changed — it's a public URL key and Doug's handle for the tool. */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireApiAdmin();
  if (auth instanceof NextResponse) return auth;

  const supabase = requireSupabase();
  if (supabase instanceof NextResponse) return supabase;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // A publish/unpublish toggle is a one-field update, not a full edit — it's
  // also the fallback the removal rule offers, so it must work on its own.
  if (Object.keys(body).length === 1 && typeof body.isPublished === "boolean") {
    const { data, error } = await supabase
      .from("equipment")
      .update({ is_published: body.isPublished })
      .eq("id", params.id)
      .is("deleted_at", null)
      .select("id, is_published")
      .maybeSingle();

    if (error) {
      console.error("[admin/hire/equipment] publish toggle failed", error);
      return NextResponse.json({ error: "That didn't save. Try again." }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: "That item isn't on the books." }, { status: 404 });
    return NextResponse.json({ ok: true, isPublished: data.is_published });
  }

  const check = validateEquipment(body as never);
  if (!check.ok) {
    return NextResponse.json({ error: check.message, problems: check.problems }, { status: 400 });
  }
  const v = check.value;

  try {
    const { data, error } = await supabase
      .from("equipment")
      .update({
        name: v.name,
        category: v.category,
        blurb: v.blurb,
        specs: v.specs,
        daily_rate: toDbAmount(v.dailyRateCents),
        bond: toDbAmount(v.bondCents),
        photo_path: v.photoPath,
        flyer_path: v.flyerPath,
        is_published: v.isPublished,
        sort_order: v.sortOrder,
        changeover_days: v.changeoverDays,
      })
      .eq("id", params.id)
      .is("deleted_at", null)
      .select("id")
      .maybeSingle();

    if (error) {
      console.error("[admin/hire/equipment] update failed", error);
      return NextResponse.json({ error: "That didn't save. Try again." }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: "That item isn't on the books." }, { status: 404 });

    return NextResponse.json({ ok: true, id: data.id });
  } catch (err) {
    console.error("[admin/hire/equipment] unexpected failure", err);
    return NextResponse.json({ error: "That didn't save. Try again." }, { status: 500 });
  }
}

/**
 * Remove an item from the floor.
 *
 * THE REMOVAL RULE, implemented exactly as specified:
 *
 *   If the equipment has any reservation that is pending, confirmed or out,
 *   deletion is REFUSED and unpublishing is offered instead — gone from the
 *   public page, still valid for whoever is already in the diary.
 *
 * Hard-deleting equipment out from under a confirmed booking strands a
 * customer holding a reference for a tool that no longer exists, so the
 * check is server-side and the UI's version of it is only a courtesy.
 *
 * Items that pass the check are SOFT deleted. History survives: a returned
 * hire from last year still joins to its equipment row for the record, and
 * `on delete restrict` on the foreign key would refuse a hard delete anyway.
 */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireApiAdmin();
  if (auth instanceof NextResponse) return auth;

  const supabase = requireSupabase();
  if (supabase instanceof NextResponse) return supabase;

  try {
    const open = await openReservationsForEquipment(supabase, params.id);

    if (open.length > 0) {
      const breakdown = summarise(open.map((r) => r.status));
      return NextResponse.json(
        {
          error:
            `That tool has ${breakdown} on the books, so it can't be removed. ` +
            `Unpublish it instead — it comes off the public page but stays valid ` +
            `for whoever's already booked it.`,
          canUnpublish: true,
          openCount: open.length,
        },
        { status: 409 },
      );
    }

    const { data, error } = await supabase
      .from("equipment")
      .update({ deleted_at: new Date().toISOString(), is_published: false })
      .eq("id", params.id)
      .is("deleted_at", null)
      .select("id")
      .maybeSingle();

    if (error) {
      console.error("[admin/hire/equipment] soft delete failed", error);
      return NextResponse.json({ error: "That didn't save. Try again." }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "That item is already gone." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, id: data.id });
  } catch (err) {
    console.error("[admin/hire/equipment] unexpected failure", err);
    return NextResponse.json({ error: "That didn't save. Try again." }, { status: 500 });
  }
}

/** "2 requests and 1 hire out" — so the refusal says what's actually in the way. */
function summarise(statuses: string[]): string {
  const counts = new Map<string, number>();
  for (const s of statuses) counts.set(s, (counts.get(s) ?? 0) + 1);

  const parts = [...counts.entries()].map(([status, n]) => {
    const label = (STATUS_LABELS[status as keyof typeof STATUS_LABELS] ?? status).toLowerCase();
    return `${n} ${label}`;
  });

  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}
