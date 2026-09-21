import type { Viewport } from "next";
import ChatWorkspace from "@/components/chat-workspace";

export const viewport: Viewport = { themeColor: "#05080a" };

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.nutritiscan.com";

/**
 * Structured data for the home page.
 *
 * `isAccessibleForFree` and the explicit disclaimer are not decoration: search
 * engines treat health content as a "your money or your life" category and
 * surface it more conservatively when a page will not say what it is. Saying
 * plainly that this is educational and not a diagnosis is both true and the
 * thing that lets the rest of the page be trusted.
 */
const STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: "NutritiScan",
      inLanguage: "en",
      publisher: { "@id": `${SITE_URL}/#org` },
    },
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#org`,
      name: "NutritiScan",
      url: SITE_URL,
      logo: `${SITE_URL}/icon.svg`,
    },
    {
      "@type": "SoftwareApplication",
      name: "NutritiScan",
      applicationCategory: "HealthApplication",
      operatingSystem: "Web",
      url: SITE_URL,
      description:
        "A health companion that answers questions in plain words, shows the published reference behind every answer, keeps your confirmed reports in one place and helps you prepare for a clinical visit.",
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "INR" },
      publisher: { "@id": `${SITE_URL}/#org` },
      disclaimer:
        "Educational support only. Not a diagnosis, not a prescription and not emergency care. For adults 18+.",
    },
  ],
};

/**
 * The home page is the conversation.
 *
 * It used to be the marketing page, with a picture of a chat on it and the
 * real one three clicks away. That copy now lives at /about; this is the
 * chat itself — the same ChatWorkspace that was already built for the
 * multi-agent pipeline and was reachable from nowhere, since /chat only ever
 * redirected away from it.
 *
 * `ns-chat-home` is a theme scope, not a layout: it re-points the application
 * tokens at the landing's green palette and puts the bloom behind, so the page
 * keeps the look the marketing page had without the chat needing to know.
 */
export default function Page() {
  return (
    <div className="ns-chat-home">
      <script
        type="application/ld+json"
        // Static, authored above — no user or model input reaches this string.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }}
      />
      <div className="ns-chat-glow" aria-hidden />
      <ChatWorkspace />
    </div>
  );
}
