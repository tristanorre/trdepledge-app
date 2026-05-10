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

const DEFAULTS: Rates = {
  Private: 5500,     // $55.00 inc-GST per hour
  NDIS: 5698,        // $56.98 (NDIS price-guide unit rate)
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
