import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.nutritiscan.com";
  return [
    { url: `${base}/` },
    { url: `${base}/about` },
    { url: `${base}/guides/doctor-appointment-checklist` },
    { url: `${base}/privacy` },
    { url: `${base}/terms` },
  ];
}
