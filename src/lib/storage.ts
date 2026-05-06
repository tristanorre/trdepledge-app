import type { SupabaseClient } from "@supabase/supabase-js";

export const PHOTOS_BUCKET = "job-photos";

// Signed URLs valid for 8 hours — covers a full workday so a job
// detail page left open from 8am morning briefing is still showing
// photos at 4pm. Trade-off: a screenshot of the URL is shareable for
// the same window. For an internal field tool this is acceptable.
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 8;

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
