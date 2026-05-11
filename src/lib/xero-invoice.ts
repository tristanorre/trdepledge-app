import type { SupabaseClient } from "@supabase/supabase-js";
import { getValidTokens } from "@/lib/xero";
import { fmtMoney, type CostBreakdown } from "@/lib/cost";
import type { Job, ClientType } from "@/lib/types";
import { todayISO, addDaysISO } from "@/lib/dates";
import { getXeroSalesAccountCode } from "@/lib/config";

// Xero invoice send. Builds the payload from the cost breakdown +
// upserts the contact (find-by-name OR create-new) before POSTing.
//
// NDIS jobs include the support item code (`ItemCode`) per spec — the
// actual ItemCode must exist in Xero's items list, which Thomas sets up
// once. Untilthat exists we still send the invoice; Xero just won't
// auto-link the line to a tracked item, which is fine.

const XERO_API = "https://api.xero.com/api.xro/2.0";
const NDIS_SUPPORT_ITEM = "01_019_0120_1_1";

// Sales account code is now resolved per-request from the `config`
// table (admin picks it on /admin/settings after connecting Xero) with
// XERO_SALES_ACCOUNT_CODE env var as fallback and "200" as last
// resort. See getXeroSalesAccountCode() in lib/config.ts.

export type XeroSendResult =
  | { ok: true; invoice_id: string; invoice_number: string | null }
  | { ok: false; error: string; detail?: unknown };

