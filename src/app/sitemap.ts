import type { MetadataRoute } from "next";

import { HIRE_PUBLIC_LAUNCH } from "@/lib/hire";

/**
 * The canonical host. Matches `metadataBase` in the root layout, and it is
 * the apex rather than the app subdomain on purpose: both serve the same
 * deployment, so naming one here is what tells search engines which of the
 * two duplicates to keep.
 */
export const SITE_URL = "https://trdepledgegardeningandmaintenance.com";

/**
 * sitemap.xml — there wasn't one at all until now.
 *
 * Hand-listed rather than derived from the route tree, because most routes in
 * this app should never be in a sitemap: everything under /admin and /worker
 * is signed-in, /feedback/[token] is a private per-customer link, and the auth
 * pages are noise. A generated list would need a deny-list as long as this
 * allow-list, and would silently start publishing new private routes the day
 * someone adds one.
 *
 * `/hire` appears only once it has launched, following the same flag as its
 * `noindex` and its robots entry. Listing a noindex page in a sitemap is a
 * contradiction crawlers report as an error, so the three have to agree —
 * which is why they all read the one constant.
 *
 * Priorities are relative and only meaningful within this file. Services and
 * hire earn the top slots under the home page because they are what someone
 * is searching for when they need a gardener or a mixer; privacy sits at the
 * bottom because nobody arrives from a search engine looking for it.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const pages: Array<{ path: string; priority: number; changeFrequency: "weekly" | "monthly" | "yearly" }> = [
    { path: "/", priority: 1.0, changeFrequency: "weekly" },
    { path: "/services", priority: 0.9, changeFrequency: "monthly" },
    { path: "/about", priority: 0.7, changeFrequency: "monthly" },
    { path: "/ndis-aged-care", priority: 0.7, changeFrequency: "monthly" },
    { path: "/gallery", priority: 0.6, changeFrequency: "weekly" },
    { path: "/reviews", priority: 0.6, changeFrequency: "weekly" },
    { path: "/contact", priority: 0.8, changeFrequency: "yearly" },
    { path: "/privacy", priority: 0.2, changeFrequency: "yearly" },
  ];

  if (HIRE_PUBLIC_LAUNCH) {
    // Second only to the home page once it is live: it is a distinct service
    // with its own search intent, and the whole point of launching it.
    pages.splice(1, 0, { path: "/hire", priority: 0.9, changeFrequency: "weekly" });
  }

  return pages.map(({ path, priority, changeFrequency }) => ({
    url: `${SITE_URL}${path}`,
    lastModified: now,
    changeFrequency,
    priority,
  }));
}
