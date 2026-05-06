import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getServiceClient } from "@/lib/supabase";

export const runtime = "nodejs";

const MIN_LEN = 8;

// POST /api/auth/reset-password  Body: { token, new_password }
//
// Token is the raw hex string from the email; we look up admins with a
// non-expired reset_token_hash and bcrypt.compare. If valid, set the new
// password, clear the reset token, clear any lockout from migration 0011.
export async function POST(req: Request) {
  let body: { token?: unknown; new_password?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const token = String(body.token ?? "");
  const next = String(body.new_password ?? "");
  if (!token) return NextResponse.json({ error: "Token is required" }, { status: 400 });
  if (next.length < MIN_LEN) return NextResponse.json({ error: `New password must be at least ${MIN_LEN} characters` }, { status: 400 });

  const supabase = getServiceClient();
  if (!supabase) return NextResponse.json({ error: "Database not configured" }, { status: 503 });

  // Pull every admin with a live token. This is cheap (one admin, one
  // token at a time in our world), and avoids leaking timing info about
  // which admin owns the token: we'd compare against each candidate
  // hash anyway. Filter expired rows server-side.
  const nowIso = new Date().toISOString();
  const { data: candidates } = await supabase
    .from("users")
    .select("id, reset_token_hash")
    .eq("role", "admin")
    .gt("reset_token_expires_at", nowIso)
    .not("reset_token_hash", "is", null);

  let userId: string | null = null;
  for (const c of candidates ?? []) {
    if (!c.reset_token_hash) continue;
    if (await bcrypt.compare(token, c.reset_token_hash)) {
      userId = c.id;
      break;
    }
  }

  if (!userId) {
    return NextResponse.json({ error: "Invalid or expired reset link" }, { status: 400 });
  }

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
