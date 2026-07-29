import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireApiAdmin, requireSupabase } from "@/lib/api-auth";
import type { JobStatus } from "@/lib/types";
import type { SessionEntry, TimeLog } from "@/lib/cost";
import { sessionsOf } from "@/lib/cost";
import { checkWeeklyMilestones } from "@/lib/milestones";
import { rollForwardRecurringJob, justCompleted } from "@/lib/recurring-jobs";
import { maybeSendReviewOnCompletion } from "@/lib/reviews";

export const runtime = "nodejs";

// PATCH /api/admin/jobs/[id]/time
//
// Lets Thomas replace a single worker's sessions on a job. Workers
// can have multiple sessions now — they might clock in, leave for
// another job, come back and clock in again — so this endpoint
// operates on the WHOLE sessions array in one call. Simpler and
// atomic: no session-index bookkeeping between client and server.
//
// Body shape:
//   {
//     worker_id: string,
//     sessions: Array<{
//       start: string,          // ISO
//       end:   string | null,   // ISO, or null for still-open session
//       breaks?: Array<{ start: string, end: string | null }>
//     }> | null
//   }
//
//   - `sessions: null` (or `[]`) removes the worker's entry entirely.
//   - Each session's end (if present) must be after its start.
//   - Sessions must not overlap each other for the same worker
//     (would double-count on billing + payroll).
//   - Each break must sit inside its enclosing session (best-effort
//     validation — we reject obvious violations).
//
// Status auto-roll: completed iff every assigned worker has ≥1
// session AND every session has both start AND end. Otherwise
// in_progress. Re-opens a completed job if an edit reveals an open
// session.

type Ctx = { params: { id: string } };

type BreakInput = { start: string; end?: string | null };
type SessionInput = { start: string; end: string | null; breaks?: BreakInput[] };
type Patch = {
  worker_id: string;
  sessions: SessionEntry[] | null;
};

function parsePatch(raw: unknown): Patch | { error: string } {
  if (!raw || typeof raw !== "object") return { error: "Invalid payload" };
  const body = raw as Record<string, unknown>;

  const worker_id = String(body.worker_id ?? "").trim();
  if (!worker_id) return { error: "worker_id required" };

  const rawSessions = body.sessions;
  if (rawSessions === null || rawSessions === undefined) {
    return { worker_id, sessions: null };
  }
  if (!Array.isArray(rawSessions)) {
    return { error: "sessions must be an array" };
  }

  const parsedSessions: SessionEntry[] = [];
  for (let i = 0; i < rawSessions.length; i++) {
    const raw = rawSessions[i];
    if (!raw || typeof raw !== "object") return { error: `session ${i + 1} invalid` };
    const s = raw as SessionInput;

    const startStr = s.start ? String(s.start) : "";
    if (!startStr || Number.isNaN(Date.parse(startStr))) {
      return { error: `session ${i + 1}: start is not a valid date` };
    }
    const endStr = s.end == null || s.end === "" ? null : String(s.end);
    if (endStr && Number.isNaN(Date.parse(endStr))) {
      return { error: `session ${i + 1}: end is not a valid date` };
    }
    if (endStr && Date.parse(endStr) <= Date.parse(startStr)) {
      return { error: `session ${i + 1}: end must be after start` };
    }

    const entry: SessionEntry = { start: new Date(startStr).toISOString() };
    if (endStr) entry.end = new Date(endStr).toISOString();

    if (Array.isArray(s.breaks)) {
      const breaks: Array<{ start: string; end?: string }> = [];
      for (let j = 0; j < s.breaks.length; j++) {
        const rb = s.breaks[j];
        if (!rb || typeof rb !== "object") return { error: `session ${i + 1} break ${j + 1} invalid` };
        const b = rb as BreakInput;
        const bs = b.start ? String(b.start) : "";
        if (!bs || Number.isNaN(Date.parse(bs))) {
          return { error: `session ${i + 1} break ${j + 1}: start is not a valid date` };
        }
        const be = b.end == null || b.end === "" ? null : String(b.end);
        if (be && Number.isNaN(Date.parse(be))) {
          return { error: `session ${i + 1} break ${j + 1}: end is not a valid date` };
        }
        if (be && Date.parse(be) <= Date.parse(bs)) {
          return { error: `session ${i + 1} break ${j + 1}: end must be after start` };
        }
        // Break must sit inside the enclosing session.
        if (Date.parse(bs) < Date.parse(startStr)) {
          return { error: `session ${i + 1} break ${j + 1}: starts before its session` };
        }
        if (endStr && be && Date.parse(be) > Date.parse(endStr)) {
          return { error: `session ${i + 1} break ${j + 1}: ends after its session` };
        }
        const outB: { start: string; end?: string } = { start: new Date(bs).toISOString() };
        if (be) outB.end = new Date(be).toISOString();
        breaks.push(outB);
      }
      if (breaks.length > 0) entry.breaks = breaks;
    }

    parsedSessions.push(entry);
  }

  // Reject overlaps between sessions (would double-count billable
  // minutes). Sort by start to make the check O(n).
  const sorted = [...parsedSessions]
    .map((s, i) => ({ i, start: Date.parse(s.start!), end: s.end ? Date.parse(s.end) : Number.POSITIVE_INFINITY }))
    .sort((a, b) => a.start - b.start);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].start < sorted[i - 1].end) {
      return { error: `sessions overlap (session ${sorted[i - 1].i + 1} and ${sorted[i].i + 1})` };
    }
  }

  return {
    worker_id,
    sessions: parsedSessions.length === 0 ? null : parsedSessions,
  };
}

