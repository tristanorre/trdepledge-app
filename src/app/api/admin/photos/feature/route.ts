import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireApiAdmin, requireSupabase } from "@/lib/api-auth";

export const runtime = "nodejs";

// POST /api/admin/photos/feature
//   Body: { job_id: string | null, kind: "before" | "after", storage_path, caption? }
// Adds a photo to the marketing gallery. Idempotent via the
// storage_path unique constraint — a repeat call for the same path
// silently succeeds (the row already exists).
//
// job_id is nullable — standalone uploads (from /admin/photos upload
// widget) have no owning job. Featured_photos.job_id was made nullable
// in migration 0029.
export async function POST(req: Request) {
  const auth = await requireApiAdmin();
  if (auth instanceof NextResponse) return auth;
  const { session } = auth;

  const supabase = requireSupabase();
  if (supabase instanceof NextResponse) return supabase;

  let body: {
    job_id?: unknown;
    kind?: unknown;
    storage_path?: unknown;
    caption?: unknown;
  };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const rawJobId = body.job_id;
  const job_id: string | null =
    rawJobId === null || rawJobId === undefined || rawJobId === ""
      ? null
      : String(rawJobId);
  const kind = String(body.kind ?? "");
  const storage_path = String(body.storage_path ?? "");
  const caption = body.caption ? String(body.caption).trim().slice(0, 200) : null;

  if (job_id !== null && !/^[0-9a-f-]{36}$/i.test(job_id)) {
    return NextResponse.json({ error: "job_id must be a uuid or null" }, { status: 400 });
  }
  if (kind !== "before" && kind !== "after") {
    return NextResponse.json({ error: "kind must be 'before' or 'after'" }, { status: 400 });
  }
  if (!storage_path) {
    return NextResponse.json({ error: "storage_path required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("featured_photos")
    .upsert(
      { job_id, kind, storage_path, caption, featured_by: session.user.id },
      { onConflict: "storage_path" },
    );

  if (error) {
    console.error("[photos/feature POST]", error);
    return NextResponse.json({ error: "Could not feature photo" }, { status: 500 });
  }

  // Bust the SSR cache on the marketing gallery + the admin curator
  // so the change shows on the next request without a manual reload.
  revalidatePath("/gallery");
  revalidatePath("/admin/photos");
  return NextResponse.json({ ok: true });
}

// DELETE /api/admin/photos/feature?path=<storage_path>
// Removes a photo from the marketing gallery. The photo itself stays
// on the job — this only affects the curated list.
export async function DELETE(req: Request) {
  const auth = await requireApiAdmin();
  if (auth instanceof NextResponse) return auth;

  const supabase = requireSupabase();
  if (supabase instanceof NextResponse) return supabase;

  const url = new URL(req.url);
  const path = url.searchParams.get("path") ?? "";
  if (!path) return NextResponse.json({ error: "path required" }, { status: 400 });

  const { error } = await supabase
    .from("featured_photos")
    .delete()
    .eq("storage_path", path);
  if (error) {
    console.error("[photos/feature DELETE]", error);
    return NextResponse.json({ error: "Could not unfeature photo" }, { status: 500 });
  }

  revalidatePath("/gallery");
  revalidatePath("/admin/photos");
  return NextResponse.json({ ok: true });
}
