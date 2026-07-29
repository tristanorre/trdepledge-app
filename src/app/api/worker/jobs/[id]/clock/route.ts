import { NextResponse } from "next/server";
import { requireApiWorker, requireSupabase } from "@/lib/api-auth";
import type { JobStatus } from "@/lib/types";
import type { BreakEntry, SessionEntry, TimeLog } from "@/lib/cost";
import { sessionsOf } from "@/lib/cost";
import { checkWeeklyMilestones } from "@/lib/milestones";
import { rollForwardRecurringJob, justCompleted } from "@/lib/recurring-jobs";
import { maybeSendReviewOnCompletion } from "@/lib/reviews";

export const runtime = "nodejs";

// Clock in / out / break for the current worker on a job they're
// assigned to.
//
//   POST { action: "in" | "out" | "break-start" | "break-end" }
//
// time_log is keyed by worker uuid, and each value is an ARRAY of
// sessions — workers can leave a job to attend another and come
// back later, so a single job can hold multiple {start, end,
// breaks} sessions per worker:
//   { [worker_id]: [{ start, end?, breaks?: [{ start, end? }] }, ...] }
//
// Backwards-compat: legacy rows stored the value as a single object
// (one session). sessionsOf() normalises both shapes on read; we
// always WRITE the array shape here so older rows migrate lazily.
//
// Status transitions:
//   - "in":           append a new session (or no-op if the latest
//                     session is still open). Job → in_progress
//                     unless it was already completed and now stays
//                     completed until the new session is closed —
//                     actually, we flip a completed job BACK to
//                     in_progress the moment someone clocks in
//                     again, since work is happening again.
//   - "out":          close the currently-open session. Auto-
//                     completes the job once every assigned worker
//                     has ≥1 session AND no session is open anywhere.
//   - "break-start":  append to the CURRENT session's breaks. 409 if
//                     not currently clocked in / already on break.
//   - "break-end":    close the current session's latest open break.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireApiWorker();
  if (auth instanceof NextResponse) return auth;
  const { session } = auth;

  const supabase = requireSupabase();
  if (supabase instanceof NextResponse) return supabase;

  let body: { action?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const action = body.action;
  if (action !== "in" && action !== "out" && action !== "break-start" && action !== "break-end") {
    return NextResponse.json({
      error: "action must be 'in', 'out', 'break-start', or 'break-end'",
    }, { status: 400 });
  }

  const { data: job, error: readErr } = await supabase
    .from("jobs")
    .select("id, status, time_log, assigned_worker_ids")
    .eq("id", params.id)
    .contains("assigned_worker_ids", [session.user.id])
    .maybeSingle();

  if (readErr) {
    console.error("[worker clock]", readErr);
    return NextResponse.json({ error: "Could not load job" }, { status: 500 });
  }
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const fullLog = (job.time_log ?? {}) as TimeLog;
  const mySessions: SessionEntry[] = sessionsOf(fullLog[session.user.id]);
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {};

  // Pointer to the "latest" session — the one that clock-out /
  // break-* operate on. May be undefined if the worker has never
  // clocked in on this job.
  const latest = mySessions.length > 0 ? mySessions[mySessions.length - 1] : undefined;
  const latestOpen = !!latest?.start && !latest?.end;

  let nextSessions: SessionEntry[] = mySessions;

  if (action === "in") {
    if (latestOpen) {
      // Already clocked in on the current session — noop.
      return NextResponse.json({ job, already_clocked_in: true });
    }
    // Append a fresh session. Sessions are order-preserving so
    // history is preserved.
    nextSessions = [...mySessions, { start: now, breaks: [] as BreakEntry[] }];
    if (job.status !== "in_progress") {
      // Also flips a "completed" job back to in_progress — the crew
      // returning to the site means the job is genuinely active
      // again. Recurring-roll-forward + review-send are idempotent
      // on the downstream side.
      patch.status = "in_progress" satisfies JobStatus;
    }
  } else if (action === "out") {
    if (!latest?.start) {
      return NextResponse.json({ error: "Cannot clock out — not clocked in." }, { status: 409 });
    }
    if (!latestOpen) {
      return NextResponse.json({ job, already_clocked_out: true });
    }
    // Close any open break inside this session, then close the
    // session itself.
    const closedBreaks = closeOpenBreak(latest.breaks, now);
    nextSessions = [
      ...mySessions.slice(0, -1),
      { ...latest, breaks: closedBreaks, end: now },
    ];

    // Compute the tentative next full log so we can decide the
    // auto-complete transition.
    const tentativeFullLog: TimeLog = {
      ...fullLog,
      [session.user.id]: nextSessions,
    };
    if (isJobFullyClockedOut(tentativeFullLog, job.assigned_worker_ids ?? [])) {
      patch.status = "completed" satisfies JobStatus;
    }
  } else if (action === "break-start") {
    if (!latest?.start || !latestOpen) {
      return NextResponse.json({
        error: "Cannot start a break — not currently clocked in.",
      }, { status: 409 });
    }
    if (isOnBreak(latest.breaks)) {
      return NextResponse.json({ job, already_on_break: true });
    }
    const nextBreaks: BreakEntry[] = [...(latest.breaks ?? []), { start: now }];
    nextSessions = [
      ...mySessions.slice(0, -1),
      { ...latest, breaks: nextBreaks },
    ];
  } else {
    // action === "break-end"
    if (!latest?.start || !latestOpen) {
      return NextResponse.json({
        error: "Cannot end a break — not currently clocked in.",
      }, { status: 409 });
    }
    if (!isOnBreak(latest.breaks)) {
      return NextResponse.json({ job, not_on_break: true });
    }
    nextSessions = [
      ...mySessions.slice(0, -1),
      { ...latest, breaks: closeOpenBreak(latest.breaks, now) },
    ];
  }

  patch.time_log = { ...fullLog, [session.user.id]: nextSessions };

  const { data: updated, error: updateErr } = await supabase
    .from("jobs")
    .update(patch)
    .eq("id", params.id)
    .contains("assigned_worker_ids", [session.user.id])
    .select("*")
    .single();

  if (updateErr) {
    console.error("[worker clock] update", updateErr);
    return NextResponse.json({ error: "Could not update job" }, { status: 500 });
  }

  await checkWeeklyMilestones(supabase, session.user.id);

  // Downstream completion side-effects — fired only on the transition
  // to completed. Both helpers are idempotent on their DB writes so
  // a job that flip-flops (completed → in_progress → completed) is
  // safe: the roll-forward no-ops if the next visit already exists,
  // and the review helper skips resending if a review request has
  // already been sent for this job.
  if (justCompleted(job.status, patch.status as string | undefined)) {
    await rollForwardRecurringJob(supabase, params.id);
    await maybeSendReviewOnCompletion(supabase, job.status, patch.status as string, params.id);
  }

  return NextResponse.json({ job: updated });
}

function isOnBreak(breaks: BreakEntry[] | undefined): boolean {
  if (!breaks?.length) return false;
  const last = breaks[breaks.length - 1];
  return !!last?.start && !last.end;
}

function closeOpenBreak(breaks: BreakEntry[] | undefined, nowIso: string): BreakEntry[] {
  if (!breaks?.length) return [];
  if (!isOnBreak(breaks)) return breaks;
  return [
    ...breaks.slice(0, -1),
    { ...breaks[breaks.length - 1], end: nowIso },
  ];
}

// Job auto-completes when EVERY assigned worker has at least one
// session AND every session across the whole log has an `end`. An
// open session anywhere means the job is still active.
function isJobFullyClockedOut(log: TimeLog, assignedWorkerIds: string[]): boolean {
  if (assignedWorkerIds.length === 0) return false;
  for (const wid of assignedWorkerIds) {
    const sessions = sessionsOf(log[wid]);
    if (sessions.length === 0) return false;
    for (const s of sessions) {
      if (!s.start || !s.end) return false;
    }
  }
  return true;
}
