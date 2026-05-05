import { NextResponse } from "next/server";
import { requireApiWorker, requireSupabase } from "@/lib/api-auth";

export const runtime = "nodejs";

// Worker job detail. Returns 404 (not 403) for jobs the worker isn't
// assigned to — we don't want to leak whether a job exists at all.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireApiWorker();
  if (auth instanceof NextResponse) return auth;
  const { session } = auth;

  const supabase = requireSupabase();
  if (supabase instanceof NextResponse) return supabase;

  const { data, error } = await supabase
    .from("jobs")
    .select("*")
    .eq("id", params.id)
    .contains("assigned_worker_ids", [session.user.id])
    .maybeSingle();

  if (error) {
    console.error("[worker/jobs/:id GET]", error);
    return NextResponse.json({ error: "Could not load job" }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ job: data });
}
