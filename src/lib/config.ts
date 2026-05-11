import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClientType } from "@/lib/types";

// Hourly rates per client type, in cents. Loaded from the `config`
// table — admin can edit these via the Settings page (Slice 7+).
// Falls back to the spec defaults if a key is missing or DB is offline,
// so cost calculations never throw and never silently use $0.
export type Rates = {
  Private: number;
  NDIS: number;
  "Aged Care": number;
};

// Rates are the EX-GST amount per hour, in cents. Xero applies the
// account's tax rate (e.g. "GST on Income" — 10%) on top, so the
// in-app rate must not double-count GST.
//   Private: $50.00 ex-GST → $55.00 on the invoice once Xero adds 10%
//   NDIS / Aged Care: $56.98 — NDIS payments are GST-free, so the
//   account in Xero should be set to GST-free or the line uses
//   TaxType=NONE. The amount IS the headline rate.
const DEFAULTS: Rates = {
  Private: 5000,     // $50.00 ex-GST per hour
  NDIS: 5698,        // $56.98 (NDIS price-guide unit rate, GST-free)
  "Aged Care": 5698, // same as NDIS
};

export async function getRates(supabase: SupabaseClient | null): Promise<Rates> {
  if (!supabase) return DEFAULTS;

  const { data, error } = await supabase
    .from("config")
    .select("key, value")
    .in("key", ["private_rate_cents", "ndis_rate_cents", "aged_care_rate_cents"]);

  if (error || !data) return DEFAULTS;

  const map = new Map(data.map((row) => [row.key, Number(row.value)]));
  return {
    Private:     map.get("private_rate_cents")   ?? DEFAULTS.Private,
    NDIS:        map.get("ndis_rate_cents")      ?? DEFAULTS.NDIS,
    "Aged Care": map.get("aged_care_rate_cents") ?? DEFAULTS["Aged Care"],
  };
}

export function rateFor(rates: Rates, clientType: ClientType): number {
  return rates[clientType];
}

// ── Xero "sales" account code ────────────────────────────────────────
//
// Xero requires every invoice line to reference an account code that
// exists AND is active in the org's chart of accounts. The standard
// AU template uses "200" for Sales, but it's commonly archived (or
// renamed / replaced) once an org is in real use. We:
//   1. Prefer a value saved in the `config` table (set by Thomas via
//      the Settings page once he's picked from his actual chart).
//   2. Fall back to the XERO_SALES_ACCOUNT_CODE env var.
//   3. Fall back to "200" as a last resort.

const SALES_ACCOUNT_KEY = "xero_sales_account_code";

export async function getXeroSalesAccountCode(
  supabase: SupabaseClient | null,
): Promise<string> {
  if (supabase) {
    const { data } = await supabase
      .from("config")
      .select("value")
      .eq("key", SALES_ACCOUNT_KEY)
      .maybeSingle();
    const v = data?.value;
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  if (process.env.XERO_SALES_ACCOUNT_CODE) {
    return process.env.XERO_SALES_ACCOUNT_CODE;
  }
  return "200";
}

export async function setXeroSalesAccountCode(
  supabase: SupabaseClient,
  code: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const trimmed = code.trim();
  if (!trimmed) return { ok: false, error: "Account code is empty" };
  // Upsert by key so re-saves overwrite cleanly. The `config` table is
  // (key text primary key, value text) — see Slice 1 schema.
  const { error } = await supabase
    .from("config")
    .upsert({ key: SALES_ACCOUNT_KEY, value: trimmed }, { onConflict: "key" });
  if (error) {
    console.error("[config] save sales account failed", error);
    return { ok: false, error: "Could not save account code" };
  }
  return { ok: true };
}
