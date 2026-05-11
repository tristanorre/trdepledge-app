import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireApiAdmin, requireSupabase } from "@/lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — list materials.
//
//   ?all=1  → include inactive rows (default false). Useful only for
//             the /admin/materials management page; the job-line
//             picker always wants active items.
export async function GET(req: Request) {
  const auth = await requireApiAdmin();
  if (auth instanceof NextResponse) return auth;

  const supabase = requireSupabase();
  if (supabase instanceof NextResponse) return supabase;

  const url = new URL(req.url);
  const includeInactive = url.searchParams.get("all") === "1";

  let q = supabase
    .from("materials_catalogue")
    .select("id, name, unit, base_price_cents, category, active")
    .order("category", { ascending: true, nullsFirst: true })
    .order("name");

  if (!includeInactive) q = q.eq("active", true);

  const { data, error } = await q;
  if (error) {
    console.error("[materials-catalogue GET]", error);
    return NextResponse.json({ error: "Could not load catalogue" }, { status: 500 });
  }
  return NextResponse.json({ materials: data ?? [] });
}

// POST — create a new material.
//
// Body: { name, unit, base_price_cents, category? }
//   name: text, required
//   unit: text, required (e.g. "m²", "kg", "each", "bag")
//   base_price_cents: int ≥ 0, required (price per unit, in cents)
//   category: text, optional
export async function POST(req: Request) {
  const auth = await requireApiAdmin();
  if (auth instanceof NextResponse) return auth;

  const supabase = requireSupabase();
  if (supabase instanceof NextResponse) return supabase;

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const name = String(body.name ?? "").trim();
  const unit = String(body.unit ?? "").trim();
  const priceRaw = Number(body.base_price_cents);
  const category = body.category ? String(body.category).trim() : null;

  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  if (!unit) return NextResponse.json({ error: "unit is required" }, { status: 400 });
  if (!Number.isFinite(priceRaw) || priceRaw < 0 || !Number.isInteger(priceRaw)) {
    return NextResponse.json({ error: "base_price_cents must be a non-negative integer" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("materials_catalogue")
    .insert({
      name,
      unit,
      base_price_cents: priceRaw,
      category,
      active: true,
    })
    .select("*")
    .single();

  if (error) {
    console.error("[materials-catalogue POST]", error);
    return NextResponse.json({ error: "Could not create material" }, { status: 500 });
  }

  revalidatePath("/admin/materials");
  return NextResponse.json({ material: data });
}
