import type { SupabaseClient } from "@supabase/supabase-js";
import { twilioConfigured } from "@/lib/integrations";

// Server-side Twilio SMS sender. Uses the REST API directly — no SDK,
// keeps the bundle small and avoids server-only edge-runtime issues.
//
// Returns the message SID on success, null on configuration miss or
// API error. Caller decides how to react (we typically swallow and
// continue — a missed SMS shouldn't block the underlying business action).

const TWILIO_API = "https://api.twilio.com/2010-04-01";

export type SmsTriggerType = "auto" | "manual";

export type SmsLogContext = {
  trigger_type: SmsTriggerType;
  recipient_name?: string | null;
  job_id?: string | null;
  client_id?: string | null;
};

export type SendResult = {
  sid: string | null;
  delivery_status: string;
};

export async function sendSms(
  to: string,
  message: string,
  ctx: SmsLogContext,
  supabase: SupabaseClient | null,
): Promise<SendResult> {
  const cleanedTo = normaliseAuPhone(to);

  // Always log the attempt — even a not-configured no-op should leave a
  // breadcrumb in sms_log so Thomas can see "we would have texted X" when
  // looking through the dashboard.
  if (!twilioConfigured()) {
    console.warn("[twilio] not configured — skipping SMS to", cleanedTo);
    await logSms(supabase, {
      ...ctx,
      recipient_number: cleanedTo,
      message,
      delivery_status: "skipped_not_configured",
      twilio_message_sid: null,
    });
    return { sid: null, delivery_status: "skipped_not_configured" };
  }

  const sid  = process.env.TWILIO_ACCOUNT_SID!;
  const tok  = process.env.TWILIO_AUTH_TOKEN!;
  const from = process.env.TWILIO_FROM_NUMBER!;

  const auth = Buffer.from(`${sid}:${tok}`).toString("base64");
  const body = new URLSearchParams({ From: from, To: cleanedTo, Body: message });

  let result: SendResult = { sid: null, delivery_status: "unknown" };

  try {
    const res = await fetch(`${TWILIO_API}/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("[twilio] send failed", { status: res.status, data });
      result = { sid: null, delivery_status: `error_${res.status}` };
    } else {
      result = { sid: data.sid ?? null, delivery_status: data.status ?? "queued" };
    }
  } catch (err) {
    console.error("[twilio] network error", err);
    result = { sid: null, delivery_status: "network_error" };
  }

  await logSms(supabase, {
    ...ctx,
    recipient_number: cleanedTo,
    message,
    delivery_status: result.delivery_status,
    twilio_message_sid: result.sid,
  });

  return result;
}

async function logSms(
  supabase: SupabaseClient | null,
  row: {
    trigger_type: SmsTriggerType;
    recipient_name?: string | null;
    recipient_number: string;
    message: string;
    job_id?: string | null;
    client_id?: string | null;
    delivery_status: string;
    twilio_message_sid: string | null;
  },
): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("sms_log").insert({
    recipient_name: row.recipient_name ?? null,
    recipient_number: row.recipient_number,
    message: row.message,
    trigger_type: row.trigger_type,
    job_id: row.job_id ?? null,
    client_id: row.client_id ?? null,
    delivery_status: row.delivery_status,
    twilio_message_sid: row.twilio_message_sid,
  });
  if (error) console.error("[sms_log] insert failed", error);
}

/**
 * Best-effort AU phone normalisation. Twilio expects E.164 (`+61...`).
 * Accepts inputs like "0474 844 204", "0474844204", "+61474844204" and
 * leaves anything else alone (Twilio will reject and we'll log the error).
 */
export function normaliseAuPhone(input: string): string {
  const stripped = input.replace(/\s+/g, "").trim();
  if (stripped.startsWith("+")) return stripped;
  if (stripped.startsWith("04") && stripped.length === 10) {
    return `+61${stripped.slice(1)}`;
  }
  return stripped;
}
