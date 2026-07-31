import { NextResponse } from "next/server";

import { requireApiAdmin, requireSupabase } from "@/lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Release one of Thomas's blocked periods, freeing the dates again.
//
// This is a hard delete rather than a status change, and that's deliberate:
// a block carries no history worth keeping — it isn't a customer's booking,
// it's a note to himself that the tool was busy. Leaving cancelled blocks
// behind would clutter the calendar's data for no benefit.
//
// The `kind` and `status` filters on the delete are the safety catch: they
// make it impossible for this endpoint to remove a customer's hire even if
// it's handed a hire's id.
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireApiAdmin();
  if (auth instanceof NextResponse) return auth;

  const supabase = requireSupabase();
  if (supabase instanceof NextResponse) return supabase;

  try {
    const { data, error } = await supabase
      .from("reservations")
      .delete()
      .eq("id", params.id)
      .eq("kind", "block")
      .eq("status", "blocked")
      .select("id")
      .maybeSingle();

    if (error) {
      console.error("[admin/hire/blocks] delete failed", error);
      return NextResponse.json({ error: "That didn't save. Try again." }, { status: 500 });
    }
    if (!data) {
      // Either already released, or the id belongs to a customer hire — the
      // filters above refuse both, and the message covers both honestly.
      return NextResponse.json(
        { error: "That block isn't there any more. Refresh the calendar." },
        { status: 404 },
      );
    }

    return NextResponse.json({ ok: true, id: data.id });
  } catch (err) {
    console.error("[admin/hire/blocks] unexpected failure", err);
    return NextResponse.json({ error: "That didn't save. Try again." }, { status: 500 });
  }
}
