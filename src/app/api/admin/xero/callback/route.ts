import { NextResponse } from "next/server";
import { requireApiAdmin, requireSupabase } from "@/lib/api-auth";
import { exchangeCodeForTokens } from "@/lib/xero";

export const runtime = "nodejs";

// GET /api/admin/xero/callback?code=...&state=...
// Verify state, exchange code for tokens, store in xero_tokens.
// Redirect back to /admin/settings on success or with an error param on failure.
export async function GET(req: Request) {
  const auth = await requireApiAdmin();
  if (auth instanceof NextResponse) return auth;
  const { session } = auth;

  const supabase = requireSupabase();
  if (supabase instanceof NextResponse) return supabase;

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");

  const settingsUrl = new URL("/admin/settings", url.origin);

  if (errorParam) {
    settingsUrl.searchParams.set("xero", `error:${errorParam}`);
    return NextResponse.redirect(settingsUrl);
  }

  // Pull the state cookie we set in /connect — must match.
  const cookieState = req.headers.get("cookie")
    ?.split(";").map((s) => s.trim())
    .find((c) => c.startsWith("xero_oauth_state="))
    ?.slice("xero_oauth_state=".length);

  if (!code || !state || !cookieState || cookieState !== state) {
    settingsUrl.searchParams.set("xero", "error:state_mismatch");
    return NextResponse.redirect(settingsUrl);
  }

  const result = await exchangeCodeForTokens(code);
  if ("error" in result) {
    settingsUrl.searchParams.set("xero", `error:${result.error}`);
    return NextResponse.redirect(settingsUrl);
  }

  const expires_at = new Date(Date.now() + result.expires_in * 1000).toISOString();

  const { error: insertErr } = await supabase
    .from("xero_tokens")
    .upsert({
      user_id: session.user.id,
      access_token: result.access_token,
      refresh_token: result.refresh_token,
      tenant_id: result.tenant_id,
      expires_at,
    }, { onConflict: "user_id" });

  if (insertErr) {
    console.error("[xero callback] token store failed", insertErr);
    settingsUrl.searchParams.set("xero", "error:store_failed");
    return NextResponse.redirect(settingsUrl);
  }

  settingsUrl.searchParams.set("xero", "connected");
  const res = NextResponse.redirect(settingsUrl);
  // Clear the one-shot state cookie.
  res.cookies.set("xero_oauth_state", "", { maxAge: 0, path: "/" });
  return res;
}
