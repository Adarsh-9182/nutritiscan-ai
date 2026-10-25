import type { Viewport } from "next";
import ProductLanding from "@/components/product-landing";

// The whole app is dark now, so this only has to match the landing's own
// ground rather than opt out of a light layout as it used to.
export const viewport: Viewport = { themeColor: "#05080a" };

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.nutritiscan.com";

/**
 * Structured data for the landing.
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
      url: SITE_URL,
      description:
        "An AI assistant for medical schools and hospitals, in early access. A research workspace searches PubMed and ClinicalTrials.gov and returns a source-linked evidence index; synthesis, protocol drafting, participant screening and hospital workflows are planned and not yet available.",
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "INR" },
      publisher: { "@id": `${SITE_URL}/#org` },
      operatingSystem: "Web",
      disclaimer:
        "Research support only. Search coverage is incomplete and abstracts can omit important details. Not a diagnosis, not a prescription, not emergency care and not a substitute for ethics review or a qualified clinician.",
    },
  ],
};

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        // Static, authored above — no user or model input reaches this string.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA).replace(/</g, "\\u003c") }}
      />
      <ProductLanding />
    </>
  );
}
