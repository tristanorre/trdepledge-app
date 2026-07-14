import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireApiAdmin, requireSupabase } from "@/lib/api-auth";
import { PHOTOS_BUCKET } from "@/lib/storage";

export const runtime = "nodejs";

// Admin-only. Standalone gallery uploads — photos added by Thomas
// directly (usually from his phone) that aren't tied to any job.
// Path shape: standalone/<uuid>.<ext>  (kept flat; kind lives in the
// standalone_photos row, not the path).

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/jpeg", "image/png", "image/webp",
  "image/heic", "image/heif",
]);

// POST multipart/form-data: { kind: "before" | "after", file: <image> }
// Creates the storage object and a standalone_photos row. The photo
// doesn't appear on /gallery until it's Featured — same flow as job
// photos.
export async function POST(req: Request) {
  const auth = await requireApiAdmin();
  if (auth instanceof NextResponse) return auth;
  const { session } = auth;

  const supabase = requireSupabase();
  if (supabase instanceof NextResponse) return supabase;

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Invalid form data" }, { status: 400 });

  const kind = form.get("kind");
  if (kind !== "before" && kind !== "after") {
    return NextResponse.json({ error: "kind must be 'before' or 'after'" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (max 5MB)" }, { status: 413 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: "Unsupported file type" }, { status: 415 });
  }

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const filename = `${crypto.randomUUID()}.${ext}`;
  const path = `standalone/${filename}`;

  const buf = Buffer.from(await file.arrayBuffer());
  const { error: uploadErr } = await supabase.storage
    .from(PHOTOS_BUCKET)
    .upload(path, buf, { contentType: file.type, upsert: false });

  if (uploadErr) {
    console.error("[gallery-uploads POST] upload", uploadErr);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }

  const { error: insertErr } = await supabase
    .from("standalone_photos")
    .insert({ storage_path: path, kind, uploaded_by: session.user.id });

  if (insertErr) {
    console.error("[gallery-uploads POST] insert", insertErr);
    // Roll back the orphan upload — best effort.
    await supabase.storage.from(PHOTOS_BUCKET).remove([path]).catch(() => {});
    return NextResponse.json({ error: "Could not save photo reference" }, { status: 500 });
  }

  revalidatePath("/admin/photos");
  return NextResponse.json({ path }, { status: 201 });
}

// DELETE /api/admin/gallery-uploads?path=<storage_path>
// Fully removes a standalone photo — from storage, from
// standalone_photos, and from featured_photos if it was featured.
// Use with care: unlike Unfeature, this cannot be undone.
export async function DELETE(req: Request) {
  const auth = await requireApiAdmin();
  if (auth instanceof NextResponse) return auth;

  const supabase = requireSupabase();
  if (supabase instanceof NextResponse) return supabase;

  const url = new URL(req.url);
  const path = url.searchParams.get("path") ?? "";
  if (!path) return NextResponse.json({ error: "path required" }, { status: 400 });
  // Only allow deleting under standalone/ — this endpoint must not be
  // used to nuke job photos.
  if (!path.startsWith("standalone/")) {
    return NextResponse.json({ error: "Not a standalone upload" }, { status: 400 });
  }

  const [{ error: featErr }, { error: rowErr }, storageRes] = await Promise.all([
    supabase.from("featured_photos").delete().eq("storage_path", path),
    supabase.from("standalone_photos").delete().eq("storage_path", path),
    supabase.storage.from(PHOTOS_BUCKET).remove([path]).catch((e) => ({ error: e })),
  ]);

  if (featErr || rowErr) {
    console.error("[gallery-uploads DELETE]", featErr ?? rowErr);
    return NextResponse.json({ error: "Could not delete photo" }, { status: 500 });
  }
  if ("error" in storageRes && storageRes.error) {
    console.error("[gallery-uploads DELETE] storage", storageRes.error);
    // Row is already gone; the orphan blob will time out of the bucket
    // eventually. Don't fail the request for this.
  }

  revalidatePath("/admin/photos");
  revalidatePath("/gallery");
  return NextResponse.json({ ok: true });
}
