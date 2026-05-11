import { NextResponse } from "next/server";
import { requireApiAdmin, requireSupabase } from "@/lib/api-auth";
import { ensureRecurringJobForClient } from "@/lib/recurring-jobs";

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
  // Recurring-service fields (migration 0020).
  if ("service_frequency_days" in body) {
    const raw = body.service_frequency_days;
    if (raw == null || raw === "") {
      patch.service_frequency_days = null;
    } else {
      const n = Number(raw);
      if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
        return NextResponse.json({ error: "service_frequency_days must be a positive integer" }, { status: 400 });
      }
      patch.service_frequency_days = n;
    }
  }
  if ("next_service_due" in body) {
    const raw = body.next_service_due;
    if (raw == null || raw === "") {
      patch.next_service_due = null;
    } else {
      const s = String(raw);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        return NextResponse.json({ error: "next_service_due must be ISO YYYY-MM-DD" }, { status: 400 });
      }
      patch.next_service_due = s;
    }
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

  // If this update set or changed the recurring schedule, make sure
  // there's a scheduled job on the calendar for the new due date.
  // Idempotent — silent no-op when the date hasn't changed or the
  // client isn't recurring.
  let recurringJob: Awaited<ReturnType<typeof ensureRecurringJobForClient>> | null = null;
  if ("next_service_due" in patch || "service_frequency_days" in patch) {
    recurringJob = await ensureRecurringJobForClient(supabase, data);
  }

  return NextResponse.json({ client: data, recurring_job: recurringJob });
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
