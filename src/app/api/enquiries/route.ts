import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { sendSms, normaliseAuPhone } from "@/lib/twilio";
import { sendPush } from "@/lib/onesignal";
import { sendEmail } from "@/lib/email";
import { sms } from "@/lib/sms-templates";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { after } from "@/lib/after";

export const runtime = "nodejs";

const REQUIRED_FIELDS = [
  "first_name", "last_name", "email", "suburb", "service_type",
] as const;

// Per-field length caps. Generous enough that no real human gets cut off
// (a long-form message is still 2000 chars), tight enough that a bot
// can't dump a megabyte of SEO spam into our Postgres row.
const MAX_LENGTH: Record<string, number> = {
  first_name: 80,
  last_name: 80,
  email: 200,
  phone: 32,
  suburb: 120,
  service_type: 80,
  client_type: 80,
  message: 2000,
};

type Payload = {
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  suburb: string;
  service_type: string;
  client_type?: string;
  message?: string;
};

export async function POST(req: Request) {
  // ── Rate limit. Tied to client IP. 5 enquiries / 10 min is well above
  // any plausible legitimate use (one person re-submitting after a typo),
  // and well below what a bot script tries.
  const ip = clientIp(req);
  const limit = rateLimit(`enquiries:${ip}`, { max: 5, windowMs: 10 * 60 * 1000 });
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many submissions, try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(limit.resetMs / 1000)) } },
    );
  }

  let raw: unknown;
  try { raw = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  if (!raw || typeof raw !== "object") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  const body = raw as Record<string, unknown>;

  // ── Honeypot. The form ships a hidden `website` field that a real
  // browser never fills in but most form-spam bots blindly populate.
  // Any non-empty value here = bot. We return 200 so the bot doesn't
  // know it was caught and retry with a different shape.
  const honeypot = typeof body.website === "string" ? body.website.trim() : "";
  if (honeypot) {
    console.warn("[enquiries] honeypot triggered, ignoring", { ip });
    return NextResponse.json({ ok: true, persisted: false });
  }

  // Truncate (rather than reject) to be generous with humans pasting
  // long content — still hard-caps row size for the DB.
  const cap = (v: unknown, k: keyof typeof MAX_LENGTH) =>
    String(v ?? "").trim().slice(0, MAX_LENGTH[k]);

  const data: Payload = {
    first_name:   cap(body.first_name, "first_name"),
    last_name:    cap(body.last_name,  "last_name"),
    email:        cap(body.email,      "email").toLowerCase(),
    phone:        cap(body.phone,      "phone")        || undefined,
    suburb:       cap(body.suburb,     "suburb"),
    service_type: cap(body.service_type, "service_type"),
    client_type:  cap(body.client_type,  "client_type") || undefined,
    message:      cap(body.message,    "message")      || undefined,
  };

  for (const f of REQUIRED_FIELDS) {
    if (!data[f]) {
      return NextResponse.json({ error: `Missing field: ${f}` }, { status: 400 });
    }
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  const supabase = getServiceClient();

  if (!supabase) {
    console.warn(
      "[enquiries] Supabase not configured — enquiry accepted but not persisted:",
      JSON.stringify({ ...data, message: data.message?.slice(0, 200) })
    );
    return NextResponse.json({ ok: true, persisted: false });
  }

  const { data: inserted, error } = await supabase
    .from("enquiries")
    .insert({
      first_name: data.first_name,
      last_name: data.last_name,
      email: data.email,
      phone: data.phone ?? null,
      suburb: data.suburb,
      service_type: data.service_type,
      client_type: data.client_type ?? null,
      message: data.message ?? null,
      status: "new",
    })
    .select("id")
    .single();

  if (error || !inserted) {
    console.error("[enquiries] Supabase insert failed:", error);
    return NextResponse.json({ error: "Could not save enquiry" }, { status: 500 });
  }

  // Fire-and-forget side effects. Each helper is graceful: missing
  // credentials log a warning and become a no-op. We don't await
  // serially — concurrent dispatch shaves latency on the user's POST.
  const sideEffects: Promise<unknown>[] = [];

  // 1) Auto-reply SMS to the client (only if they gave us a phone).
  if (data.phone) {
    const message = sms.enquiryReceived(data.first_name);
    sideEffects.push(
      sendSms(
        normaliseAuPhone(data.phone),
        message,
        {
          trigger_type: "auto",
          recipient_name: `${data.first_name} ${data.last_name}`.trim(),
        },
        supabase,
      ).then(async (result) => {
        if (result.sid) {
          await supabase
            .from("enquiries")
            .update({ sms_sent: true, sms_sent_at: new Date().toISOString() })
            .eq("id", inserted.id);
        }
      })
    );
  }

  // 2) Push to admins ("New enquiry from … — service — suburb").
  sideEffects.push((async () => {
    const { data: admins } = await supabase
      .from("users")
      .select("id")
      .eq("role", "admin")
      .eq("active", true);
    const adminIds = (admins ?? []).map((u) => u.id);
    if (adminIds.length === 0) return;
    await sendPush(
      {
        user_ids: adminIds,
        title: "New website enquiry",
        message: `${data.first_name} ${data.last_name} · ${data.service_type} · ${data.suburb}`,
        deep_link: `/admin/enquiries/${inserted.id}`,
      },
      supabase,
    );
  })());

  // 3) Email to ENQUIRY_NOTIFY_EMAIL (typically Thomas) so it lands in
  //    his inbox even if the OneSignal push misses or his phone is off.
  const notifyEmail = process.env.ENQUIRY_NOTIFY_EMAIL;
  if (notifyEmail) {
    sideEffects.push(sendEmail({
      to: notifyEmail,
      reply_to: data.email,
      subject: `New enquiry — ${data.first_name} ${data.last_name} (${data.service_type})`,
      html: enquiryEmailHtml(data),
      text: enquiryEmailText(data),
    }));
  }

  // Don't await side effects — register through `after()` so the
  // function instance keeps running long enough for SMS / push / email
  // to complete after we return 200 to the user. The user's
  // submit-then-redirect flow shouldn't wait on Twilio + OneSignal +
  // Resend round-trips, but we also can't `void` them on Vercel
  // because the instance would be killed.
  after(Promise.allSettled(sideEffects));

  return NextResponse.json({ ok: true, persisted: true, id: inserted.id });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function enquiryEmailHtml(d: Payload): string {
  const phoneLine = d.phone
    ? `<tr><td><strong>Phone</strong></td><td><a href="tel:${escapeHtml(d.phone)}">${escapeHtml(d.phone)}</a></td></tr>`
    : `<tr><td><strong>Phone</strong></td><td style="color:#B91C1C;">No phone — email only</td></tr>`;
  const messageBlock = d.message
    ? `<p style="margin-top:16px;background:#F2F2EC;padding:12px;border-radius:8px;white-space:pre-wrap;">${escapeHtml(d.message)}</p>`
    : "";
  return `<!doctype html><html><body style="font-family:system-ui,sans-serif;color:#0D0D0D;line-height:1.5;">
<h2 style="font-family:Georgia,serif;color:#0A1F3D;margin:0 0 16px;">New website enquiry</h2>
<p style="margin:0 0 16px;color:#6B7280;">Submitted via the contact form.</p>
<table style="border-collapse:collapse;font-size:14px;">
  <tr><td style="padding:6px 16px 6px 0;"><strong>Name</strong></td><td>${escapeHtml(d.first_name)} ${escapeHtml(d.last_name)}</td></tr>
  <tr><td style="padding:6px 16px 6px 0;"><strong>Email</strong></td><td><a href="mailto:${escapeHtml(d.email)}">${escapeHtml(d.email)}</a></td></tr>
  ${phoneLine}
  <tr><td style="padding:6px 16px 6px 0;"><strong>Suburb</strong></td><td>${escapeHtml(d.suburb)}</td></tr>
  <tr><td style="padding:6px 16px 6px 0;"><strong>Service</strong></td><td>${escapeHtml(d.service_type)}</td></tr>
  ${d.client_type ? `<tr><td style="padding:6px 16px 6px 0;"><strong>Client type</strong></td><td>${escapeHtml(d.client_type)}</td></tr>` : ""}
</table>
${messageBlock}
<p style="margin-top:24px;font-size:12px;color:#6B7280;">Reply to this email and it'll go straight to ${escapeHtml(d.email)}.</p>
</body></html>`;
}

function enquiryEmailText(d: Payload): string {
  return [
    "New website enquiry",
    "",
    `Name: ${d.first_name} ${d.last_name}`,
    `Email: ${d.email}`,
    `Phone: ${d.phone ?? "(not provided)"}`,
    `Suburb: ${d.suburb}`,
    `Service: ${d.service_type}`,
    d.client_type ? `Client type: ${d.client_type}` : null,
    d.message ? `\nMessage:\n${d.message}` : null,
  ].filter(Boolean).join("\n");
}
