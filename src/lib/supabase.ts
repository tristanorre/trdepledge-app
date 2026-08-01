import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase admin client, or null when the env vars aren't set.
 * Caller decides what to do when null (graceful degradation per spec).
 *
 * ── WHY EVERY REQUEST IS `no-store` ──────────────────────────────────
 *
 * Next.js replaces the global `fetch` and, unless told otherwise, may store
 * the response in its Data Cache and hand the same bytes to later requests —
 * across deployments. supabase-js calls that patched `fetch`, so every read
 * in this app was a candidate. `export const dynamic = "force-dynamic"` does
 * NOT save you: it makes the RENDER dynamic, which is a different thing from
 * making the DATA fresh.
 *
 * This is not theoretical. The DIY Hire page served a stale catalogue for
 * over six hours, proven from the Supabase API logs:
 *
 *   06:36:32  last time /hire actually read `equipment`
 *   06:47:08  migration 0038 set the Lawn Mower's flyer_path
 *   13:08     still serving the 06:36 read — six hours and many loads later
 *
 * The eleven minutes between those first two lines is the whole bug. The
 * mower's flyer link was the only thing on that page to change after the
 * cached read, so it was the only thing wrong — which is exactly what makes
 * this class of fault so expensive to find. Everything looks right, one
 * detail is wrong, and the source is innocent. Rendering was fresh the whole
 * time (the page reported the current commit); only the data was old.
 *
 * A missing flyer link is the cheap version. The availability engine reads
 * through this same client, and a stale read there would show a customer
 * dates that are already booked — they'd request them and hit the
 * `no_double_booking` constraint, which is precisely the failure CLAUDE.md
 * says must never happen. That is the real reason this lives here, at the
 * client, rather than being patched per page: there is no read in this app
 * that may be served from a snapshot of the past.
 */
export function getServiceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    },
  });
}
