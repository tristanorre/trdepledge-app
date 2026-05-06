import { NextResponse } from "next/server";
import { requireApiWorker, requireSupabase } from "@/lib/api-auth";
import type { JobNote } from "@/lib/types";

export const runtime = "nodejs";

// POST appends a note authored by the current worker. The .contains()
// authorisation check is in the read step — if the worker isn't on the
// job, we return 404 and don't write.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireApiWorker();
  if (auth instanceof NextResponse) return auth;
  const { session } = auth;

  const supabase = requireSupabase();
  if (supabase instanceof NextResponse) return supabase;

  let body: { text?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const text = String(body.text ?? "").trim();
  if (!text) return NextResponse.json({ error: "text is required" }, { status: 400 });
  if (text.length > 4000) return NextResponse.json({ error: "text too long" }, { status: 400 });

  const note: JobNote = {
    author_id: session.user.id,
    author_name: session.user.name,
    text,
    timestamp: new Date().toISOString(),
  };

  // Atomic append via RPC. The worker_id filter is enforced inside the
  // function — if the worker has been removed from the job since they
  // opened the page, the row update matches 0 and we return 404.
  const { data: ok, error: rpcErr } = await supabase.rpc("append_job_note", {
    p_job_id: params.id,
    p_note: note,
    p_worker_id: session.user.id,
  });

  if (rpcErr || !ok) {
    console.error("[worker/jobs/:id/notes POST]", rpcErr ?? "row not updated");
    return NextResponse.json(
      { error: rpcErr ? "Could not append note" : "Job not found or note cap reached" },
      { status: rpcErr ? 500 : 404 },
    );
  }

  const { data: fresh } = await supabase
    .from("jobs")
    .select("notes")
    .eq("id", params.id)
    .single();

  return NextResponse.json({ notes: fresh?.notes ?? [] }, { status: 201 });
}
