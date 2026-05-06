/** @type {import('next').NextConfig} */

// Baseline security headers applied to every response.
//
// Goal: low-effort defense-in-depth on top of Next/React's existing XSS
// protections, framing protections, etc. Conservative values — nothing
// here is application-specific and breakages on a vanilla Next 14 app
// would be unusual. Adjust per-route via middleware later if needed.
const SECURITY_HEADERS = [
  // Disallow embedding the field-app subdomain inside any iframe. Stops
  // clickjacking against admin/worker pages on shared coffee-shop wifi.
  { key: "X-Frame-Options", value: "DENY" },

  // Strict MIME — stops a "JS file served as image" smuggling vector.
  { key: "X-Content-Type-Options", value: "nosniff" },

  // Don't leak full URLs (which include things like /admin/jobs/<uuid>)
  // to third-party origins via the Referer header. Same-origin is fine
  // — we own that — and external links still get the bare origin.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },

  // Drop unused powerful APIs we never call. Camera/microphone are gated
  // off entirely; geolocation could be reasonable for a field app one
  // day but isn't used yet, so it's safer off until we wire it.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },

  // 1-year HSTS. Vercel terminates TLS for our domains so HTTPS is
  // already enforced; HSTS just stops a TLS-stripping attack on first
  // navigation over a hostile network. Subdomains opt-in too.
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

export default nextConfig;