export async function sendInvoiceForJob(
  supabase: SupabaseClient,
  adminUserId: string,
  job: Job & { client: { id: string; name: string; email: string | null; xero_contact_id: string | null } | null },
  cost: CostBreakdown,
): Promise<XeroSendResult> {
  const tokens = await getValidTokens(supabase, adminUserId);
  if (!tokens) {
    return { ok: false, error: "not_connected" };
  }

  // ── 1. Resolve the Xero ContactID. Three paths, in priority order:
  //   (a) we already stored xero_contact_id on the client row → reuse
  //   (b) find by Name in Xero
  //   (c) create new
  let contactId = job.client?.xero_contact_id ?? null;

  if (!contactId) {
    contactId = await findOrCreateContact(tokens.access_token, tokens.tenant_id, {
      name: job.client_name,
      email: job.client?.email ?? null,
    });
    if (contactId && job.client?.id) {
      // Cache for next time so we don't re-resolve on every invoice.
      await supabase.from("clients").update({ xero_contact_id: contactId }).eq("id", job.client.id);
    }
  }
  if (!contactId) {
    return { ok: false, error: "contact_lookup_failed" };
  }

  // ── 2. Build the line items. Resolve the sales account code from
  // config so admin can change it without redeploying.
  const salesAccountCode = await getXeroSalesAccountCode(supabase);
  const lineItems = buildLineItems(job, cost, { salesAccountCode });

  if (lineItems.length === 0) {
    return { ok: false, error: "nothing_to_invoice" };
  }

  // Use local-time date helpers — `toISOString().slice(0,10)` would
  // be UTC and tag a Friday-evening Adelaide invoice as Saturday.
  const invoiceDate = job.date ?? todayISO();
  const dueDate = addDaysISO(invoiceDate, 14);

  const reference = ndisReference(job);

  const payload = {
    Type: "ACCREC",
    Contact: { ContactID: contactId },
    Date: invoiceDate,
    DueDate: dueDate,
    Reference: reference,
    LineItems: lineItems,
    Status: "AUTHORISED", // ready to send; Thomas can email from Xero
  };

  // ── 3. POST.
  const res = await fetch(`${XERO_API}/Invoices`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${tokens.access_token}`,
      "Xero-Tenant-Id": tokens.tenant_id,
      "Accept": "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("[xero invoice] send failed", { status: res.status, data });
    return { ok: false, error: `http_${res.status}`, detail: data };
  }

  const invoice = (data as { Invoices?: Array<{ InvoiceID?: string; InvoiceNumber?: string }> })
    .Invoices?.[0];
  if (!invoice?.InvoiceID) {
    return { ok: false, error: "missing_invoice_id", detail: data };
  }

  return {
    ok: true,
    invoice_id: invoice.InvoiceID,
    invoice_number: invoice.InvoiceNumber ?? null,
  };
}

// ── Quote send (separate endpoint, similar shape) ────────────────
//
// Creates a draft Xero Quote from the in-app quote estimate. Xero's
// /Quotes endpoint takes the same Contact + LineItems shape as
// invoices but with Status="DRAFT" so Thomas can review and click
// "Send" in Xero, which emails the customer the PDF.
//
// We reuse buildLineItems() — the labour line wording is updated
// inside that function via a `quoteMode` flag so the description
// reflects "estimated" rather than "billed" hours.
export async function sendQuoteForJob(
  supabase: SupabaseClient,
  adminUserId: string,
  job: Job & { client: { id: string; name: string; email: string | null; xero_contact_id: string | null } | null },
  cost: CostBreakdown,
): Promise<{ ok: true; quote_id: string; quote_number: string | null } | { ok: false; error: string; detail?: unknown }> {
  const tokens = await getValidTokens(supabase, adminUserId);
  if (!tokens) return { ok: false, error: "not_connected" };

  let contactId = job.client?.xero_contact_id ?? null;
  if (!contactId) {
    contactId = await findOrCreateContact(tokens.access_token, tokens.tenant_id, {
      name: job.client_name,
      email: job.client?.email ?? null,
    });
    if (contactId && job.client?.id) {
      await supabase.from("clients").update({ xero_contact_id: contactId }).eq("id", job.client.id);
    }
  }
  if (!contactId) return { ok: false, error: "contact_lookup_failed" };

  const salesAccountCode = await getXeroSalesAccountCode(supabase);
  const lineItems = buildLineItems(job, cost, { quoteMode: true, salesAccountCode });
  if (lineItems.length === 0) return { ok: false, error: "nothing_to_quote" };

  // Quote dates: issue today, valid for 30 days. Xero's Quote shape
  // uses ExpiryDate (not DueDate like invoices).
  const issueDate = todayISO();
  const expiryDate = addDaysISO(issueDate, 30);

  const payload = {
    Contact: { ContactID: contactId },
    Date: issueDate,
    ExpiryDate: expiryDate,
    Reference: ndisReference(job),
    LineItems: lineItems,
    Status: "DRAFT",  // Thomas reviews + clicks Send inside Xero
    Title: "Quote",
    Summary: "Estimated cost for the work described below.",
  };

  const res = await fetch(`${XERO_API}/Quotes`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${tokens.access_token}`,
      "Xero-Tenant-Id": tokens.tenant_id,
      "Accept": "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("[xero quote] send failed", { status: res.status, data });
    return { ok: false, error: `http_${res.status}`, detail: data };
  }

  const quote = (data as { Quotes?: Array<{ QuoteID?: string; QuoteNumber?: string }> })
    .Quotes?.[0];
  if (!quote?.QuoteID) return { ok: false, error: "missing_quote_id", detail: data };

  return {
    ok: true,
    quote_id: quote.QuoteID,
    quote_number: quote.QuoteNumber ?? null,
  };
}

type Contact = { name: string; email: string | null };

