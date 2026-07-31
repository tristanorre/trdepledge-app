import { NextResponse } from "next/server";

import { requireApiAdmin, requireSupabase } from "@/lib/api-auth";
import { HIRE_PHOTOS_BUCKET } from "@/lib/storage";

export const runtime = "nodejs";

// POST   /api/admin/hire/equipment/[id]/photo   multipart, field "file"
// DELETE /api/admin/hire/equipment/[id]/photo   no body
//
// One photo per item. Uploading replaces whatever was there; the old blob
// is deleted only AFTER the new one is safely in place, so a failed upload
// can never leave an item with no photo at all.
//
// The bucket is public (migration 0034) because these are product shots on
// a public page — but writing to it still requires an admin session and
// goes through the service-role key. Never accept a direct browser upload.
//
// Path convention: equipment/<equipment-id>/<timestamp>.<ext>

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB — a modern phone photo is 3–8 MB
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

function extFor(mime: string): string {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "bin";
}

/** A seeded photo lives in public/, not the bucket — never try to delete those. */
function isStorageKey(path: string | null): path is string {
  return !!path && !path.startsWith("/") && !path.startsWith("http");
}

type Ctx = { params: { id: string } };

export async function POST(req: Request, { params }: Ctx) {
  const auth = await requireApiAdmin();
  if (auth instanceof NextResponse) return auth;

  const supabase = requireSupabase();
  if (supabase instanceof NextResponse) return supabase;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "That upload didn't come through. Try again." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Pick a photo to upload." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `That photo is over ${MAX_BYTES / 1024 / 1024} MB. Try a smaller one.` },
      { status: 413 },
    );
  }
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json(
      { error: "That file isn't a photo — use a JPG, PNG or WebP." },
      { status: 415 },
    );
  }

  try {
    const { data: existing, error: loadErr } = await supabase
      .from("equipment")
      .select("id, photo_path")
      .eq("id", params.id)
      .is("deleted_at", null)
      .maybeSingle();

    if (loadErr) {
      console.error("[hire photo upload] load", loadErr);
      return NextResponse.json({ error: "That didn't save. Try again." }, { status: 500 });
    }
    if (!existing) {
      return NextResponse.json({ error: "That item isn't on the books." }, { status: 404 });
    }

    const key = `equipment/${params.id}/${Date.now()}.${extFor(file.type)}`;

    const { error: upErr } = await supabase.storage
      .from(HIRE_PHOTOS_BUCKET)
      .upload(key, file, { contentType: file.type, upsert: false });

    if (upErr) {
      console.error("[hire photo upload] upload", upErr);
      return NextResponse.json(
        {
          error:
            "The photo didn't upload. If this keeps happening the storage bucket may not be set up yet.",
        },
        { status: 500 },
      );
    }

    const { error: saveErr } = await supabase
      .from("equipment")
      .update({ photo_path: key })
      .eq("id", params.id);

    if (saveErr) {
      // Don't strand the blob we just wrote if the row update failed.
      await supabase.storage.from(HIRE_PHOTOS_BUCKET).remove([key]);
      console.error("[hire photo upload] save", saveErr);
      return NextResponse.json({ error: "That didn't save. Try again." }, { status: 500 });
    }

    // Old file goes only once the new one is committed. A failure here
    // leaves an orphan blob, which is untidy but harmless — far better
    // than deleting first and losing the photo if the upload fails.
    if (isStorageKey(existing.photo_path) && existing.photo_path !== key) {
      await supabase.storage.from(HIRE_PHOTOS_BUCKET).remove([existing.photo_path]);
    }

    return NextResponse.json({ ok: true, photoPath: key });
  } catch (err) {
    console.error("[hire photo upload] unexpected", err);
    return NextResponse.json({ error: "That didn't save. Try again." }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const auth = await requireApiAdmin();
  if (auth instanceof NextResponse) return auth;

  const supabase = requireSupabase();
  if (supabase instanceof NextResponse) return supabase;

  try {
    const { data: existing, error: loadErr } = await supabase
      .from("equipment")
      .select("id, photo_path")
      .eq("id", params.id)
      .is("deleted_at", null)
      .maybeSingle();

    if (loadErr) {
      console.error("[hire photo delete] load", loadErr);
      return NextResponse.json({ error: "That didn't save. Try again." }, { status: 500 });
    }
    if (!existing) {
      return NextResponse.json({ error: "That item isn't on the books." }, { status: 404 });
    }

    const { error: clearErr } = await supabase
      .from("equipment")
      .update({ photo_path: null })
      .eq("id", params.id);

    if (clearErr) {
      console.error("[hire photo delete] clear", clearErr);
      return NextResponse.json({ error: "That didn't save. Try again." }, { status: 500 });
    }

    if (isStorageKey(existing.photo_path)) {
      await supabase.storage.from(HIRE_PHOTOS_BUCKET).remove([existing.photo_path]);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[hire photo delete] unexpected", err);
    return NextResponse.json({ error: "That didn't save. Try again." }, { status: 500 });
  }
}
