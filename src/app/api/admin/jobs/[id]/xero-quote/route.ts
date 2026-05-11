import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireApiAdmin, requireSupabase } from "@/lib/api-auth";
import { sendQuoteForJob } from "@/lib/xero-invoice";
import { calculateQuoteEstimate, type JobMaterialLine } from "@/lib/cost";
import { getRates } from "@/lib/config";
import type { Job } from "@/lib/types";

export const runtime = "nodejs";

// POST /api/admin/jobs/[id]/xero-quote
//
// Pushes a draft Quote into Xero from the job's quote estimate
// (quote_hours_per_worker × quote_worker_count) + planned materials
// list. Xero generates the customer-facing PDF and lets Thomas hit
// "Send" from there.
//
// Idempotent-ish: if the job already has an `xero_quote_id`, returns
// that immediately. Resending requires Thomas to clear the field
// first (or wait until status moves past pending_review).
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireApiAdmin();
  if (auth instanceof NextResponse) return auth;
  const { session } = auth;

  const supabase = requireSupabase();
  if (supabase instanceof NextResponse) return supabase;

  const [{ data: job }, { data: matRows }, rates] = await Promise.all([
    supabase
      .from("jobs")
      .select(`
        *,
        client:client_id ( id, name, email, xero_contact_id )
      `)
      .eq("id", params.id)
      .maybeSingle(),
    supabase
      .from("job_materials")
      .select(`
        id, job_id, material_id, qty, markup_percent,
        materials_catalogue:material_id ( name, unit, base_price_cents )
      `)
      .eq("job_id", params.id)
      .order("created_at", { ascending: true }),
    getRates(supabase),
  ]);

  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  const j = job as Job & { client: { id: string; name: string; email: string | null; xero_contact_id: string | null } | null };

  if (j.xero_quote_id) {
    return NextResponse.json({
      ok: true,
      already_sent: true,
      quote_id: j.xero_quote_id,
    });
  }

  const hoursEstimate = j.quote_hours_per_worker ?? 0;
  const workerCountEstimate = j.quote_worker_count ?? 0;
  if (hoursEstimate <= 0 || workerCountEstimate <= 0) {
    return NextResponse.json({
      error: "Quote estimate incomplete — set hours-per-worker and worker count first.",
    }, { status: 400 });
  }

  // Re-shape materials rows into the JobMaterialLine the cost calc
  // expects. Supabase returns the joined `materials_catalogue` row
  // as a single-element array (the relationship is many-to-one, but
  // the supabase-js typings model it as an array). Pull element [0].
  const materials: JobMaterialLine[] = ((matRows ?? []) as unknown as Array<{
    id: string;
    job_id: string;
    material_id: string;
    qty: number;
    markup_percent: number;
    materials_catalogue: Array<{ name: string; unit: string; base_price_cents: number }>;
  }>).map((r) => {
    const m = r.materials_catalogue?.[0] ?? null;
    return {
      id: r.id,
      job_id: r.job_id,
      material_id: r.material_id,
      qty: r.qty,
      markup_percent: r.markup_percent,
      name: m?.name ?? "(unknown)",
      unit: m?.unit ?? "ea",
      base_price_cents: m?.base_price_cents ?? 0,
    };
  });

  const estimate = calculateQuoteEstimate(j, hoursEstimate, workerCountEstimate, materials, rates);

  const result = await sendQuoteForJob(supabase, session.user.id, j, estimate);
  if (!result.ok) {
    return NextResponse.json({ error: result.error, detail: result.detail }, { status: 502 });
  }

  // Persist the quote id + sent timestamp so we don't re-send and so
  // the UI can show "Quote sent" with a deep link.
  await supabase
    .from("jobs")
    .update({
      xero_quote_id: result.quote_id,
      quote_sent_at: new Date().toISOString(),
    })
    .eq("id", params.id);

  revalidatePath(`/admin/jobs/${params.id}`);
  return NextResponse.json({
    ok: true,
    quote_id: result.quote_id,
    quote_number: result.quote_number,
  });
}
