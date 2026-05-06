import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";

export const runtime = "nodejs";
// Worker names already appear on the public About page, so listing
// them for the login dropdown leaks nothing new.
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = getServiceClient();
  if (!supabase) return NextResponse.json({ workers: [] });

  // Return `public_slug` as the dropdown value rather than the real
  // UUID. Migration 0017 added the slug column with a unique index;
  // the credentials provider in lib/auth.ts resolves slug → uuid
  // server-side before the bcrypt compare. Names are public anyway
  // (they appear on the About page), so listing them isn't a leak.
  const { data, error } = await supabase
    .from("users")
    .select("public_slug, name, colour")
    .eq("role", "worker")
    .eq("active", true)
    .order("name");

  if (error) {
    console.error("[workers list]", error);
    return NextResponse.json({ workers: [] }, { status: 500 });
  }
  // Re-shape so the client doesn't need to know whether we're using
  // `id` or `public_slug` — it just gets `id`.
  const workers = (data ?? []).map((w) => ({
    id: w.public_slug,
    name: w.name,
    colour: w.colour,
  }));
  return NextResponse.json({ workers });
}
