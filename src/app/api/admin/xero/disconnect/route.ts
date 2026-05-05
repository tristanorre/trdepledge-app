import { NextResponse } from "next/server";
import { requireApiAdmin, requireSupabase } from "@/lib/api-auth";

export const runtime = "nodejs";

export async function POST() {
  const auth = await requireApiAdmin();
  if (auth instanceof NextResponse) return auth;
  const { session } = auth;

  const supabase = requireSupabase();
  if (supabase instanceof NextResponse) return supabase;

  // Delete the token row. We don't bother revoking with Xero — the
  // refresh token will simply stop being used. Reconnecting goes
  // through OAuth again.
  const { error } = await supabase
    .from("xero_tokens")
    .delete()
    .eq("user_id", session.user.id);

  if (error) {
    console.error("[xero disconnect]", error);
    return NextResponse.json({ error: "Could not disconnect" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
