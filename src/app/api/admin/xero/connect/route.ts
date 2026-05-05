import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { requireApiAdmin } from "@/lib/api-auth";
import { buildAuthUrl } from "@/lib/xero";
import { xeroConfigured } from "@/lib/integrations";

export const runtime = "nodejs";

// GET /api/admin/xero/connect → redirects to Xero's authorise page.
// We mint a random state, store it in an HttpOnly cookie, and verify it
// on the callback to defeat CSRF.
export async function GET() {
  const auth = await requireApiAdmin();
  if (auth instanceof NextResponse) return auth;

  if (!xeroConfigured()) {
    return NextResponse.json({
      error: "Xero not configured. Set XERO_CLIENT_ID, XERO_CLIENT_SECRET, XERO_REDIRECT_URI in env.",
    }, { status: 503 });
  }

  const state = crypto.randomBytes(24).toString("hex");
  const url = buildAuthUrl(state);

  const res = NextResponse.redirect(url);
  res.cookies.set("xero_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600, // 10 minutes — Xero usually completes in seconds
  });
  return res;
}
