import { NextResponse } from "next/server";
import { requireApiWorker, requireSupabase } from "@/lib/api-auth";
import type { JobStatus } from "@/lib/types";
import type { BreakEntry, TimeEntry } from "@/lib/cost";

export const runtime = "nodejs";

// Clock in / out / break for the current worker on a job they're
// assigned to.
//
//   POST { action: "in" | "out" | "break-start" | "break-end" }
//
// time_log is keyed by worker uuid:
//   { [worker_id]: { start, end?, breaks?: [{ start, end? }, ...] } }
//
// Each worker tracks independently so payroll reflects who was
// actually there for how long, and break minutes get subtracted from
// billable time inside calculateCost().
//
// Status transitions:
//   - "in":           start = now (idempotent). Job → in_progress on
//                     the first clock-in.
//   - "out":          end = now (idempotent). Auto-completes the job
//                     once every assigned worker has both start AND end.
//                     Closes any open break first so net time is right.
//   - "break-start":  append { start: now } to the breaks array. No-op
//                     if the worker is already on break or not clocked
//                     in / already clocked out.
//   - "break-end":    set end on the latest open break. No-op if no
//                     open break exists.
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

  const fullLog = (job.time_log ?? {}) as Record<string, TimeEntry>;
  const myEntry: TimeEntry = fullLog[session.user.id] ?? {};
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {};

  if (action === "in") {
    if (myEntry.start && !myEntry.end) {
      return NextResponse.json({ job, already_clocked_in: true });
    }
    // Fresh clock-in clears any stale break list from a previous shift
    // — the entry effectively becomes a brand-new shift.
    const nextLog = { ...fullLog, [session.user.id]: { start: now, breaks: [] as BreakEntry[] } };
    patch.time_log = nextLog;
    if (job.status !== "in_progress" && job.status !== "completed") {
      patch.status = "in_progress" satisfies JobStatus;
    }
  } else if (action === "out") {
    if (!myEntry.start) {
      return NextResponse.json({ error: "Cannot clock out — not clocked in." }, { status: 409 });
    }
    if (myEntry.end) {
      return NextResponse.json({ job, already_clocked_out: true });
    }
    // If a break is still open, close it now so the net time
    // calculation isn't poisoned by a runaway open-break interval.
    const closedBreaks = closeOpenBreak(myEntry.breaks, now);
    const nextLog = {
      ...fullLog,
      [session.user.id]: { ...myEntry, breaks: closedBreaks, end: now },
    };
    patch.time_log = nextLog;

    const allOut = (job.assigned_worker_ids ?? []).every((wid: string) => {
      const e = nextLog[wid];
      return !!e?.start && !!e?.end;
    });
    if (allOut) {
      patch.status = "completed" satisfies JobStatus;
    }
  } else if (action === "break-start") {
    if (!myEntry.start || myEntry.end) {
      return NextResponse.json({
        error: "Cannot start a break — not currently clocked in.",
      }, { status: 409 });
    }
    if (isOnBreak(myEntry.breaks)) {
      return NextResponse.json({ job, already_on_break: true });
    }
    const nextBreaks: BreakEntry[] = [...(myEntry.breaks ?? []), { start: now }];
    patch.time_log = {
      ...fullLog,
      [session.user.id]: { ...myEntry, breaks: nextBreaks },
    };
  } else {
    // action === "break-end"
    if (!myEntry.start || myEntry.end) {
      return NextResponse.json({
        error: "Cannot end a break — not currently clocked in.",
      }, { status: 409 });
    }
    if (!isOnBreak(myEntry.breaks)) {
      return NextResponse.json({ job, not_on_break: true });
    }
    patch.time_log = {
      ...fullLog,
      [session.user.id]: { ...myEntry, breaks: closeOpenBreak(myEntry.breaks, now) },
    };
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
