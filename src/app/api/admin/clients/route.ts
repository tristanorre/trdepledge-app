import { NextResponse } from "next/server";
import { requireApiAdmin, requireSupabase } from "@/lib/api-auth";
import { sanitiseLikeText } from "@/lib/sanitise";
import { ensureRecurringJobForClient } from "@/lib/recurring-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_TYPES = ["Private", "NDIS", "Aged Care", "Commercial"] as const;

// GET /api/admin/clients
//   ?q=...     name/email substring search
//   ?type=...  one of VALID_TYPES
export async function GET(req: Request) {
  const auth = await requireApiAdmin();
  if (auth instanceof NextResponse) return auth;

  const supabase = requireSupabase();
  if (supabase instanceof NextResponse) return supabase;

  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  const type = url.searchParams.get("type");

  let query = supabase
    .from("clients")
    .select("*")
    .order("name", { ascending: true })
    .limit(500);

  if (type && (VALID_TYPES as readonly string[]).includes(type)) {
    query = query.eq("type", type);
  }
  if (q) {
    const safe = sanitiseLikeText(q);
    if (safe) query = query.or(`name.ilike.%${safe}%,email.ilike.%${safe}%`);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[admin/clients GET]", error);
    return NextResponse.json({ error: "Could not load clients" }, { status: 500 });
  }
  return NextResponse.json({ clients: data ?? [] });
}

export async function POST(req: Request) {
  const auth = await requireApiAdmin();
  if (auth instanceof NextResponse) return auth;

  const supabase = requireSupabase();
  if (supabase instanceof NextResponse) return supabase;

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const name = String(body.name ?? "").trim();
  const type = String(body.type ?? "");
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  if (!(VALID_TYPES as readonly string[]).includes(type)) {
    return NextResponse.json({ error: "type must be Private | NDIS | Aged Care | Commercial" }, { status: 400 });
  }

  // Recurring-service fields (migration 0020). Frequency stays null
  // for one-off clients; the date is only meaningful when paired with
  // a frequency. The DB check constraint enforces frequency > 0.
  const freqRaw = Number(body.service_frequency_days);
  const service_frequency_days =
    Number.isFinite(freqRaw) && Number.isInteger(freqRaw) && freqRaw > 0 ? freqRaw : null;
  const dueRaw = body.next_service_due ? String(body.next_service_due) : "";
  const next_service_due = /^\d{4}-\d{2}-\d{2}$/.test(dueRaw) ? dueRaw : null;

  const insert = {
    name,
    type,
    address: body.address ? String(body.address).trim() : null,
    suburb: body.suburb ? String(body.suburb).trim() : null,
    postcode: body.postcode ? String(body.postcode).trim() : null,
    phone: body.phone ? String(body.phone).trim() : null,
    email: body.email ? String(body.email).trim().toLowerCase() : null,
    ndis_participant_number: body.ndis_participant_number ? String(body.ndis_participant_number).trim() : null,
    plan_manager_name: body.plan_manager_name ? String(body.plan_manager_name).trim() : null,
    plan_manager_email: body.plan_manager_email ? String(body.plan_manager_email).trim().toLowerCase() : null,
    plan_manager_phone: body.plan_manager_phone ? String(body.plan_manager_phone).trim() : null,
    ndis_funding_type: ["self", "plan", "agency"].includes(String(body.ndis_funding_type))
      ? body.ndis_funding_type
      : null,
    notes: body.notes ? String(body.notes).trim() : null,
    service_frequency_days,
    next_service_due,
  };

  const { data, error } = await supabase
    .from("clients")
    .insert(insert)
    .select("*")
    .single();

  if (error) {
    console.error("[admin/clients POST]", error);
    return NextResponse.json({ error: "Could not create client" }, { status: 500 });
  }

  // If the new client is recurring AND has a due date, auto-create the
  // first job for that date so it lands on the schedule. Silent
  // no-op when the client isn't recurring; idempotent if a duplicate
  // somehow already exists.
  const recurringJob = await ensureRecurringJobForClient(supabase, data);

  return NextResponse.json({
    client: data,
    recurring_job: recurringJob,
  }, { status: 201 });
}
