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

  const { data: existing, error: readErr } = await supabase
    .from("jobs")
    .select("notes")
    .eq("id", params.id)
    .contains("assigned_worker_ids", [session.user.id])
    .maybeSingle();

  if (readErr || !existing) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const note: JobNote = {
    author_id: session.user.id,
    author_name: session.user.name,
    text,
    timestamp: new Date().toISOString(),
  };
  const next = Array.isArray(existing.notes) ? [...existing.notes, note] : [note];

  const { data, error } = await supabase
    .from("jobs")
    .update({ notes: next })
    .eq("id", params.id)
    .contains("assigned_worker_ids", [session.user.id])
    .select("notes")
    .single();

  if (error) {
    console.error("[worker/jobs/:id/notes POST]", error);
    return NextResponse.json({ error: "Could not append note" }, { status: 500 });
  }
  return NextResponse.json({ notes: data.notes }, { status: 201 });
}
