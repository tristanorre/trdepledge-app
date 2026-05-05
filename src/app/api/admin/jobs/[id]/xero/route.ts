import { NextResponse } from "next/server";
import { requireApiAdmin, requireSupabase } from "@/lib/api-auth";
import { sendInvoiceForJob } from "@/lib/xero-invoice";
import { calculateCost, type JobMaterialLine } from "@/lib/cost";
import { getRates } from "@/lib/config";
import type { Job } from "@/lib/types";

export const runtime = "nodejs";

// POST /api/admin/jobs/[id]/xero  — send the job's invoice to Xero.
//
// Idempotent-ish: if the job already has a `xero_invoice_id`, returns
// that immediately and does nothing. Re-sending requires admin to clear
// the field via the edit form first.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireApiAdmin();
  if (auth instanceof NextResponse) return auth;
  const { session } = auth;

  const supabase = requireSupabase();
  if (supabase instanceof NextResponse) return supabase;

  // Fetch job + client + materials + rates in parallel.
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
  const j = job as Job & { client: any };

  if (j.invoice_sent && j.xero_invoice_id) {
    return NextResponse.json({
      ok: true,
      already_sent: true,
      invoice_id: j.xero_invoice_id,
    });
  }

  if (j.status !== "completed") {
    return NextResponse.json({
      error: "Job not completed yet — cannot invoice",
    }, { status: 400 });
  }

  const materials: JobMaterialLine[] = (matRows ?? []).map((row: any) => ({
    id: row.id, job_id: row.job_id, material_id: row.material_id,
    qty: Number(row.qty), markup_percent: row.markup_percent,
    name: row.materials_catalogue?.name ?? "(unknown)",
    unit: row.materials_catalogue?.unit ?? "",
    base_price_cents: row.materials_catalogue?.base_price_cents ?? 0,
  }));

  const cost = calculateCost(j, materials, rates);

  const result = await sendInvoiceForJob(supabase, session.user.id, j, cost);

  if (!result.ok) {
    if (result.error === "not_connected") {
      return NextResponse.json({
        error: "Xero not connected. Connect it from Settings first.",
      }, { status: 400 });
    }
    console.error("[xero invoice] failed", result);
    return NextResponse.json({
      error: "Could not send to Xero", detail: result.error,
    }, { status: 502 });
  }

  await supabase
    .from("jobs")
    .update({ invoice_sent: true, xero_invoice_id: result.invoice_id })
    .eq("id", j.id);

  return NextResponse.json({
    ok: true,
    invoice_id: result.invoice_id,
    invoice_number: result.invoice_number,
  });
}
