import type { MetadataRoute } from "next";

/**
 * The API routes are POST-only workhorses that call a paid model. There is
 * nothing for a crawler there and every request costs something, so they are
 * disallowed explicitly rather than left to a crawler's judgement.
 */
export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://nutritiscan-ai-968m.vercel.app";
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: "/api/" }],
    sitemap: `${base}/sitemap.xml`,
  };
}