async function findOrCreateContact(
  accessToken: string,
  tenantId: string,
  contact: Contact,
): Promise<string | null> {
  const headers = {
    "Authorization": `Bearer ${accessToken}`,
    "Xero-Tenant-Id": tenantId,
    "Accept": "application/json",
    "Content-Type": "application/json",
  };

  // Search by name. Xero's contact search uses the `where` query param
  // with their query language. Quotes inside the name need escaping.
  const safeName = contact.name.replace(/"/g, '""');
  const where = encodeURIComponent(`Name=="${safeName}"`);

  try {
    const findRes = await fetch(`${XERO_API}/Contacts?where=${where}`, { headers });
    if (findRes.ok) {
      const data = await findRes.json().catch(() => ({}));
      const existing = (data as { Contacts?: Array<{ ContactID?: string }> })
        .Contacts?.[0];
      if (existing?.ContactID) return existing.ContactID;
    }

    // Create — Xero accepts POST to /Contacts with the new shape.
    const body: Record<string, unknown> = { Name: contact.name };
    if (contact.email) body.EmailAddress = contact.email;
    const createRes = await fetch(`${XERO_API}/Contacts`, {
      method: "POST",
      headers,
      body: JSON.stringify({ Contacts: [body] }),
    });
    if (!createRes.ok) {
      console.error("[xero contact] create failed", await createRes.text());
      return null;
    }
    const created = await createRes.json().catch(() => ({}));
    return (created as { Contacts?: Array<{ ContactID?: string }> })
      .Contacts?.[0]?.ContactID ?? null;
  } catch (err) {
    console.error("[xero contact] network error", err);
    return null;
  }
}

function buildLineItems(
  job: Job,
  cost: CostBreakdown,
  opts: { quoteMode?: boolean; salesAccountCode?: string } = {},
): Array<Record<string, unknown>> {
  const items: Array<Record<string, unknown>> = [];
  const isNdis: boolean = job.client_type === "NDIS";
  const isAged: boolean = (job.client_type as ClientType) === "Aged Care";
  const isQuote = opts.quoteMode === true;
  // Fallback for callers that don't pass the code (e.g. previewLines
  // below). The sync path can't await config, so it gets the env-var
  // tier of the fallback chain.
  const accountCode = opts.salesAccountCode
    ?? process.env.XERO_SALES_ACCOUNT_CODE
    ?? "200";

  // ── Labour. Quantity is `billed_hours` — total worker-hours after
  // 5-min block rounding (see src/lib/cost.ts). Quantity × UnitAmount
  // equals labour_cents/100 exactly, so the Xero line total agrees
  // with the breakdown shown to Thomas.
  if (cost.labour_cents > 0) {
    const rateDollars = cost.rate_cents / 100;
    const labelSuffix = isQuote ? "estimated" : "5-min block billing";
    const labourLine: Record<string, unknown> = {
      Description: isNdis
        ? `${job.client_type} support — labour (${cost.workers_billed} worker${cost.workers_billed === 1 ? "" : "s"}, ${labelSuffix})`
        : `Garden / yard work — labour (${cost.workers_billed} worker${cost.workers_billed === 1 ? "" : "s"}, ${labelSuffix})`,
      Quantity: round3(cost.billed_hours),
      UnitAmount: round2(rateDollars),
      AccountCode: accountCode,
    };
    if (isNdis) labourLine.ItemCode = NDIS_SUPPORT_ITEM;
    items.push(labourLine);
  }

  // Note: there is no separate waiting-time line. Waiting minutes are
  // added to each worker's billable on-site time inside
  // calculateCost() and so are already inside the labour Quantity
  // above. cost.waiting_cents is 0 by construction.

  // ── Materials, one line per catalogue item with markup.
  for (const m of cost.material_lines) {
    const lineDollars = m.line_total_cents / 100;
    const unitDollars = m.qty > 0 ? lineDollars / m.qty : 0;
    items.push({
      Description: `${m.name}${m.markup_percent ? ` (incl ${m.markup_percent}% markup)` : ""}`,
      Quantity: round3(m.qty),
      UnitAmount: round2(unitDollars),
      AccountCode: accountCode,
    });
  }

  // For aged-care explicit context, add a line note via Description.
  if (isAged && items.length > 0) {
    (items[0] as Record<string, unknown>).Description += " · Aged Care";
  }

  return items;
}

function ndisReference(job: Job): string {
  // Spec says Reference = job ID; for NDIS we suffix the support item
  // so the reference reads naturally on the printed invoice.
  if (job.client_type === "NDIS") return `Job ${job.id.slice(0, 8)} · ${NDIS_SUPPORT_ITEM}`;
  return `Job ${job.id.slice(0, 8)}`;
}

function round2(n: number): number { return Math.round(n * 100) / 100; }
function round3(n: number): number { return Math.round(n * 1000) / 1000; }

// addDays now lives in lib/dates.ts as `addDaysISO` — kept as a thin
// re-export here so any existing call sites keep compiling.

// Surfaced for the "preview" before send (admin sees what will go to Xero).
export function previewLines(job: Job, cost: CostBreakdown): Array<{
  description: string; qty: string; unit: string; total: string;
}> {
  const items = buildLineItems(job, cost);
  return items.map((it) => ({
    description: String(it.Description),
    qty: round3(Number(it.Quantity)).toString(),
    unit: fmtMoney(Math.round(Number(it.UnitAmount) * 100)),
    total: fmtMoney(Math.round(Number(it.UnitAmount) * Number(it.Quantity) * 100)),
  }));
}
