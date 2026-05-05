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

  // Read-modify-write — fine at our scale (1 admin, ~handful of workers
  // editing the same job is rare). If contention shows up later, a
  // server-side jsonb_array_append RPC removes the round trip.
  const { data: existing, error: readErr } = await supabase
    .from("jobs")
    .select("notes")
    .eq("id", params.id)
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
    .select("notes")
    .single();

  if (error) {
    console.error("[admin/jobs/:id/notes POST]", error);
    return NextResponse.json({ error: "Could not append note" }, { status: 500 });
  }
  return NextResponse.json({ notes: data.notes }, { status: 201 });
}
