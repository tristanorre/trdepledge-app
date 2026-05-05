// Server-side email sender. Uses Resend's HTTP API directly — no SDK,
// keeps the bundle clean. Resend was chosen over SendGrid/Postmark
// because it has a free tier sufficient for our enquiry volume and a
// trivial API surface.
//
// Env vars:
//   RESEND_API_KEY       — required to actually send
//   RESEND_FROM          — required, e.g. "T.R. Depledge <enquiries@trdepledge...>"
//
// Returns ok:true even when env is missing — the helper is graceful per
// the project's standard pattern. Caller decides if a missing email is
// worth surfacing.

const RESEND_API = "https://api.resend.com/emails";

export type SendEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  reply_to?: string;
};

export type SendEmailResult =
  | { ok: true; id: string | null; skipped?: "not_configured" }
  | { ok: false; error: string };

export function emailConfigured(): boolean {
  return !!(process.env.RESEND_API_KEY && process.env.RESEND_FROM);
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  if (!emailConfigured()) {
    console.warn("[email] not configured — would have sent:", { to: input.to, subject: input.subject });
    return { ok: true, id: null, skipped: "not_configured" };
  }

  const apiKey = process.env.RESEND_API_KEY!;
  const from = process.env.RESEND_FROM!;

  const body = {
    from,
    to: Array.isArray(input.to) ? input.to : [input.to],
    subject: input.subject,
    html: input.html,
    ...(input.text ? { text: input.text } : {}),
    ...(input.reply_to ? { reply_to: input.reply_to } : {}),
  };

  try {
    const res = await fetch(RESEND_API, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("[email] send failed", { status: res.status, data });
      return { ok: false, error: `http_${res.status}` };
    }
    return { ok: true, id: typeof data.id === "string" ? data.id : null };
  } catch (err) {
    console.error("[email] network error", err);
    return { ok: false, error: "network_error" };
  }
}
