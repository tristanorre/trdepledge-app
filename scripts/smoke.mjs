// Smoke check: hits every public-facing route on the configured base URL
// and reports whether the response is "alive" (any non-5xx) or broken (5xx
// or network error). Doesn't authenticate — admin/worker pages are
// expected to redirect to /login (HTTP 307) when there's no session,
// which we treat as success.
//
// Usage:
//   npm run smoke                          # hits http://localhost:3000
//   BASE_URL=https://app.trdepledge... npm run smoke
//
// Exit code is non-zero if any route returns 5xx or the server is unreachable.

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

const ROUTES = [
  // Public marketing
  { path: "/",                 expect: [200] },
  { path: "/services",         expect: [200] },
  { path: "/ndis-aged-care",   expect: [200] },
  { path: "/about",            expect: [200] },
  { path: "/gallery",          expect: [200] },
  { path: "/contact",          expect: [200] },

  // Static assets
  { path: "/logo.svg",                expect: [200] },
  { path: "/manifest.webmanifest",    expect: [200] },
  { path: "/sw.js",                   expect: [200] },
  { path: "/favicon.ico",             expect: [200] },
  { path: "/apple-touch-icon.png",    expect: [200] },
  { path: "/icons/icon-192.png",      expect: [200] },
  { path: "/icons/icon-512.png",      expect: [200] },

  // Auth UI
  { path: "/login",                   expect: [200] },
  { path: "/api/auth/workers",        expect: [200] },

  // Authenticated pages — middleware should redirect to /login.
  { path: "/admin",                   expect: [200, 307] },
  { path: "/admin/jobs",              expect: [200, 307] },
  { path: "/admin/enquiries",         expect: [200, 307] },
  { path: "/admin/schedule",          expect: [200, 307] },
  { path: "/admin/time",              expect: [200, 307] },
  { path: "/admin/hr",                expect: [200, 307] },
  { path: "/admin/hr/roster",         expect: [200, 307] },
  { path: "/admin/hr/leave",          expect: [200, 307] },
  { path: "/admin/hr/payroll",        expect: [200, 307] },
  { path: "/admin/inventory",         expect: [200, 307] },
  { path: "/admin/inventory/audit",   expect: [200, 307] },
  { path: "/admin/inventory/new",     expect: [200, 307] },
  { path: "/admin/settings",          expect: [200, 307] },
  { path: "/worker",                  expect: [200, 307] },
  { path: "/worker/schedule",         expect: [200, 307] },
  { path: "/worker/leave",            expect: [200, 307] },

  // API auth-required endpoints — should 401, not 5xx.
  { path: "/api/admin/jobs",          expect: [401] },
  { path: "/api/admin/inventory",     expect: [401] },
  { path: "/api/admin/audit-log",     expect: [401] },
  { path: "/api/worker/jobs",         expect: [401] },
  { path: "/api/worker/leave",        expect: [401] },
];

const results = [];
for (const r of ROUTES) {
  const url = `${BASE}${r.path}`;
  try {
    const start = Date.now();
    const res = await fetch(url, { redirect: "manual" });
    const ms = Date.now() - start;
    const ok = r.expect.includes(res.status);
    results.push({ path: r.path, status: res.status, ok, ms });
  } catch (err) {
    results.push({ path: r.path, status: 0, ok: false, ms: 0, error: String(err) });
  }
}

let bad = 0;
const colWidth = Math.max(...results.map((r) => r.path.length)) + 2;
for (const r of results) {
  const tick = r.ok ? "✓" : "✗";
  const status = r.error ? "ERR" : String(r.status);
  const time = r.ms ? `${r.ms}ms` : "";
  console.log(`  ${tick}  ${r.path.padEnd(colWidth)} ${status.padStart(4)} ${time}`);
  if (!r.ok) bad++;
  if (r.error) console.log(`     ${r.error}`);
}

console.log("");
if (bad === 0) {
  console.log(`All ${results.length} routes alive on ${BASE}.`);
  process.exit(0);
} else {
  console.error(`${bad} of ${results.length} routes failed.`);
  process.exit(1);
}
