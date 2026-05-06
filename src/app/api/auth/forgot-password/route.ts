import { NextResponse } from "next/server";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { getServiceClient } from "@/lib/supabase";
import { sendEmail } from "@/lib/email";

export const runtime = "nodejs";

const TOKEN_TTL_MINUTES = 60;

// POST /api/auth/forgot-password  Body: { email }
//
// Always responds with the same success message regardless of whether
// the email matches a real admin — prevents account enumeration. The
// real outcome differs only in whether an email was actually sent.
export async function POST(req: Request) {
  let body: { email?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const email = String(body.email ?? "").trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    // Validate format but don't reveal whether it matches a user.
    return NextResponse.json({ ok: true });
  }

  const supabase = getServiceClient();
  if (!supabase) {
    console.warn("[forgot-password] DB not configured — request swallowed");
    return NextResponse.json({ ok: true });
  }

  const { data: user } = await supabase
    .from("users")
    .select("id, name")
    .eq("email", email)
    .eq("role", "admin")
    .eq("active", true)
    .maybeSingle();

  if (!user) {
    // Same response shape — caller can't tell.
    return NextResponse.json({ ok: true });
  }

  // 32 random bytes hex-encoded → 64-char token. URL-safe by construction.
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = await bcrypt.hash(rawToken, 10);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES * 60_000).toISOString();

  const { error: updateErr } = await supabase
    .from("users")
    .update({ reset_token_hash: tokenHash, reset_token_expires_at: expiresAt })
    .eq("id", user.id);
  if (updateErr) {
    console.error("[forgot-password] store token failed", updateErr);
    return NextResponse.json({ ok: true });
  }

  // Include the user id in the reset URL so the verification step
  // looks up exactly one row by id and bcrypt.compare against that
  // user's hash — instead of fetching every admin with a live token
  // and comparing against each (O(N) bcrypt calls, leaks how many
  // admins have outstanding resets via timing).
  const baseUrl = process.env.NEXTAUTH_URL ?? new URL(req.url).origin;
  const resetUrl = `${baseUrl}/reset-password?token=${rawToken}&uid=${user.id}`;

  await sendEmail({
    to: email,
    subject: "Reset your T.R. Depledge admin password",
    html: `<!doctype html><html><body style="font-family:system-ui,sans-serif;color:#0D0D0D;line-height:1.5;">
<h2 style="font-family:Georgia,serif;color:#0A1F3D;">Reset your password</h2>
<p>Hi ${escapeHtml(user.name)},</p>
<p>Someone (hopefully you) asked to reset the password for the
T.R. Depledge admin account. Tap the link below to choose a new password.
The link is valid for <strong>${TOKEN_TTL_MINUTES} minutes</strong> and can only be used once.</p>
<p style="margin:24px 0;"><a href="${resetUrl}" style="background:#A8D818;color:#0A1F3D;padding:12px 20px;border-radius:8px;font-weight:700;text-decoration:none;">Reset password</a></p>
<p style="font-size:12px;color:#6B7280;">Or copy this link into your browser:<br>${resetUrl}</p>
<p style="font-size:12px;color:#6B7280;">If you didn't request this, you can ignore the email — your existing password keeps working.</p>
</body></html>`,
    text: [
      `Hi ${user.name},`,
      ``,
      `Reset your T.R. Depledge admin password by opening this link:`,
      resetUrl,
      ``,
      `Valid for ${TOKEN_TTL_MINUTES} minutes. Single use.`,
      `If you didn't request this, ignore this email.`,
    ].join("\n"),
  });

  return NextResponse.json({ ok: true });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
