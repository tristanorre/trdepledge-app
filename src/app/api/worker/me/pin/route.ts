import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { requireApiWorker, requireSupabase } from "@/lib/api-auth";
import { rejectWeakPin } from "@/lib/pin";

export const runtime = "nodejs";

// POST /api/worker/me/pin — change own PIN.
//   Body: { current_pin: string (4 digits), new_pin: string (4 digits) }
//
// Re-verifies the current PIN before changing — guards against a stolen
// session being used to lock the worker out of their account.
export async function POST(req: Request) {
  const auth = await requireApiWorker();
  if (auth instanceof NextResponse) return auth;
  const { session } = auth;

  const supabase = requireSupabase();
  if (supabase instanceof NextResponse) return supabase;

  let body: { current_pin?: unknown; new_pin?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const current = String(body.current_pin ?? "");
  const next = String(body.new_pin ?? "");
  if (!/^\d{4}$/.test(current)) return NextResponse.json({ error: "Current PIN must be 4 digits" }, { status: 400 });
  if (!/^\d{4}$/.test(next))    return NextResponse.json({ error: "New PIN must be 4 digits" }, { status: 400 });
  if (current === next) return NextResponse.json({ error: "New PIN must differ from current" }, { status: 400 });
  // Reject the obviously-weak choices (1234, 0000, etc.). Cost-free
  // upgrade — see lib/pin.ts for why this matters with a 5-fail
  // lockout and a 10000-PIN keyspace.
  const weak = rejectWeakPin(next);
  if (weak) return NextResponse.json({ error: weak }, { status: 400 });

  const { data: user, error: readErr } = await supabase
    .from("users")
    .select("pin_hash")
    .eq("id", session.user.id)
    .maybeSingle();

  if (readErr || !user || !user.pin_hash) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const ok = await bcrypt.compare(current, user.pin_hash);
  if (!ok) {
    return NextResponse.json({ error: "Current PIN is incorrect" }, { status: 401 });
  }

  const newHash = await bcrypt.hash(next, 10);
  const { error: updateErr } = await supabase
    .from("users")
    .update({ pin_hash: newHash })
    .eq("id", session.user.id);

  if (updateErr) {
    console.error("[worker/me/pin]", updateErr);
    return NextResponse.json({ error: "Could not update PIN" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
