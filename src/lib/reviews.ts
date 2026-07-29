import type { SupabaseClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { sendSms } from "@/lib/twilio";
import { sendEmail } from "@/lib/email";

// Review-request pipeline. Called from three places:
//   1. Worker clock-out — /api/worker/jobs/[id]/clock/route.ts
//   2. Admin time edit  — /api/admin/jobs/[id]/time/route.ts
//   3. Admin resend btn — /api/admin/jobs/[id]/send-review-request/route.ts
//
// Behaviour is idempotent-ish: repeated calls for the same job update
// the same review_requests row (unique on job_id). The token itself
// only changes if a row didn't exist yet — so links previously sent
// keep working after a resend.

const APP_BASE_URL = process.env.NEXT_PUBLIC_APP_URL
  ?? "https://trdepledgegardeningandmaintenance.com";

// Fallback opens the business Maps listing (has a Write-review button
// on the page). Override with the exact "Write review" URL from
// Google Business Profile → Get more reviews → Share review form for
// the one-tap experience.
const GOOGLE_REVIEW_URL = process.env.GOOGLE_REVIEW_URL
  ?? "https://www.google.com/maps?cid=2519175055693832199";

export function googleReviewUrl(): string {
  return GOOGLE_REVIEW_URL;
}

function newToken(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

function feedbackLink(token: string): string {
  return `${APP_BASE_URL}/feedback/${token}`;
}

type SendOutcome = {
  ok: boolean;
  reason?: "no_contact" | "already_responded" | "db_error";
  sms_sid?: string | null;
  email_id?: string | null;
  token?: string;
};

// Fire (or refire) the review request for a job. Returns an outcome
// that the caller can log/surface; never throws.
export async function sendReviewRequestForJob(
  supabase: SupabaseClient,
  jobId: string,
): Promise<SendOutcome> {
  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .select("id, client_id, client_name, status")
    .eq("id", jobId)
    .maybeSingle();
  if (jobErr || !job) return { ok: false, reason: "db_error" };
  if (job.status !== "completed") return { ok: false, reason: "db_error" };

  const { data: client } = job.client_id
    ? await supabase
        .from("clients")
        .select("id, name, phone, email")
        .eq("id", job.client_id)
        .maybeSingle()
    : { data: null as null };

  const phone = client?.phone?.trim() || null;
  const email = client?.email?.trim() || null;
  if (!phone && !email) return { ok: false, reason: "no_contact" };

  // Upsert (job_id is unique). Reuse existing token if present so a
  // previously-shared link stays valid.
  const { data: existing } = await supabase
    .from("review_requests")
    .select("token, responded_at")
    .eq("job_id", jobId)
    .maybeSingle();

  if (existing?.responded_at) {
    return { ok: false, reason: "already_responded", token: existing.token };
  }

  const token = existing?.token ?? newToken();
  const link = feedbackLink(token);
  const firstName = (client?.name || job.client_name || "there").split(/\s+/)[0];

  const smsBody =
    `Hi ${firstName}, Thomas from T.R. Depledge Gardening. Thanks for your ` +
    `business — how did we go? Rate us here: ${link}`;

  const emailSubject = "How did we go? · T.R. Depledge Gardening";
  const emailHtml = `
    <p>Hi ${escapeHtml(firstName)},</p>
    <p>Thanks for choosing T.R. Depledge Gardening &amp; Maintenance.
    We'd love to hear how we went — it takes 5 seconds.</p>
    <p style="margin:24px 0">
      <a href="${link}" style="background:#0F1B2D;color:#D0FF59;padding:12px 22px;
        border-radius:8px;text-decoration:none;font-weight:800;font-family:Arial,sans-serif">
        Rate our service →
      </a>
    </p>
    <p style="color:#666;font-size:12px">Or paste this into your browser:<br>${link}</p>
    <p>Cheers,<br>Thomas Depledge</p>
  `;
  const emailText =
    `Hi ${firstName},\n\nThanks for choosing T.R. Depledge Gardening & Maintenance. ` +
    `We'd love to hear how we went. Rate our service here:\n${link}\n\nCheers,\nThomas Depledge`;

  const sentVia: string[] = [];
  let smsSid: string | null = null;
  let emailId: string | null = null;

  if (phone) {
    const sms = await sendSms(
      phone,
      smsBody,
      { trigger_type: "auto", recipient_name: client?.name ?? job.client_name, job_id: jobId, client_id: client?.id ?? null },
      supabase,
    );
    smsSid = sms.sid;
    if (sms.sid) sentVia.push("sms");
  }
  if (email) {
    const res = await sendEmail({
      to: email,
      subject: emailSubject,
      html: emailHtml,
      text: emailText,
    });
    if (res.ok) {
      emailId = res.id;
      sentVia.push("email");
    }
  }

  const row = {
    job_id: jobId,
    client_id: client?.id ?? null,
    token,
    sent_at: new Date().toISOString(),
    sent_via: sentVia,
  };

  const { error: upsertErr } = await supabase
    .from("review_requests")
    .upsert(row, { onConflict: "job_id" });
  if (upsertErr) {
    console.error("[reviews] upsert failed", upsertErr);
    return { ok: false, reason: "db_error", sms_sid: smsSid, email_id: emailId, token };
  }

  return { ok: sentVia.length > 0, sms_sid: smsSid, email_id: emailId, token };
}

// Convenience — call from the two status-transition hooks after the
// UPDATE succeeds. Best-effort: swallows errors so a failed SMS never
// blocks a clock-out or time edit.
export async function maybeSendReviewOnCompletion(
  supabase: SupabaseClient,
  prevStatus: string | undefined,
  nextStatus: string | undefined,
  jobId: string,
): Promise<void> {
  if (prevStatus === "completed") return;
  if (nextStatus !== "completed") return;
  // Workers can now clock in/out multiple times per job — a job can
  // flip completed → in_progress → completed if they leave and come
  // back. The client should NOT get a duplicate SMS on every
  // re-completion; only send if we've never sent a request for this
  // job. Manual /admin/jobs/[id]/send-review-request still exists
  // as the resend path if Thomas ever needs to trigger one again.
  const { data: existing } = await supabase
    .from("review_requests")
    .select("sent_at")
    .eq("job_id", jobId)
    .maybeSingle();
  if (existing?.sent_at) return;
  try {
    await sendReviewRequestForJob(supabase, jobId);
  } catch (err) {
    console.error("[reviews] auto-send failed", err);
  }
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
