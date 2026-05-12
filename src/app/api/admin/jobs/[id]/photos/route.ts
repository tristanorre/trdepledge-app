import { NextResponse } from "next/server";
import { requireApiAdmin, requireSupabase } from "@/lib/api-auth";
import { PHOTOS_BUCKET } from "@/lib/storage";

export const runtime = "nodejs";

// DELETE { path: string, kind: "before" | "after" | "receipts" }
// Admin-only. Removes the file from Storage AND drops it from the
// jobs.photos_<kind> array. Worker-side deletion isn't supported — if a
// worker uploads a bad photo (or a receipt they meant for a different
// job), they ask Thomas to remove it.
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireApiAdmin();
  if (auth instanceof NextResponse) return auth;

  const supabase = requireSupabase();
  if (supabase instanceof NextResponse) return supabase;

  let body: { path?: unknown; kind?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const path = String(body.path ?? "");
  const kind = body.kind;
  if (!path) return NextResponse.json({ error: "path required" }, { status: 400 });
  if (kind !== "before" && kind !== "after" && kind !== "receipts") {
    return NextResponse.json({ error: "kind must be 'before', 'after', or 'receipts'" }, { status: 400 });
  }
  // Defence against path traversal — the path must be inside this job.
  const expectedPrefix = `jobs/${params.id}/${kind}/`;
  if (!path.startsWith(expectedPrefix)) {
    return NextResponse.json({ error: "Path does not belong to this job" }, { status: 400 });
  }

  const column =
    kind === "before" ? "photos_before"
    : kind === "after" ? "photos_after"
    : "photos_receipts";
  const { data: job, error: readErr } = await supabase
    .from("jobs")
    .select(column)
    .eq("id", params.id)
    .maybeSingle();

  if (readErr || !job) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const next = ((job as any)[column] ?? []).filter((p: string) => p !== path);

  const [{ error: updateErr }] = await Promise.all([
    supabase.from("jobs").update({ [column]: next }).eq("id", params.id),
    supabase.storage.from(PHOTOS_BUCKET).remove([path]).catch(() => null),
  ]);

  if (updateErr) {
    console.error("[admin photos DELETE]", updateErr);
    return NextResponse.json({ error: "Could not delete" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
