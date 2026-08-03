import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://nutritiscan-ai-968m.vercel.app";
  const now = new Date();
  return [
    { url: `${base}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/scan`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/home`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/coach`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/progress`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    // /profile is deliberately absent: it is a settings surface with nothing
    // to rank for, and listing it invites a crawler to index a page whose
    // entire purpose is the user's health data.
  ];
}
