import type { SupabaseClient } from "@supabase/supabase-js";

export const PHOTOS_BUCKET = "job-photos";
export const ASSET_IMAGES_BUCKET = "asset-images";

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

// Single-URL convenience for the asset image use case (one image per
// asset, never a batch). Returns null if the path is missing or the
// signing call fails — callers fall back to the emoji icon.
export async function signAssetImageUrl(
  supabase: SupabaseClient | null,
  path: string | null | undefined,
): Promise<string | null> {
  if (!supabase || !path) return null;
  const { data, error } = await supabase
    .storage
    .from(ASSET_IMAGES_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) {
    if (error) console.error("[signAssetImageUrl]", error);
    return null;
  }
  return data.signedUrl;
}

// Batch variant for the inventory list page — one round-trip for every
// asset image rather than N. Returns a Map<path, signedUrl>; missing
// or signing-failed entries simply aren't in the map (callers fall
// back to the emoji icon).
export async function signAssetImageUrls(
  supabase: SupabaseClient | null,
  paths: ReadonlyArray<string | null | undefined>,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!supabase) return out;

  const real = Array.from(new Set(paths.filter((p): p is string => !!p)));
  if (real.length === 0) return out;

  const { data, error } = await supabase
    .storage
    .from(ASSET_IMAGES_BUCKET)
    .createSignedUrls(real, SIGNED_URL_TTL_SECONDS);

  if (error || !data) {
    console.error("[signAssetImageUrls]", error);
    return out;
  }
  for (const d of data) {
    if (d.path && d.signedUrl) out.set(d.path, d.signedUrl);
  }
  return out;
}
