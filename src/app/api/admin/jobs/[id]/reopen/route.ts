import { NextResponse } from "next/server";
import { requireApiAdmin, requireSupabase } from "@/lib/api-auth";

export const runtime = "nodejs";

// POST /api/admin/jobs/[id]/reopen
//
// Undoes a worker's clock-out: clears time_log.end and flips status
// back to in_progress. Useful when a worker mistapped "Clock out".
// Admin-only — workers don't get to undo their own seal, that's the
// whole point of having an admin override.
//
// We deliberately don't touch invoice_sent or xero_invoice_id. If an
// invoice has been sent to Xero and the job needs to be reopened,
// that's a billing-correction conversation Thomas owns separately.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireApiAdmin();
  if (auth instanceof NextResponse) return auth;

  const supabase = requireSupabase();
  if (supabase instanceof NextResponse) return supabase;

  const { data: job, error: readErr } = await supabase
    .from("jobs")
    .select("id, status, time_log")
    .eq("id", params.id)
    .maybeSingle();

  if (readErr || !job) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (job.status !== "completed") {
    return NextResponse.json({
      error: "Only completed jobs can be reopened.",
    }, { status: 400 });
  }

  const log = (job.time_log ?? {}) as { start?: string; end?: string };
  const nextLog: { start?: string } = log.start ? { start: log.start } : {};

  const { data, error } = await supabase
    .from("jobs")
    .update({ status: "in_progress", time_log: nextLog })
    .eq("id", params.id)
    .select("id, status, time_log")
    .single();

  if (error) {
    console.error("[admin/jobs reopen]", error);
    return NextResponse.json({ error: "Could not reopen" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, job: data });
}
