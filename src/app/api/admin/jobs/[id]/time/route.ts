import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireApiAdmin, requireSupabase } from "@/lib/api-auth";
import type { JobStatus } from "@/lib/types";

export const runtime = "nodejs";

// PATCH /api/admin/jobs/[id]/time
//
// Lets Thomas edit a single worker's clock-in / clock-out times on a
// job. Workers occasionally forget to clock out; without this route
// the cost breakdown ticks up forever and the invoice is wrong.
//
// Body shape:
//   { worker_id: string, start: string | null, end: string | null }
//
//   - `start` and `end` are ISO timestamps (or null to clear). If both
//     are null/empty the worker's entry is removed entirely.
//   - end without start is rejected (a clocked-out-but-never-started
//     row makes no sense).
//   - end must be after start.
//   - worker_id must be in the job's assigned_worker_ids.
//
// On success, if the edit means every assigned worker now has both a
// start AND an end, the job auto-flips to "completed" (same rule as
// the worker clock-out endpoint). If the edit re-opens a closed
// worker (set end to null) on a previously-completed job, status
// rolls back to "in_progress".

type Ctx = { params: { id: string } };

type BreakInput = { start: string; end?: string | null };
type Patch = {
  worker_id: string;
  start: string | null;
  end: string | null;
  // Optional. When provided, replaces the worker's `breaks` array
  // wholesale. Omit to leave breaks unchanged.
  breaks: Array<{ start: string; end: string | null }> | undefined;
};

function parsePatch(raw: unknown): Patch | { error: string } {
  if (!raw || typeof raw !== "object") return { error: "Invalid payload" };
  const body = raw as Record<string, unknown>;

  const worker_id = String(body.worker_id ?? "").trim();
  if (!worker_id) return { error: "worker_id required" };

  const startRaw = body.start;
  const endRaw   = body.end;
  const start = startRaw == null || startRaw === "" ? null : String(startRaw);
  const end   = endRaw   == null || endRaw   === "" ? null : String(endRaw);

  if (start) {
    if (Number.isNaN(Date.parse(start))) return { error: "start is not a valid date" };
  }
  if (end) {
    if (Number.isNaN(Date.parse(end))) return { error: "end is not a valid date" };
  }
  if (end && !start) return { error: "Cannot set an end without a start" };
  if (start && end && Date.parse(end) <= Date.parse(start)) {
    return { error: "end must be after start" };
  }

  // Breaks: optional. If present, must be an array; each break has a
  // valid start and an optional end (null when the break is still
  // open). end must be after start when both set.
  let breaks: Patch["breaks"] = undefined;
  if (Array.isArray(body.breaks)) {
    const out: NonNullable<Patch["breaks"]> = [];
    for (const raw of body.breaks as unknown[]) {
      if (!raw || typeof raw !== "object") return { error: "break entry invalid" };
      const b = raw as BreakInput;
      const bs = b.start ? String(b.start) : "";
      if (!bs || Number.isNaN(Date.parse(bs))) return { error: "break start is not a valid date" };
      const be = b.end == null || b.end === "" ? null : String(b.end);
      if (be && Number.isNaN(Date.parse(be))) return { error: "break end is not a valid date" };
      if (be && Date.parse(be) <= Date.parse(bs)) {
        return { error: "break end must be after start" };
      }
      out.push({ start: bs, end: be });
    }
    breaks = out;
  }

  return { worker_id, start, end, breaks };
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
  const { worker_id, start, end, breaks } = parsed;

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

  type Break = { start: string; end?: string };
  type LogEntry = { start?: string; end?: string; breaks?: Break[] };
  const fullLog = (job.time_log ?? {}) as Record<string, LogEntry>;
  const existing = fullLog[worker_id] ?? {};

  // Build the patch.
  const nextLog: typeof fullLog = { ...fullLog };
  if (start === null && end === null && breaks === undefined) {
    // Clear the worker's entry entirely.
    delete nextLog[worker_id];
  } else if (start === null && end === null && breaks !== undefined) {
    // Caller passed only `breaks` — keep existing start/end, replace
    // breaks. Defensive against accidental wipe of an active shift.
    nextLog[worker_id] = {
      ...existing,
      breaks: normaliseBreaks(breaks),
    };
  } else {
    const entry: LogEntry = {};
    if (start) entry.start = new Date(start).toISOString();
    if (end)   entry.end   = new Date(end).toISOString();
    // If breaks weren't sent, preserve the existing list. If sent,
    // replace it.
    if (breaks !== undefined) entry.breaks = normaliseBreaks(breaks);
    else if (existing.breaks) entry.breaks = existing.breaks;
    nextLog[worker_id] = entry;
  }

  // Status auto-roll: completed iff every assigned worker has both
  // start AND end. If any assigned worker lacks an end (or has no
  // entry at all), the job is in_progress instead.
  const allClosed = assigned.length > 0 && assigned.every((wid) => {
    const e = nextLog[wid];
    return !!e?.start && !!e?.end;
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

  revalidatePath(`/admin/jobs/${params.id}`);
  return NextResponse.json({ job: updated });
}

// Normalise a parsed breaks array: drop the optional null on `end`
// so the stored shape matches what the worker clock route writes
// ({ start, end? }), and convert input strings to ISO UTC.
function normaliseBreaks(
  input: Array<{ start: string; end: string | null }>,
): Array<{ start: string; end?: string }> {
  return input.map((b) => {
    const out: { start: string; end?: string } = {
      start: new Date(b.start).toISOString(),
    };
    if (b.end) out.end = new Date(b.end).toISOString();
    return out;
  });
}
