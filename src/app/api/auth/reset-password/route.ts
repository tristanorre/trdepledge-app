import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getServiceClient } from "@/lib/supabase";

export const runtime = "nodejs";

const MIN_LEN = 8;

// POST /api/auth/reset-password  Body: { token, uid, new_password }
//
// `uid` comes from the reset email link (`?token=…&uid=…`). We look up
// that single admin, check the live token hash against the supplied
// raw token, and update if it matches. The previous shape pulled every
// admin with a live reset token and bcrypt.compare'd against each —
// fine when there's one admin, but O(N) and timing-leaky as the team
// grows.
export async function POST(req: Request) {
  let body: { token?: unknown; uid?: unknown; new_password?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const token = String(body.token ?? "");
  const uid = String(body.uid ?? "");
  const next = String(body.new_password ?? "");
  if (!token) return NextResponse.json({ error: "Token is required" }, { status: 400 });
  // UUID v4 shape — keeps us from issuing a Postgres query with a
  // syntactically invalid uuid that returns a 500-style error.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uid)) {
    return NextResponse.json({ error: "Invalid or expired reset link" }, { status: 400 });
  }
  if (next.length < MIN_LEN) return NextResponse.json({ error: `New password must be at least ${MIN_LEN} characters` }, { status: 400 });

  const supabase = getServiceClient();
  if (!supabase) return NextResponse.json({ error: "Database not configured" }, { status: 503 });

  const nowIso = new Date().toISOString();
  const { data: user } = await supabase
    .from("users")
    .select("id, reset_token_hash, reset_token_expires_at")
    .eq("id", uid)
    .eq("role", "admin")
    .eq("active", true)
    .maybeSingle();

  // Constant-shape error for all "not a valid reset" cases — caller can
  // never tell whether the uid was wrong, the token was wrong, or the
  // window had expired.
  const invalid = NextResponse.json({ error: "Invalid or expired reset link" }, { status: 400 });
  if (!user || !user.reset_token_hash || !user.reset_token_expires_at) return invalid;
  if (user.reset_token_expires_at <= nowIso) return invalid;
  if (!(await bcrypt.compare(token, user.reset_token_hash))) return invalid;

  const userId = user.id;

  const newHash = await bcrypt.hash(next, 10);
  const { error: updateErr } = await supabase
    .from("users")
    .update({
      password_hash: newHash,
      reset_token_hash: null,
      reset_token_expires_at: null,
      // Clear any lockout from failed pre-reset attempts.
      failed_login_attempts: 0,
      locked_until: null,
    })
    .eq("id", userId);

  if (updateErr) {
    console.error("[reset-password]", updateErr);
    return NextResponse.json({ error: "Could not update password" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
