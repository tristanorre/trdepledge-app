import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { sendSms, normaliseAuPhone } from "@/lib/twilio";
import { sendPush } from "@/lib/onesignal";
import { sms } from "@/lib/sms-templates";
import { addDaysISO, todayISO } from "@/lib/dates";
import type { Job } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Vercel Cron entry point. Scheduled `30 8 * * *` in vercel.json.
//
// THAT IS 08:30 UTC, WHICH IS 18:00 IN ADELAIDE — deliberate, not a typo.
// Vercel runs crons in UTC and offers no timezone setting, so the local
// time has to be worked out by hand: Adelaide is UTC+9:30. Six in the
// evening is the point of it — this reminds people about TOMORROW, so it
// wants to land after the day's work, not during it.
//
// It drifts an hour over summer. Adelaide moves to UTC+10:30 for daylight
// saving, so from October to April this fires at 19:00 instead. Left as
// is: an hour either side of six is still an evening reminder, and the
// alternatives both cost more than the drift is worth — either a second
// cron entry (Hobby allows two, and both are already used) or running
// hourly and returning early unless the Adelaide hour matches.
//
// Two responsibilities per spec:
//   1. SMS the client a reminder for tomorrow's job
//   2. Push the assigned workers ("New job for tomorrow")
//
// Auth: Vercel Cron sets the `Authorization: Bearer <CRON_SECRET>`
// header. We compare against the secret env var so this can't be
// triggered from the open internet.
export async function GET(req: Request) {
  if (!isAuthorisedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceClient();
  if (!supabase) return NextResponse.json({ error: "DB not configured" }, { status: 503 });

  // Idempotency. Without this, a Vercel cron retry (rare but possible
  // after a transient 5xx) would fan out duplicate SMS + push to every
  // worker and client with a job tomorrow. Insert into cron_runs with
  // (job_name, run_date) as the PK; if the row already exists we bail
  // with the previous result. See migration 0016.
  const today = todayISO();
  const cronJobName = "job-reminders";
  const { error: claimErr } = await supabase
    .from("cron_runs")
    .insert({ job_name: cronJobName, run_date: today });
  if (claimErr) {
    // Unique-violation = already ran today, that's the success path.
    // PostgREST surfaces it as code 23505.
    if ((claimErr as { code?: string }).code === "23505") {
      return NextResponse.json({ ok: true, deduped: true, date: today });
    }
    console.error("[cron job-reminders] claim failed", claimErr);
    // Fall through and continue — better to risk a duplicate than to
    // skip an entire day's reminders silently.
  }

  const tomorrow = addDaysISO(today, 1);

  const { data: jobsData, error } = await supabase
    .from("jobs")
    .select("*")
    .eq("date", tomorrow)
    .in("status", ["scheduled", "in_progress"]);

  if (error) {
    console.error("[cron job-reminders]", error);
    return NextResponse.json({ error: "Could not load jobs" }, { status: 500 });
  }
  const jobs = (jobsData ?? []) as Job[];

  let smsSent = 0;
  let pushSent = 0;

  // Per-job: SMS the client (if we have their phone via clients table
  // or a fallback enquiry match), and push every assigned worker.
  for (const j of jobs) {
    // Worker push first — cheaper, no name-resolution required.
    if (j.assigned_worker_ids.length > 0) {
      await sendPush({
        user_ids: j.assigned_worker_ids,
        title: "New job for tomorrow",
        message: `${j.client_name}${j.suburb ? ` · ${j.suburb}` : ""}${j.scheduled_time ? ` · ${String(j.scheduled_time).slice(0, 5)}` : ""}`,
        deep_link: `/worker/jobs/${j.id}`,
      }, supabase);
      pushSent++;
    }

    // Client SMS — look up phone via linked client or fall back to a
    // recent enquiry by name. Skip silently if neither has a phone.
    const phoneInfo = await resolveClientPhone(supabase, j);
    if (phoneInfo?.phone) {
      const firstName = (phoneInfo.first_name || j.client_name).split(" ")[0] || "there";
      await sendSms(
        normaliseAuPhone(phoneInfo.phone),
        sms.jobReminder(firstName),
        { trigger_type: "auto", recipient_name: phoneInfo.first_name ?? j.client_name, job_id: j.id, client_id: j.client_id },
        supabase,
      );
      smsSent++;
    }
  }

  // Persist a summary on the cron_runs row for easy after-the-fact
  // inspection ("did Tuesday's run actually send anything?"). Best
  // effort — failure here doesn't undo the work above.
  await supabase
    .from("cron_runs")
    .update({ detail: { jobs: jobs.length, pushes_dispatched: pushSent, sms_dispatched: smsSent } })
    .eq("job_name", cronJobName)
    .eq("run_date", today);

  return NextResponse.json({
    ok: true,
    date: tomorrow,
    jobs: jobs.length,
    pushes_dispatched: pushSent,
    sms_dispatched: smsSent,
  });
}

function isAuthorisedCron(req: Request): boolean {
  // Hard-fail if no secret is configured. Soft-failing to "any
  // authorization header works" lets anyone trigger SMS / push fan-out
  // by curling the endpoint.
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron] CRON_SECRET not set — refusing to run");
    return false;
  }
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

async function resolveClientPhone(
  supabase: ReturnType<typeof getServiceClient>,
  job: Job,
): Promise<{ phone: string; first_name: string | null } | null> {
  if (!supabase) return null;

  if (job.client_id) {
    const { data } = await supabase
      .from("clients")
      .select("phone, name")
      .eq("id", job.client_id)
      .maybeSingle();
    if (data?.phone) return { phone: data.phone, first_name: data.name?.split(" ")[0] ?? null };
  }

  // Fallback to most recent matching enquiry. Won't be perfect for
  // common names; that's why the spec wants the clients table populated
  // (Slice 8.1 work).
  const first = job.client_name.split(" ")[0];
  const last = job.client_name.split(" ").slice(1).join(" ");
  const { data: enq } = await supabase
    .from("enquiries")
    .select("phone, first_name")
    .ilike("first_name", first ?? "")
    .ilike("last_name", last ?? "")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (enq?.phone) return { phone: enq.phone, first_name: enq.first_name };
  return null;
}
