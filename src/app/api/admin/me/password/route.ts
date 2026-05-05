import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { requireApiAdmin, requireSupabase } from "@/lib/api-auth";

export const runtime = "nodejs";

// POST /api/admin/me/password — change own password.
//   Body: { current_password: string, new_password: string }
//
// Min length is 8 characters. We don't enforce complexity rules — that
// nudges users toward worse choices (Tr0ub4dor!) — long is what matters.
const MIN_LEN = 8;
const MAX_LEN = 200;

export async function POST(req: Request) {
  const auth = await requireApiAdmin();
  if (auth instanceof NextResponse) return auth;
  const { session } = auth;

  const supabase = requireSupabase();
  if (supabase instanceof NextResponse) return supabase;

  let body: { current_password?: unknown; new_password?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const current = String(body.current_password ?? "");
  const next = String(body.new_password ?? "");
  if (!current || !next) return NextResponse.json({ error: "Both fields required" }, { status: 400 });
  if (next.length < MIN_LEN) return NextResponse.json({ error: `New password must be at least ${MIN_LEN} characters` }, { status: 400 });
  if (next.length > MAX_LEN) return NextResponse.json({ error: "New password is too long" }, { status: 400 });
  if (current === next) return NextResponse.json({ error: "New password must differ from current" }, { status: 400 });

  const { data: user, error: readErr } = await supabase
    .from("users")
    .select("password_hash")
    .eq("id", session.user.id)
    .maybeSingle();

  if (readErr || !user || !user.password_hash) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const ok = await bcrypt.compare(current, user.password_hash);
  if (!ok) {
    return NextResponse.json({ error: "Current password is incorrect" }, { status: 401 });
  }

  const newHash = await bcrypt.hash(next, 10);
  const { error: updateErr } = await supabase
    .from("users")
    .update({ password_hash: newHash })
    .eq("id", session.user.id);

  if (updateErr) {
    console.error("[admin/me/password]", updateErr);
    return NextResponse.json({ error: "Could not update password" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
