import type { MetadataRoute } from "next";

import { HIRE_PUBLIC_LAUNCH } from "@/lib/hire";

import { SITE_URL } from "./sitemap";

/**
 * robots.txt — there wasn't one at all until now.
 *
 * TWO HOSTS, ONE DEPLOYMENT. The apex and app.trdepledgegardeningandmaintenance.com
 * serve the same Next.js app: nothing routes on hostname, so every marketing
 * page is reachable at both and the admin console is reachable at both. The
 * private halves are already `noindex` at the page level (see the admin and
 * worker layouts), which is what actually keeps them out of results — this
 * file stops crawlers spending the site's budget requesting them in the first
 * place, and `Sitemap:` names the apex so that is the version search engines
 * treat as canonical.
 *
 * Disallow is NOT a security control. Everything below is behind
 * `requireAdmin` / `requireWorker`; listing a path here only asks a
 * well-behaved crawler not to fetch it.
 *
 * `/hire` follows the same flag as its `noindex`, so a single switch decides
 * whether the hire page is public everywhere rather than in two places that
 * can drift apart.
 */
export default function robots(): MetadataRoute.Robots {
  const privatePaths = ["/admin", "/worker", "/api/", "/login", "/forgot-password", "/reset-password", "/feedback/"];

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: HIRE_PUBLIC_LAUNCH ? privatePaths : [...privatePaths, "/hire"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