export async function PATCH(req: Request, { params }: Ctx) {
  const auth = await requireApiAdmin();
  if (auth instanceof NextResponse) return auth;

  const supabase = requireSupabase();
  if (supabase instanceof NextResponse) return supabase;

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = parsePatch(body);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { worker_id, sessions } = parsed;

  const { data: job, error: loadErr } = await supabase
    .from("jobs")
    .select("id, status, time_log, assigned_worker_ids")
    .eq("id", params.id)
    .maybeSingle();

  if (loadErr) {
    console.error("[admin time edit] load", loadErr);
    return NextResponse.json({ error: "Could not load job" }, { status: 500 });
  }
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const assigned: string[] = Array.isArray(job.assigned_worker_ids) ? job.assigned_worker_ids : [];
  if (!assigned.includes(worker_id)) {
    return NextResponse.json({ error: "Worker is not assigned to this job" }, { status: 400 });
  }

  const fullLog = (job.time_log ?? {}) as TimeLog;
  const nextLog: TimeLog = { ...fullLog };
  if (sessions === null) {
    delete nextLog[worker_id];
  } else {
    nextLog[worker_id] = sessions;
  }

  // Status auto-roll: completed iff every assigned worker has ≥1
  // session AND every session across the whole log is closed. Any
  // open session anywhere means the job is still in progress.
  const allClosed = assigned.length > 0 && assigned.every((wid) => {
    const wSessions = sessionsOf(nextLog[wid]);
    if (wSessions.length === 0) return false;
    return wSessions.every((s) => !!s.start && !!s.end);
  });

  const patch: Record<string, unknown> = { time_log: nextLog };
  if (allClosed && job.status !== "completed") {
    patch.status = "completed" satisfies JobStatus;
  } else if (!allClosed && job.status === "completed") {
    patch.status = "in_progress" satisfies JobStatus;
  }

  const { data: updated, error: updateErr } = await supabase
    .from("jobs")
    .update(patch)
    .eq("id", params.id)
    .select("*")
    .single();

  if (updateErr) {
    console.error("[admin time edit] update", updateErr);
    return NextResponse.json({ error: "Could not update job" }, { status: 500 });
  }

  await checkWeeklyMilestones(supabase, worker_id);

  // Downstream completion side-effects — same guards as the worker
  // clock route. Roll-forward is idempotent per (client, date); the
  // review helper skips if a request has already been sent for this
  // job (so re-completion via a multi-session flip-flop doesn't
  // spam the client).
  if (justCompleted(job.status, patch.status as string | undefined)) {
    await rollForwardRecurringJob(supabase, params.id);
    await maybeSendReviewOnCompletion(supabase, job.status, patch.status as string, params.id);
  }

  revalidatePath(`/admin/jobs/${params.id}`);
  return NextResponse.json({ job: updated });
}
