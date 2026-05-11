import { NextResponse } from "next/server";
import { requireApiAdmin, requireSupabase } from "@/lib/api-auth";
import { setXeroSalesAccountCode } from "@/lib/config";

export const runtime = "nodejs";

// PATCH /api/admin/xero/sales-account
//   Body: { code: string }
//
// Saves the AccountCode that Xero invoice / quote line items should
// reference for labour + materials. Validation is light — we accept
// any non-empty string because Xero codes are user-defined per-org
// (most are 3-4 digit numbers but custom alphanumeric codes are
// allowed). The actual "does it exist in Xero" check happens at
// invoice send time; the picker UI only lists active revenue accounts
// so an invalid pick is unlikely.
export async function PATCH(req: Request) {
  const auth = await requireApiAdmin();
  if (auth instanceof NextResponse) return auth;

  const supabase = requireSupabase();
  if (supabase instanceof NextResponse) return supabase;

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const code = (body as { code?: unknown })?.code;
  if (typeof code !== "string" || !code.trim()) {
    return NextResponse.json({ error: "code is required" }, { status: 400 });
  }
  if (code.length > 32) {
    return NextResponse.json({ error: "code is too long" }, { status: 400 });
  }

  const result = await setXeroSalesAccountCode(supabase, code);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  return NextResponse.json({ ok: true, code: code.trim() });
}
