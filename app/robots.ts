import type { MetadataRoute } from "next";

/**
 * The API routes are POST-only workhorses that call a paid model. There is
 * nothing for a crawler there and every request costs something, so they are
 * disallowed explicitly rather than left to a crawler's judgement.
 */
export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.nutritiscan.com";
  return {
    // Public pages communicate their own `noindex` directive where appropriate.
    // Crawlers must be allowed to fetch those pages to see that directive.
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/"] }],
    sitemap: `${base}/sitemap.xml`,
  };
}
