import { NextResponse } from "next/server";
import { requireApiAdmin, requireSupabase } from "@/lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Active worker list for assignment dropdowns. Same shape as
// /api/auth/workers but auth-gated for admin contexts.
export async function GET() {
  const auth = await requireApiAdmin();
  if (auth instanceof NextResponse) return auth;

  const supabase = requireSupabase();
  if (supabase instanceof NextResponse) return supabase;

  const { data, error } = await supabase
    .from("users")
    .select("id, name, colour")
    .or("role.eq.worker,field_worker.eq.true")
    .eq("active", true)
    .order("name");

  if (error) {
    console.error("[admin/workers GET]", error);
    return NextResponse.json({ error: "Could not load workers" }, { status: 500 });
  }
  return NextResponse.json({ workers: data ?? [] });
}
