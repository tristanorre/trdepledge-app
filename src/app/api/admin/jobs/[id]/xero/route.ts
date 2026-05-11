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
    if (result.error === "contact_lookup_failed") {
      return NextResponse.json({
        error: "Couldn't find or create the customer in Xero. Check the client name and try again.",
      }, { status: 400 });
    }
    if (result.error === "nothing_to_invoice") {
      return NextResponse.json({
        error: "Nothing to invoice — no labour hours or materials.",
      }, { status: 400 });
    }
    // Anything else is either an HTTP error from Xero (http_400 etc.)
    // or our own missing-id fallback. Try to pull out the human
    // message Xero put inside the response so Thomas sees the actual
    // problem (e.g. "Account code 200 is not valid", "Invalid tax
    // type", "Contact has no name") instead of a generic banner.
    const human = humaniseXeroError(result);
    console.error("[xero invoice] failed", result);
    return NextResponse.json({
      error: human,
      code: result.error,
      detail: result.detail,
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

// Xero's failure payloads are deeply nested. This helper digs through
// the common shapes and returns the most useful single-line message.
//
// Validation errors look like:
//   { Elements: [{ ValidationErrors: [{ Message: "Account code ..." }] }] }
// OAuth errors look like:
//   { Type: "InvalidGrant", Title: "Authentication Unsuccessful" }
// Generic API errors look like:
//   { Type: "...", Message: "..." }
function humaniseXeroError(result: { error: string; detail?: unknown }): string {
  // Special-case the auth-expired shape — when the refresh token is stale
  // Thomas needs to re-connect, not retry.
  if (result.error === "http_401") {
    return "Xero connection expired. Disconnect and re-connect via Settings, then try again.";
  }

  const d = result.detail as Record<string, unknown> | undefined;
  if (d && typeof d === "object") {
    // Validation errors — most common when the chart of accounts /
    // tax type / item code doesn't match the org. We want the first
    // ValidationError.Message string.
    const elements = d.Elements as Array<Record<string, unknown>> | undefined;
    const firstEl = Array.isArray(elements) ? elements[0] : undefined;
    const validationErrors = firstEl?.ValidationErrors as Array<{ Message?: string }> | undefined;
    const firstMsg = validationErrors?.[0]?.Message;
    if (typeof firstMsg === "string" && firstMsg.trim()) {
      return `Xero rejected the invoice: ${firstMsg}`;
    }
    // Generic top-level Message / Title.
    const topMsg = (typeof d.Message === "string" && d.Message)
      || (typeof d.Title === "string" && d.Title)
      || "";
    if (topMsg) return `Xero error: ${topMsg}`;
  }
  // Last resort — surface our internal code so the user can search.
  return `Could not send to Xero (${result.error}). Check the server logs for the full Xero response.`;
}
