import type { MetadataRoute } from "next";

/**
 * Only the two surfaces that are genuinely public.
 *
 * Everything else in this product — health, records, labs,
 * medicine, plan, you — is a view onto one person's health data.
 * Those routes also set `robots: { index: false }` in their own
 * metadata; leaving them out here as well means a crawler has to
 * ignore two separate signals to index a lab report.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://nutritiscan-ai-968m.vercel.app";
  const now = new Date();
  return [
    { url: `${base}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/scan`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
  ];
}
