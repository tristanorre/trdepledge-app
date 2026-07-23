import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getServiceClient } from "@/lib/supabase";
import FeedbackForm from "./FeedbackForm";

export const metadata: Metadata = {
  title: "How did we go? · T.R. Depledge Gardening",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

// Public page. Anyone with the token can rate the job — it's a
// shareable link. No auth, no PII displayed except the client's first
// name (as a greeting). A submitted rating flips responded_at so the
// page can't be reused to spam ratings.
export default async function FeedbackPage({
  params,
}: {
  params: { token: string };
}) {
  const token = params.token;
  if (!/^[a-f0-9]{32}$/i.test(token)) notFound();

  const supabase = getServiceClient();
  if (!supabase) notFound();

  const { data: req } = await supabase
    .from("review_requests")
    .select("id, token, responded_at, rating, job_id, client_id")
    .eq("token", token)
    .maybeSingle();
  if (!req) notFound();

  const { data: job } = await supabase
    .from("jobs")
    .select("client_name")
    .eq("id", req.job_id)
    .maybeSingle();

  const firstName = (job?.client_name ?? "there").split(/\s+/)[0];
  const alreadyResponded = !!req.responded_at;

  return (
    <section className="feedback-hero">
      <div className="container feedback-shell">
        <div className="eyebrow">T.R. Depledge Gardening &amp; Maintenance</div>
        <h1 className="section-title light" style={{ marginBottom: 12 }}>
          {alreadyResponded ? <>Thanks, {firstName}.</> : <>How did we go, <em>{firstName}</em>?</>}
        </h1>

        {alreadyResponded ? (
          <p className="section-lead light" style={{ margin: "0 auto", maxWidth: 620 }}>
            We&apos;ve got your rating — {req.rating ? `${req.rating} ★` : "cheers"} — and appreciate the time.
          </p>
        ) : (
          <>
            <p className="section-lead light" style={{ margin: "0 auto 24px", maxWidth: 620 }}>
              Tap the stars below to rate our service. Takes 5 seconds.
            </p>
            <FeedbackForm token={token} firstName={firstName} />
          </>
        )}
      </div>
    </section>
  );
}
