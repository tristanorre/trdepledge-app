import { NextResponse } from "next/server";
import { requireApiWorker, requireSupabase } from "@/lib/api-auth";

export const runtime = "nodejs";

// POST { add_minutes: number }
//
// Adds (or subtracts, if negative) waiting time to the job. Per spec,
// increments are 5 minutes; we enforce that here as `% 5 === 0`.
// Negative values are allowed for corrections, but the running total
// can never go below zero.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireApiWorker();
  if (auth instanceof NextResponse) return auth;
  const { session } = auth;

  const supabase = requireSupabase();
  if (supabase instanceof NextResponse) return supabase;

  let body: { add_minutes?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const add = Number(body.add_minutes);
  if (!Number.isInteger(add) || add === 0 || Math.abs(add) % 5 !== 0) {
    return NextResponse.json({ error: "add_minutes must be a non-zero multiple of 5" }, { status: 400 });
  }

  const { data: job, error: readErr } = await supabase
    .from("jobs")
    .select("waiting_time_minutes")
    .eq("id", params.id)
    .contains("assigned_worker_ids", [session.user.id])
    .maybeSingle();

  if (readErr || !job) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const next = Math.max(0, (job.waiting_time_minutes ?? 0) + add);

  const { data, error } = await supabase
    .from("jobs")
    .update({ waiting_time_minutes: next })
    .eq("id", params.id)
    .contains("assigned_worker_ids", [session.user.id])
    .select("waiting_time_minutes")
    .single();

  if (error) {
    console.error("[worker waiting-time]", error);
    return NextResponse.json({ error: "Could not update" }, { status: 500 });
  }
  return NextResponse.json({ waiting_time_minutes: data.waiting_time_minutes });
}
