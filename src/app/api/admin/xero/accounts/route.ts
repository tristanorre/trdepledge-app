import { NextResponse } from "next/server";
import { requireApiAdmin, requireSupabase } from "@/lib/api-auth";
import { getValidTokens } from "@/lib/xero";
import { getXeroSalesAccountCode } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/xero/accounts
//
// Returns the org's chart-of-accounts filtered to active sales /
// revenue accounts. Used by the Settings page so Thomas can pick a
// valid AccountCode for invoice line items (replaces the brittle
// hard-coded "200" default).
//
// Xero's /Accounts endpoint returns the full chart, so we filter
// server-side to:
//   - Status == "ACTIVE"      (archived ones get rejected on invoice)
//   - Type in REVENUE / SALES (the two enum values that make sense for
//     "income" lines; SALES is the bank-feed-style alias)
//   - EnablePaymentsToAccount is irrelevant for revenue
export async function GET() {
  const auth = await requireApiAdmin();
  if (auth instanceof NextResponse) return auth;
  const { session } = auth;

  const supabase = requireSupabase();
  if (supabase instanceof NextResponse) return supabase;

  const tokens = await getValidTokens(supabase, session.user.id);
  if (!tokens) {
    return NextResponse.json({
      error: "Xero not connected. Connect it first via Settings.",
    }, { status: 400 });
  }

  const res = await fetch("https://api.xero.com/api.xro/2.0/Accounts", {
    headers: {
      "Authorization": `Bearer ${tokens.access_token}`,
      "Xero-Tenant-Id": tokens.tenant_id,
      "Accept": "application/json",
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("[xero accounts] fetch failed", { status: res.status, data });
    return NextResponse.json({
      error: "Could not fetch accounts from Xero",
      detail: data,
    }, { status: 502 });
  }

  type RawAccount = {
    Code?: string;
    Name?: string;
    Type?: string;
    Status?: string;
    EnablePaymentsToAccount?: boolean;
    Description?: string;
  };
  const raw = (data as { Accounts?: RawAccount[] }).Accounts ?? [];

  // Sales lines need a revenue-type account. Including SALES too — some
  // orgs use the legacy enum on a few accounts.
  const revenueTypes = new Set(["REVENUE", "SALES", "OTHERINCOME"]);

  const accounts = raw
    .filter((a) => a.Status === "ACTIVE" && a.Type && revenueTypes.has(a.Type))
    .map((a) => ({
      code: a.Code ?? "",
      name: a.Name ?? "(unnamed)",
      type: a.Type ?? "",
      description: a.Description ?? null,
    }))
    .filter((a) => a.code) // a code-less account can't be referenced
    .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));

  const current = await getXeroSalesAccountCode(supabase);

  return NextResponse.json({ accounts, current });
}
