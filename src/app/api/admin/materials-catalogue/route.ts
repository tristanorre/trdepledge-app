import { NextResponse } from "next/server";
import { requireApiAdmin, requireSupabase } from "@/lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Active materials catalogue, sorted by name. Used in the "add line"
// dropdown on the admin job detail page.
export async function GET() {
  const auth = await requireApiAdmin();
  if (auth instanceof NextResponse) return auth;

  const supabase = requireSupabase();
  if (supabase instanceof NextResponse) return supabase;

  const { data, error } = await supabase
    .from("materials_catalogue")
    .select("id, name, unit, base_price_cents, category, active")
    .eq("active", true)
    .order("category", { ascending: true, nullsFirst: true })
    .order("name");

  if (error) {
    console.error("[materials-catalogue]", error);
    return NextResponse.json({ error: "Could not load catalogue" }, { status: 500 });
  }
  return NextResponse.json({ materials: data ?? [] });
}
