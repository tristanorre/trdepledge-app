import { NextResponse } from "next/server";
import { requireApiAdmin, requireSupabase } from "@/lib/api-auth";

export const runtime = "nodejs";

const VALID_TYPES = ["Private", "NDIS", "Aged Care", "Commercial"] as const;

type Ctx = { params: { id: string } };

export async function GET(_req: Request, { params }: Ctx) {
  const auth = await requireApiAdmin();
  if (auth instanceof NextResponse) return auth;

  const supabase = requireSupabase();
  if (supabase instanceof NextResponse) return supabase;

  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: "Could not load" }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ client: data });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const auth = await requireApiAdmin();
  if (auth instanceof NextResponse) return auth;

  const supabase = requireSupabase();
  if (supabase instanceof NextResponse) return supabase;

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const patch: Record<string, unknown> = {};
  // Allowlist the fields that can be patched. Anything outside this list
  // is silently dropped — defends against client-side bugs sending
  // unexpected fields.
  for (const key of [
    "name", "address", "suburb", "postcode", "phone", "email",
    "ndis_participant_number", "plan_manager_name", "plan_manager_email",
    "plan_manager_phone", "notes",
  ]) {
    if (key in body) {
      const v = body[key];
      patch[key] = v ? String(v).trim() || null : null;
    }
  }
  if ("type" in body) {
    if (!(VALID_TYPES as readonly string[]).includes(String(body.type))) {
      return NextResponse.json({ error: "type invalid" }, { status: 400 });
    }
    patch.type = body.type;
  }
  if ("ndis_funding_type" in body) {
    const v = String(body.ndis_funding_type ?? "");
    patch.ndis_funding_type = ["self", "plan", "agency"].includes(v) ? v : null;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("clients")
    .update(patch)
    .eq("id", params.id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: "Could not update" }, { status: 500 });
  return NextResponse.json({ client: data });
}

// Delete is only safe when no jobs reference the client. The FK on
// jobs.client_id is `on delete set null`, so a hard delete works without
// breaking referential integrity, but the spec wants the relationship
// preserved — we reject and tell the user to reassign or close the jobs.
export async function DELETE(_req: Request, { params }: Ctx) {
  const auth = await requireApiAdmin();
  if (auth instanceof NextResponse) return auth;

  const supabase = requireSupabase();
  if (supabase instanceof NextResponse) return supabase;

  const { count } = await supabase
    .from("jobs")
    .select("id", { count: "exact", head: true })
    .eq("client_id", params.id);
  if ((count ?? 0) > 0) {
    return NextResponse.json({
      error: `Cannot delete — ${count} job${count === 1 ? "" : "s"} reference this client. Reassign or remove those jobs first.`,
    }, { status: 409 });
  }

  const { error } = await supabase.from("clients").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: "Could not delete" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
