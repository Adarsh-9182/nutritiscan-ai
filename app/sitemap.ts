import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.nutritiscan.com";
  const now = new Date();
  return [
    { url: `${base}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    // What the home page used to be: everything about the product, now that the
    // home page is the conversation itself.
    { url: `${base}/about`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/privacy`, lastModified: now, changeFrequency: "weekly", priority: 0.3 },
    // Indexable, linked from the footer, and the page a reader checks before
    // trusting a health product — it was the one public route left out.
    { url: `${base}/terms`, lastModified: now, changeFrequency: "weekly", priority: 0.3 },
  ];
}
