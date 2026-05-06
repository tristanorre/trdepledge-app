import { NextResponse } from "next/server";
import { requireApiAdmin, requireSupabase } from "@/lib/api-auth";
import type { JobNote } from "@/lib/types";

export const runtime = "nodejs";

// POST appends a note to jobs.notes (jsonb array). Notes are append-only
// from the UI — no edit/delete endpoint. If a note needs to be retracted,
// add a follow-up note clarifying it.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireApiAdmin();
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

  // Atomic append via RPC — see migration 0014 for why. Closes a
  // read-modify-write race + applies a 200-note cap server-side.
  const { data: ok, error: rpcErr } = await supabase.rpc("append_job_note", {
    p_job_id: params.id,
    p_note: note,
    p_worker_id: null, // admin path, no scope filter
  });

  if (rpcErr || !ok) {
    console.error("[admin/jobs/:id/notes POST]", rpcErr ?? "row not updated");
    return NextResponse.json(
      { error: rpcErr ? "Could not append note" : "Job not found or note cap reached" },
      { status: rpcErr ? 500 : 409 },
    );
  }

  // Re-read so the response carries the canonical notes array (the
  // alternative is to assume our append is the latest, but a concurrent
  // worker note could have landed in between).
  const { data: fresh } = await supabase
    .from("jobs")
    .select("notes")
    .eq("id", params.id)
    .single();

  return NextResponse.json({ notes: fresh?.notes ?? [] }, { status: 201 });
}
