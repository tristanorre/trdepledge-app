import type { SupabaseClient } from "@supabase/supabase-js";
import { xeroConfigured } from "@/lib/integrations";

const TOKEN_URL = "https://identity.xero.com/connect/token";
const AUTH_URL  = "https://login.xero.com/identity/connect/authorize";
const CONNECTIONS_URL = "https://api.xero.com/connections";

// Scopes we need for invoicing. The "Send invoice to Xero" flow on
// the admin job page looks up / creates the client contact, then
// creates a draft invoice.
//
// Xero rolled out granular scopes on 2 March 2026. Apps created
// after that date can't use the old broad `accounting.transactions`
// scope — it's now split into per-resource scopes
// (`accounting.invoices`, `accounting.payments`, etc.). Confirmed via
// Xero's Granular Scopes FAQ and Developer Blog:
//   * accounting.contacts is NOT changing — keep the broad name
//   * accounting.transactions IS gone — replaced by
//     accounting.invoices (covers invoices, credit notes,
//     linked transactions, purchase orders, quotes, items)
//
// Each scope without a suffix grants both read AND write; the
// `.read` variant is for read-only when needed.
export const XERO_SCOPES = [
  "openid", "profile", "email",
  "offline_access",
  "accounting.contacts",
  "accounting.invoices",
].join(" ");

export type XeroTokens = {
  user_id: string;
  access_token: string;
  refresh_token: string;
  tenant_id: string;
  expires_at: string; // ISO
};

export function buildAuthUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.XERO_CLIENT_ID!,
    redirect_uri: process.env.XERO_REDIRECT_URI!,
    scope: XERO_SCOPES,
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

/** Exchange an OAuth `code` for tokens + tenant_id. */
export async function exchangeCodeForTokens(code: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
  tenant_id: string;
} | { error: string }> {
  if (!xeroConfigured()) return { error: "not_configured" };

  const auth = Buffer.from(
    `${process.env.XERO_CLIENT_ID}:${process.env.XERO_CLIENT_SECRET}`,
  ).toString("base64");

  const tokenRes = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: process.env.XERO_REDIRECT_URI!,
    }).toString(),
  });
  const tokenData = await tokenRes.json().catch(() => ({}));
  if (!tokenRes.ok) {
    console.error("[xero] token exchange failed", tokenData);
    return { error: "token_exchange_failed" };
  }

  // Connections lists all the Xero tenants the user has authorised.
  // Most users have one — we pick the first. Multi-tenant selection
  // would be its own UX.
  const connRes = await fetch(CONNECTIONS_URL, {
    headers: { "Authorization": `Bearer ${tokenData.access_token}` },
  });
  const conns = await connRes.json().catch(() => []);
  if (!connRes.ok || !Array.isArray(conns) || conns.length === 0) {
    console.error("[xero] connections fetch failed", conns);
    return { error: "no_connections" };
  }

  return {
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    expires_in: tokenData.expires_in,
    tenant_id: conns[0].tenantId,
  };
}

/** Refresh an access token. Updates the row in xero_tokens. */
export async function refreshAccessToken(
  supabase: SupabaseClient,
  current: XeroTokens,
): Promise<XeroTokens | null> {
  if (!xeroConfigured()) return null;

  const auth = Buffer.from(
    `${process.env.XERO_CLIENT_ID}:${process.env.XERO_CLIENT_SECRET}`,
  ).toString("base64");

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: current.refresh_token,
    }).toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("[xero] refresh failed", data);
    return null;
  }

  const expires_at = new Date(Date.now() + (data.expires_in ?? 1800) * 1000).toISOString();
  const next: XeroTokens = {
    user_id: current.user_id,
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? current.refresh_token,
    tenant_id: current.tenant_id,
    expires_at,
  };

  await supabase.from("xero_tokens").update({
    access_token: next.access_token,
    refresh_token: next.refresh_token,
    expires_at,
  }).eq("user_id", current.user_id);

  return next;
}

/** Returns a fresh access token (refreshing automatically if expired). */
export async function getValidTokens(
  supabase: SupabaseClient,
  user_id: string,
): Promise<XeroTokens | null> {
  const { data, error } = await supabase
    .from("xero_tokens")
    .select("user_id, access_token, refresh_token, tenant_id, expires_at")
    .eq("user_id", user_id)
    .maybeSingle();
  if (error || !data) return null;

  const tokens = data as XeroTokens;
  // Refresh if within 60 seconds of expiry — gives us headroom on a
  // slow API call.
  const expiresAt = new Date(tokens.expires_at).getTime();
  if (Date.now() + 60_000 >= expiresAt) {
    return refreshAccessToken(supabase, tokens);
  }
  return tokens;
}
