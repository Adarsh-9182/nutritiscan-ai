import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://nutritiscan-ai-968m.vercel.app";
  const now = new Date();
  return [
    { url: `${base}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/scan`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/dashboard`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/timeline`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
  ];
}
