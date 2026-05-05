import { NextResponse } from "next/server";
import { requireApiWorker, requireSupabase } from "@/lib/api-auth";
import type { JobStatus } from "@/lib/types";

export const runtime = "nodejs";

// Clock in/out for the current worker on a job they're assigned to.
//   POST { action: "in" | "out" }
//
// Behaviour per spec:
//   - "in":  start = now, status -> in_progress (if not already)
//           Idempotent re-entry (already started) is a no-op success so
//           a network retry doesn't lose the original timestamp.
//   - "out": end = now, status -> completed
//           Requires a prior "in"; otherwise 409.
//
// time_log shape: { start: ISO, end?: ISO }. Single pair per spec.
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
    .select("id, status, time_log")
    .eq("id", params.id)
    .contains("assigned_worker_ids", [session.user.id])
    .maybeSingle();

  if (readErr) {
    console.error("[worker clock]", readErr);
    return NextResponse.json({ error: "Could not load job" }, { status: 500 });
  }
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const log = (job.time_log ?? {}) as { start?: string; end?: string };
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {};

  if (action === "in") {
    if (log.start && !log.end) {
      // Already clocked in — return current state untouched.
      return NextResponse.json({ job, already_clocked_in: true });
    }
    patch.time_log = { start: now };
    if (job.status !== "in_progress" && job.status !== "completed") {
      patch.status = "in_progress" satisfies JobStatus;
    }
  } else {
    if (!log.start) {
      return NextResponse.json({ error: "Cannot clock out — not clocked in." }, { status: 409 });
    }
    if (log.end) {
      // Already clocked out — surface but don't error.
      return NextResponse.json({ job, already_clocked_out: true });
    }
    patch.time_log = { ...log, end: now };
    patch.status = "completed" satisfies JobStatus;
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
