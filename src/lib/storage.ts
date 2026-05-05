import type { SupabaseClient } from "@supabase/supabase-js";

export const PHOTOS_BUCKET = "job-photos";

// Signed URLs valid for an hour — long enough for an open page but not
// for a screenshot to be sharable indefinitely.
const SIGNED_URL_TTL_SECONDS = 60 * 60;

export async function signPhotoUrls(
  supabase: SupabaseClient | null,
  paths: string[],
): Promise<Array<{ path: string; url: string }>> {
  if (!supabase || paths.length === 0) return [];

  // createSignedUrls accepts a batch — much cheaper than one round trip per path.
  const { data, error } = await supabase
    .storage
    .from(PHOTOS_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);

  if (error || !data) {
    console.error("[signPhotoUrls]", error);
    return [];
  }
  const out: Array<{ path: string; url: string }> = [];
  for (const d of data) {
    if (d.signedUrl && d.path) out.push({ path: d.path, url: d.signedUrl });
  }
  return out;
}
