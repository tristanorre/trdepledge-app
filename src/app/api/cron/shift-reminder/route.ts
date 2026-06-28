import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { sendPush } from "@/lib/onesignal";
import { todayISO, fmtHMInAppTZ } from "@/lib/dates";
import type { Job } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Runs hourly. For every job whose scheduled_time is between now+50min
// and now+70min today, push the assigned workers a "shift starting soon"
// reminder. The 20-min window matches an hourly cron's typical jitter
// — a job at 9:00am will be pushed when the 8am run fires (50–70min
// out) and won't be re-notified at 9am because the window has passed.
//
// Idempotency: we don't track "already notified" — the natural 60-min
// window with hourly cron makes double-pushes vanishingly rare. If the
// cron retries within 5 min (unusual on Vercel), workers get a
// duplicate. Acceptable trade-off for not adding a notification-state
// table.
export async function GET(req: Request) {
  if (!isAuthorisedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceClient();
  if (!supabase) return NextResponse.json({ error: "DB not configured" }, { status: 503 });

  const now = new Date();
  const today = todayISO();
  const lower = addMinutes(now, 50);
  const upper = addMinutes(now, 70);

  // jobs.scheduled_time is stored in Adelaide local time, so the bounds
  // we compare against need to be Adelaide-local HH:MM too. Raw
  // .getHours() on a Vercel UTC lambda would query 12 hours offset and
  // miss every job.
  const lowerHm = `${fmtHMInAppTZ(lower)}:00`;
  const upperHm = `${fmtHMInAppTZ(upper)}:59`;

  const { data: jobs, error } = await supabase
    .from("jobs")
    .select("*")
    .eq("date", today)
    .in("status", ["scheduled", "in_progress"])
    .gte("scheduled_time", lowerHm)
    .lte("scheduled_time", upperHm);

  if (error) {
    console.error("[cron shift-reminder]", error);
    return NextResponse.json({ error: "Could not load jobs" }, { status: 500 });
  }

  let pushed = 0;
  for (const j of (jobs ?? []) as Job[]) {
    if (j.assigned_worker_ids.length === 0) continue;
    await sendPush({
      user_ids: j.assigned_worker_ids,
      title: "Shift starting soon",
      message: `${j.client_name}${j.suburb ? ` · ${j.suburb}` : ""} at ${String(j.scheduled_time ?? "").slice(0, 5)}`,
      deep_link: `/worker/jobs/${j.id}`,
    }, supabase);
    pushed++;
  }

  return NextResponse.json({
    ok: true,
    today,
    window: { from: lowerHm, to: upperHm },
    jobs: jobs?.length ?? 0,
    pushed,
  });
}

function isAuthorisedCron(req: Request): boolean {
  // Hard-fail without a secret — see the matching helper in
  // job-reminders/route.ts for the rationale.
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron] CRON_SECRET not set — refusing to run");
    return false;
  }
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

function addMinutes(d: Date, mins: number): Date {
  return new Date(d.getTime() + mins * 60_000);
}
