import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { sendEmail } from "@/lib/email";
import { googleReviewUrl } from "@/lib/reviews";

export const runtime = "nodejs";

// POST /api/reviews/submit
//   Body: { token: string, rating: 1..5, private_feedback?: string | null }
// Public endpoint — the token is the only auth. Idempotent-ish:
// second submission for the same token returns 409 so someone
// sharing the link can't overwrite the original response.
export async function POST(req: Request) {
  const supabase = getServiceClient();
  if (!supabase) return NextResponse.json({ error: "Database not configured" }, { status: 503 });

  let body: { token?: unknown; rating?: unknown; private_feedback?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const token = String(body.token ?? "");
  if (!/^[a-f0-9]{32}$/i.test(token)) {
    return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  }
  const rating = Number(body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ error: "Rating must be 1-5" }, { status: 400 });
  }
  const privateFeedback =
    typeof body.private_feedback === "string"
      ? body.private_feedback.trim().slice(0, 2000) || null
      : null;

  const { data: reqRow, error: readErr } = await supabase
    .from("review_requests")
    .select("id, job_id, client_id, responded_at, token")
    .eq("token", token)
    .maybeSingle();
  if (readErr) {
    console.error("[reviews/submit] read", readErr);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
  if (!reqRow) return NextResponse.json({ error: "Invalid token" }, { status: 404 });
  if (reqRow.responded_at) {
    return NextResponse.json({ error: "Already responded" }, { status: 409 });
  }

  const routeToGoogle = rating >= 4;

  const { error: updErr } = await supabase
    .from("review_requests")
    .update({
      responded_at: new Date().toISOString(),
      rating,
      private_feedback: privateFeedback,
      redirected_to_google: routeToGoogle,
    })
    .eq("id", reqRow.id);
  if (updErr) {
    console.error("[reviews/submit] update", updErr);
    return NextResponse.json({ error: "Could not save" }, { status: 500 });
  }

  // Notify Thomas for every response so he sees ratings land in real
  // time, but urgent-flag the ones that stayed private (<= 3 stars).
  await notifyThomas({
    supabase,
    jobId: reqRow.job_id,
    rating,
    privateFeedback,
    routedToGoogle: routeToGoogle,
  }).catch((e) => console.error("[reviews/submit] notify", e));

  if (routeToGoogle) {
    return NextResponse.json({ ok: true, redirect: googleReviewUrl() });
  }
  return NextResponse.json({ ok: true });
}

async function notifyThomas(args: {
  supabase: ReturnType<typeof getServiceClient>;
  jobId: string;
  rating: number;
  privateFeedback: string | null;
  routedToGoogle: boolean;
}): Promise<void> {
  const notifyEmail = process.env.ENQUIRY_NOTIFY_EMAIL;
  if (!notifyEmail) return;

  let clientName = "a client";
  if (args.supabase) {
    const { data: job } = await args.supabase
      .from("jobs")
      .select("client_name, suburb")
      .eq("id", args.jobId)
      .maybeSingle();
    if (job) {
      clientName = job.suburb ? `${job.client_name} · ${job.suburb}` : job.client_name;
    }
  }

  const stars = "★".repeat(args.rating) + "☆".repeat(5 - args.rating);
  const urgent = args.rating <= 3;
  const subject = urgent
    ? `⚠️ ${args.rating}★ review — ${clientName}`
    : `${stars} · ${clientName}`;

  const html = urgent
    ? `
      <p><strong>${clientName}</strong> just left a private ${args.rating}-star rating.</p>
      <p style="font-size:20px;color:#B91C1C"><strong>${stars}</strong></p>
      ${args.privateFeedback
        ? `<p style="background:#FEF3C7;padding:12px 14px;border-radius:8px;font-size:14px"><em>"${escapeHtml(args.privateFeedback)}"</em></p>`
        : `<p style="color:#666">No comments.</p>`}
      <p>This did <strong>not</strong> get sent to Google. Follow up directly.</p>
    `
    : `
      <p><strong>${clientName}</strong> just left ${args.rating} stars.</p>
      <p style="font-size:20px;color:#0F1B2D"><strong>${stars}</strong></p>
      <p>They were redirected to your Google review form. Fingers crossed they finish the review there!</p>
    `;

  await sendEmail({
    to: notifyEmail,
    subject,
    html,
    text: `${stars} — ${clientName}\n\n${args.privateFeedback ?? "(no comments)"}`,
  });
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
