import { NextResponse } from "next/server";
import { requireApiWorker, requireSupabase } from "@/lib/api-auth";
import type { JobStatus } from "@/lib/types";

export const runtime = "nodejs";

// Clock in/out for the current worker on a job they're assigned to.
//   POST { action: "in" | "out" }
//
// time_log is keyed by worker uuid: `{ [worker_id]: { start, end } }`.
// Each worker's clock-in/out is tracked independently so payroll
// reflects who was actually there for how long.
//
// Status transitions:
//   - "in":  worker's entry gets start=now (idempotent if already in).
//            Job status moves to in_progress on the first clock-in.
//   - "out": worker's entry gets end=now (idempotent if already out).
//            Job status moves to "completed" only when ALL assigned
//            workers have clocked out — otherwise it stays in_progress
//            so a finished worker doesn't prematurely close the job
//            for a colleague still on site.
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
  if (action !== "in" && action !== "out") {
    return NextResponse.json({ error: "action must be 'in' or 'out'" }, { status: 400 });
  }

  // Authorisation via .contains() on the read.
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

  const fullLog = (job.time_log ?? {}) as Record<string, { start?: string; end?: string }>;
  const myEntry = fullLog[session.user.id] ?? {};
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {};

  if (action === "in") {
    if (myEntry.start && !myEntry.end) {
      // Already clocked in — return current state untouched.
      return NextResponse.json({ job, already_clocked_in: true });
    }
    const nextLog = { ...fullLog, [session.user.id]: { start: now } };
    patch.time_log = nextLog;
    if (job.status !== "in_progress" && job.status !== "completed") {
      patch.status = "in_progress" satisfies JobStatus;
    }
  } else {
    if (!myEntry.start) {
      return NextResponse.json({ error: "Cannot clock out — not clocked in." }, { status: 409 });
    }
    if (myEntry.end) {
      return NextResponse.json({ job, already_clocked_out: true });
    }
    const nextLog = { ...fullLog, [session.user.id]: { ...myEntry, end: now } };
    patch.time_log = nextLog;

    // Only flip the job to "completed" once every assigned worker has
    // clocked out. A worker finishing first shouldn't close the job
    // for a colleague who's still on site.
    const allOut = (job.assigned_worker_ids ?? []).every((wid: string) => {
      const e = nextLog[wid];
      return !!e?.start && !!e?.end;
    });
    if (allOut) {
      patch.status = "completed" satisfies JobStatus;
    }
  }

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
  return NextResponse.json({ job: updated });
}
