import { NextResponse } from "next/server";

import { requireApiAdmin, requireSupabase } from "@/lib/api-auth";
import { HIRE_PHOTOS_BUCKET } from "@/lib/storage";

/**
 * Upload / replace / remove one image column on an equipment row.
 *
 * Two things hang off an item and behave identically: the card photo and the
 * flyer. Both are a single image, both live in the same public bucket, both
 * must survive a failed upload, and both can point either at a file in
 * `public/` (the seeded set) or at a bucket key (anything Thomas uploads).
 *
 * They were one route and one hard-coded column until the flyer needed the
 * same treatment. Copying it would have meant two places to get the
 * delete-after-commit ordering right, so the ordering lives here once and the
 * routes are the thin part.
 *
 * The bucket is public (migration 0034) because these are product shots and
 * spec sheets on a public page — but WRITING to it still requires an admin
 * session and goes through the service-role key. Never accept a direct
 * browser upload.
 *
 * Path convention: equipment/<equipment-id>/<kind>-<timestamp>.<ext>
 */

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB — a modern phone photo is 3–8 MB
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

export type ImageKind = "photo" | "flyer";

type Spec = {
  /** The column on `equipment` this image is stored in. */
  column: "photo_path" | "flyer_path";
  /** The key the JSON response returns the new path under. */
  field: "photoPath" | "flyerPath";
  /** What to call it when something goes wrong, in Thomas's words. */
  noun: string;
};

const SPEC: Record<ImageKind, Spec> = {
  photo: { column: "photo_path", field: "photoPath", noun: "photo" },
  flyer: { column: "flyer_path", field: "flyerPath", noun: "flyer" },
};

function extFor(mime: string): string {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "bin";
}

/**
 * A seeded image lives in public/, not the bucket — never try to delete those.
 *
 * This is what stops "replace the flyer" from attempting to unlink
 * /hire/flyer-lawn-mower.webp, which is a file in the repo and not ours to
 * remove at runtime.
 */
function isStorageKey(path: string | null): path is string {
  return !!path && !path.startsWith("/") && !path.startsWith("http");
}

export async function uploadEquipmentImage(
  req: Request,
  equipmentId: string,
  kind: ImageKind,
): Promise<NextResponse> {
  const spec = SPEC[kind];

  const auth = await requireApiAdmin();
  if (auth instanceof NextResponse) return auth;

  const supabase = requireSupabase();
  if (supabase instanceof NextResponse) return supabase;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "That upload didn't come through. Try again." },
      { status: 400 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: `Pick a ${spec.noun} to upload.` }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `That ${spec.noun} is over ${MAX_BYTES / 1024 / 1024} MB. Try a smaller one.` },
      { status: 413 },
    );
  }
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json(
      { error: `That file isn't an image — use a JPG, PNG or WebP.` },
      { status: 415 },
    );
  }

  try {
    const { data: existing, error: loadErr } = await supabase
      .from("equipment")
      .select(`id, ${spec.column}`)
      .eq("id", equipmentId)
      .is("deleted_at", null)
      .maybeSingle();

    if (loadErr) {
      console.error(`[hire ${kind} upload] load`, loadErr);
      return NextResponse.json({ error: "That didn't save. Try again." }, { status: 500 });
    }
    if (!existing) {
      return NextResponse.json({ error: "That item isn't on the books." }, { status: 404 });
    }

    const previous = (existing as Record<string, unknown>)[spec.column] as string | null;
    const key = `equipment/${equipmentId}/${kind}-${Date.now()}.${extFor(file.type)}`;

    const { error: upErr } = await supabase.storage
      .from(HIRE_PHOTOS_BUCKET)
      .upload(key, file, { contentType: file.type, upsert: false });

    if (upErr) {
      console.error(`[hire ${kind} upload] upload`, upErr);
      return NextResponse.json(
        {
          error: `The ${spec.noun} didn't upload. If this keeps happening the storage bucket may not be set up yet.`,
        },
        { status: 500 },
      );
    }

    const { error: saveErr } = await supabase
      .from("equipment")
      .update({ [spec.column]: key })
      .eq("id", equipmentId);

    if (saveErr) {
      // Don't strand the blob we just wrote if the row update failed.
      await supabase.storage.from(HIRE_PHOTOS_BUCKET).remove([key]);
      console.error(`[hire ${kind} upload] save`, saveErr);
      return NextResponse.json({ error: "That didn't save. Try again." }, { status: 500 });
    }

    // Old file goes only once the new one is committed. A failure here
    // leaves an orphan blob, which is untidy but harmless — far better
    // than deleting first and losing the image if the upload fails.
    if (isStorageKey(previous) && previous !== key) {
      await supabase.storage.from(HIRE_PHOTOS_BUCKET).remove([previous]);
    }

    return NextResponse.json({ ok: true, [spec.field]: key });
  } catch (err) {
    console.error(`[hire ${kind} upload] unexpected`, err);
    return NextResponse.json({ error: "That didn't save. Try again." }, { status: 500 });
  }
}

export async function deleteEquipmentImage(
  equipmentId: string,
  kind: ImageKind,
): Promise<NextResponse> {
  const spec = SPEC[kind];

  const auth = await requireApiAdmin();
  if (auth instanceof NextResponse) return auth;

  const supabase = requireSupabase();
  if (supabase instanceof NextResponse) return supabase;

  try {
    const { data: existing, error: loadErr } = await supabase
      .from("equipment")
      .select(`id, ${spec.column}`)
      .eq("id", equipmentId)
      .is("deleted_at", null)
      .maybeSingle();

    if (loadErr) {
      console.error(`[hire ${kind} delete] load`, loadErr);
      return NextResponse.json({ error: "That didn't save. Try again." }, { status: 500 });
    }
    if (!existing) {
      return NextResponse.json({ error: "That item isn't on the books." }, { status: 404 });
    }

    const previous = (existing as Record<string, unknown>)[spec.column] as string | null;

    const { error: clearErr } = await supabase
      .from("equipment")
      .update({ [spec.column]: null })
      .eq("id", equipmentId);

    if (clearErr) {
      console.error(`[hire ${kind} delete] clear`, clearErr);
      return NextResponse.json({ error: "That didn't save. Try again." }, { status: 500 });
    }

    if (isStorageKey(previous)) {
      await supabase.storage.from(HIRE_PHOTOS_BUCKET).remove([previous]);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(`[hire ${kind} delete] unexpected`, err);
    return NextResponse.json({ error: "That didn't save. Try again." }, { status: 500 });
  }
}
