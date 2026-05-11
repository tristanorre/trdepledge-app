import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireApiAdmin, requireSupabase } from "@/lib/api-auth";

export const runtime = "nodejs";

type Ctx = { params: { id: string } };

// PATCH — edit any subset of {name, unit, base_price_cents, category,
// quantity_on_hand, active}. Pass `active: false` to soft-hide a row
// from the job-line picker without losing its history.
export async function PATCH(req: Request, { params }: Ctx) {
  const auth = await requireApiAdmin();
  if (auth instanceof NextResponse) return auth;

  const supabase = requireSupabase();
  if (supabase instanceof NextResponse) return supabase;

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const patch: Record<string, unknown> = {};
  if ("name" in body) {
    const v = String(body.name ?? "").trim();
    if (!v) return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
    patch.name = v;
  }
  if ("unit" in body) {
    const v = String(body.unit ?? "").trim();
    if (!v) return NextResponse.json({ error: "unit cannot be empty" }, { status: 400 });
    patch.unit = v;
  }
  if ("base_price_cents" in body) {
    const n = Number(body.base_price_cents);
    if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
      return NextResponse.json({ error: "base_price_cents must be a non-negative integer" }, { status: 400 });
    }
    patch.base_price_cents = n;
  }
  if ("category" in body) {
    patch.category = body.category ? String(body.category).trim() || null : null;
  }
  if ("active" in body) patch.active = Boolean(body.active);

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("materials_catalogue")
    .update(patch)
    .eq("id", params.id)
    .select("*")
    .single();

  if (error) {
    console.error("[materials-catalogue PATCH]", error);
    return NextResponse.json({ error: "Could not update material" }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  revalidatePath("/admin/materials");
  return NextResponse.json({ material: data });
}

// DELETE — hard delete. If the material is referenced by any
// job_materials row the DB will reject (FK from 0006). The error
// surfaces back so the admin can soft-hide via PATCH {active:false}
// instead.
export async function DELETE(_req: Request, { params }: Ctx) {
  const auth = await requireApiAdmin();
  if (auth instanceof NextResponse) return auth;

  const supabase = requireSupabase();
  if (supabase instanceof NextResponse) return supabase;

  const { error } = await supabase
    .from("materials_catalogue")
    .delete()
    .eq("id", params.id);

  if (error) {
    // Postgres FK violation code is 23503 — surface a friendlier message.
    if (error.code === "23503") {
      return NextResponse.json({
        error: "This material is used on one or more jobs. Mark it inactive instead of deleting.",
      }, { status: 409 });
    }
    console.error("[materials-catalogue DELETE]", error);
    return NextResponse.json({ error: "Could not delete material" }, { status: 500 });
  }

  revalidatePath("/admin/materials");
  return NextResponse.json({ ok: true });
}
