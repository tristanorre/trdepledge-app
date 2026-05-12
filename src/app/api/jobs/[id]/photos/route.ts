import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getServiceClient } from "@/lib/supabase";
import { PHOTOS_BUCKET } from "@/lib/storage";

export const runtime = "nodejs";

// POST multipart/form-data: { kind: "before" | "after" | "receipts", file: <image> }
//
// Auth — admin can upload to any job; worker can upload only to a job
// they're assigned to. Path format: jobs/<job-id>/<kind>/<random>.<ext>
//
// "receipts" is the same shape as before/after — added so workers can
// capture proof-of-purchase for on-site material runs without texting
// Thomas the photo.
//
// Compression is the client's job (browser-image-compression keeps each
// upload under ~1MB per spec). The server enforces a hard 5MB ceiling
// as a safety net in case the client skips it.
const MAX_BYTES = 5 * 1024 * 1024;
// iOS Safari camera roll returns HEIC/HEIF by default. Allow them at
// the API; browser-image-compression on the client transcodes to JPEG
// (or in worst-case lets the server reject after a transparent retry).
const ALLOWED_TYPES = new Set([
  "image/jpeg", "image/png", "image/webp",
  "image/heic", "image/heif",
]);

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getServiceClient();
  if (!supabase) return NextResponse.json({ error: "Database not configured" }, { status: 503 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Invalid form data" }, { status: 400 });

  const kind = form.get("kind");
  if (kind !== "before" && kind !== "after" && kind !== "receipts") {
    return NextResponse.json({ error: "kind must be 'before', 'after', or 'receipts'" }, { status: 400 });
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

  // Pre-check the job exists with role-appropriate scoping. We could
  // skip this and rely on the RPC's auth filter alone, but a probing
  // 404 before we burn an upload is cheaper than uploading and then
  // having to clean up an orphan blob.
  const baseQuery = supabase
    .from("jobs")
    .select("id")
    .eq("id", params.id);
  const { data: jobExists, error: readErr } = session.user.role === "admin"
    ? await baseQuery.maybeSingle()
    : await baseQuery.contains("assigned_worker_ids", [session.user.id]).maybeSingle();

  if (readErr) {
    console.error("[photos POST] read", readErr);
    return NextResponse.json({ error: "Could not load job" }, { status: 500 });
  }
  if (!jobExists) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Build a non-guessable path. crypto.randomUUID is available in Node 19+.
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const filename = `${crypto.randomUUID()}.${ext}`;
  const path = `jobs/${params.id}/${kind}/${filename}`;

  const buf = Buffer.from(await file.arrayBuffer());
  const { error: uploadErr } = await supabase.storage
    .from(PHOTOS_BUCKET)
    .upload(path, buf, { contentType: file.type, upsert: false });

  if (uploadErr) {
    console.error("[photos POST] upload", uploadErr);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }

  // Atomic append via Postgres function — closes the read-modify-write
  // race two simultaneous uploads would otherwise hit. The function
  // re-checks worker assignment, so even if assignment was revoked
  // between the read above and this call, the row update matches 0
  // and we treat it as a 404 (and clean up the upload).
  const { data: ok, error: rpcErr } = await supabase.rpc("append_job_photo", {
    p_job_id: params.id,
    p_kind: kind,
    p_path: path,
    p_worker_id: session.user.role === "admin" ? null : session.user.id,
  });

  if (rpcErr || !ok) {
    console.error("[photos POST] append rpc", rpcErr ?? "row not updated");
    // Roll back the orphan upload — best effort, no error if it fails.
    await supabase.storage.from(PHOTOS_BUCKET).remove([path]).catch(() => {});
    return NextResponse.json(
      { error: rpcErr ? "Could not save photo reference" : "Job not found or photo cap reached" },
      { status: rpcErr ? 500 : 409 },
    );
  }

  return NextResponse.json({ path }, { status: 201 });
}
