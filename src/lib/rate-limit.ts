// Tiny in-process rate limiter for our public POST routes.
//
// Why in-memory and not Redis / Supabase: this is a local
// gardening-business site. The realistic spam threat is dumb form-fillers,
// not a coordinated DDoS. An in-memory limiter inside each Vercel
// serverless instance:
//   * gets reset on cold start, so the cap is "soft" — fine, since
//     our actual goal is to stop runaway bots, not enforce a quota
//   * is zero-dep, zero-config, zero-cost
//   * still fires within a single warm instance, which is where
//     most burst spam lands
//
// A real abuse problem would prompt a swap to Upstash / a `rate_limits`
// table in Postgres. Until then this is the right cost/value trade.
//
// Returns `true` if the request is allowed, `false` if it exceeds the cap.

type Bucket = { count: number; reset: number };

const buckets = new Map<string, Bucket>();

// Periodically prune the map so a long-lived warm instance doesn't grow
// unbounded. Cheap — runs once per call and only deletes expired keys.
function prune(now: number) {
  if (buckets.size < 256) return;
  for (const [k, v] of buckets) {
    if (v.reset <= now) buckets.delete(k);
  }
}

export function rateLimit(
  key: string,
  opts: { max: number; windowMs: number },
): { ok: boolean; remaining: number; resetMs: number } {
  const now = Date.now();
  prune(now);

  const existing = buckets.get(key);
  if (!existing || existing.reset <= now) {
    buckets.set(key, { count: 1, reset: now + opts.windowMs });
    return { ok: true, remaining: opts.max - 1, resetMs: opts.windowMs };
  }

  existing.count += 1;
  const ok = existing.count <= opts.max;
  return { ok, remaining: Math.max(0, opts.max - existing.count), resetMs: existing.reset - now };
}

// Best-effort client IP extraction. Vercel sets `x-forwarded-for`; the
// first entry is the original client. Fall back to `x-real-ip` and finally
// a fixed string so the limiter still applies (just bucketed globally).
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp;
  return "unknown";
}
