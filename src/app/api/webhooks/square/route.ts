import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { getServiceClient } from "@/lib/supabase";
import { sendSms, normaliseAuPhone } from "@/lib/twilio";
import { sendPush } from "@/lib/onesignal";
import { sms } from "@/lib/sms-templates";
import { squareConfigured } from "@/lib/integrations";

export const runtime = "nodejs";
// Webhook bodies need their raw bytes for signature verification, so
// we read the request as text rather than .json() which loses fidelity.
export const dynamic = "force-dynamic";

// Square webhooks: PAYMENT_COMPLETED → create a draft job (status:
// pending_review) + auto-SMS the client confirming the booking + push
// Thomas to review and assign workers.
//
// Signature scheme: HMAC-SHA256 of (notification_url + body), base64,
// matched against `x-square-hmacsha256-signature`. The notification URL
// must match exactly what's registered in the Square dashboard — we
// derive it from the request URL.
export async function POST(req: Request) {
  if (!squareConfigured()) {
    // Reject the webhook with 503 so Square retries; once Thomas
    // configures Square in production, retries pick up.
    return NextResponse.json({ error: "Square integration not configured" }, { status: 503 });
  }

  const sigKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY!;
  const sigHeader = req.headers.get("x-square-hmacsha256-signature") ?? "";
  const url = req.url;
  const rawBody = await req.text();

  const expected = crypto
    .createHmac("sha256", sigKey)
    .update(url + rawBody)
    .digest("base64");

  if (!safeEqual(expected, sigHeader)) {
    console.warn("[square webhook] signature mismatch");
    return NextResponse.json({ error: "Bad signature" }, { status: 401 });
  }

  let event: SquareEvent;
  try { event = JSON.parse(rawBody); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  if (event.type !== "payment.created" && event.type !== "payment.updated") {
    // Acknowledge anything else so Square doesn't retry.
    return NextResponse.json({ ok: true, ignored: event.type });
  }

  const payment = event.data?.object?.payment;
  if (!payment || payment.status !== "COMPLETED") {
    return NextResponse.json({ ok: true, ignored: "not_completed" });
  }

  const supabase = getServiceClient();
  if (!supabase) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  // Pull buyer details from the payment payload. Square's shape is
  // partial-fill; defensive defaults keep us moving when fields are missing.
  const note = payment.note ?? "Square booking";
  const buyerEmail = payment.buyer_email_address ?? null;
  const shipping = payment.shipping_address;
  const buyerName = (shipping?.first_name && shipping?.last_name)
    ? `${shipping.first_name} ${shipping.last_name}`.trim()
    : (payment.buyer_email_address ?? "Square customer");
  const phone = (shipping?.phone ?? null) as string | null;

  // Idempotency — Square retries with the same id. We use it as the
  // job's `description` payload prefix so re-processing the same event
  // doesn't create a duplicate.
  const dedupeKey = `square:${payment.id}`;
  const { data: existing } = await supabase
    .from("jobs")
    .select("id")
    .ilike("description", `%${dedupeKey}%`)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ ok: true, deduped: true, job_id: existing.id });
  }

  const description = [
    note,
    `Total: ${(Number(payment.amount_money?.amount ?? 0) / 100).toFixed(2)} ${payment.amount_money?.currency ?? "AUD"}`,
    dedupeKey,
  ].join(" · ");

  const { data: job, error } = await supabase
    .from("jobs")
    .insert({
      client_name: buyerName,
      client_type: "Private",
      suburb: shipping?.locality ?? null,
      postcode: shipping?.postal_code ?? null,
      address: shipping?.address_line_1 ?? null,
      description,
      status: "pending_review",
      assigned_worker_ids: [],
    })
    .select("id, client_name")
    .single();

  if (error || !job) {
    console.error("[square webhook] insert failed", error);
    return NextResponse.json({ error: "Could not create job" }, { status: 500 });
  }

  void (async () => {
    if (phone) {
      await sendSms(
        normaliseAuPhone(phone),
        sms.bookingConfirmed(buyerName.split(" ")[0] || "there"),
        { trigger_type: "auto", recipient_name: buyerName, job_id: job.id },
        supabase,
      );
    }
    const { data: admins } = await supabase
      .from("users").select("id").eq("role", "admin").eq("active", true);
    const ids = (admins ?? []).map((a) => a.id);
    if (ids.length > 0) {
      await sendPush({
        user_ids: ids,
        title: "New Square booking",
        message: `${buyerName} — review & assign workers`,
        deep_link: `/admin/jobs/${job.id}/edit`,
      }, supabase);
    }
  })();

  return NextResponse.json({ ok: true, job_id: job.id }, { status: 201 });
}

// Constant-time string comparison — protects against timing attacks
// when a forged-signature attempt feels around.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

// Minimal Square webhook payload shape — we only read what we need.
type SquareEvent = {
  type?: string;
  data?: {
    object?: {
      payment?: {
        id: string;
        status: string;
        note?: string;
        amount_money?: { amount?: number; currency?: string };
        buyer_email_address?: string;
        shipping_address?: {
          first_name?: string;
          last_name?: string;
          phone?: string;
          address_line_1?: string;
          locality?: string;
          postal_code?: string;
        };
      };
    };
  };
};
