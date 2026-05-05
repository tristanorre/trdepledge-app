import { NextResponse } from "next/server";
import { requireApiAdmin, requireSupabase } from "@/lib/api-auth";

export const runtime = "nodejs";

type Ctx = { params: { id: string; lineId: string } };

// PATCH — change qty or markup_percent on an existing line.
export async function PATCH(req: Request, { params }: Ctx) {
  const auth = await requireApiAdmin();
  if (auth instanceof NextResponse) return auth;

  const supabase = requireSupabase();
  if (supabase instanceof NextResponse) return supabase;

  let body: { qty?: unknown; markup_percent?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const patch: Record<string, unknown> = {};
  if ("qty" in body) {
    const n = Number(body.qty);
    if (!Number.isFinite(n) || n <= 0) {
      return NextResponse.json({ error: "qty must be > 0" }, { status: 400 });
    }
    patch.qty = n;
  }
  if ("markup_percent" in body) {
    const n = Number(body.markup_percent);
    if (!Number.isFinite(n) || n < 0) {
      return NextResponse.json({ error: "markup_percent must be >= 0" }, { status: 400 });
    }
    patch.markup_percent = Math.round(n);
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { error } = await supabase
    .from("job_materials")
    .update(patch)
    .eq("id", params.lineId)
    .eq("job_id", params.id);

  if (error) {
    console.error("[admin job materials PATCH]", error);
    return NextResponse.json({ error: "Could not update line" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const auth = await requireApiAdmin();
  if (auth instanceof NextResponse) return auth;

  const supabase = requireSupabase();
  if (supabase instanceof NextResponse) return supabase;

  const { error } = await supabase
    .from("job_materials")
    .delete()
    .eq("id", params.lineId)
    .eq("job_id", params.id);

  if (error) {
    console.error("[admin job materials DELETE]", error);
    return NextResponse.json({ error: "Could not delete line" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
