import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";

export const runtime = "nodejs";
// Worker names already appear on the public About page, so listing
// them for the login dropdown leaks nothing new.
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = getServiceClient();
  if (!supabase) return NextResponse.json({ workers: [] });

  const { data, error } = await supabase
    .from("users")
    .select("id, name, colour")
    .eq("role", "worker")
    .eq("active", true)
    .order("name");

  if (error) {
    console.error("[workers list]", error);
    return NextResponse.json({ workers: [] }, { status: 500 });
  }
  return NextResponse.json({ workers: data ?? [] });
}
