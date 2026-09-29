import type { Metadata, Viewport } from "next";

import Providers from "@/components/providers";
import "./globals.css";

// Geist_Mono was loaded here and referenced by `--font-mono`, which nothing in
// the app ever used — a whole extra font file fetched on first paint for no
// rendered glyph. The `ui-monospace` stack in globals.css covers the case if a
// monospace surface ever appears.


/**
 * `metadataBase` is what makes Next resolve Open Graph and canonical URLs to
 * absolute ones. Without it, every share card and canonical tag was relative
 * and therefore useless to a crawler.
 *
 * The default points at the deployment that actually serves traffic today.
 * Set NEXT_PUBLIC_SITE_URL once nutritiscan.com resolves here instead of
 * redirecting away from it.
 */
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.nutritiscan.com";

const TITLE = "NutritiScan — AI health agents";
const DESCRIPTION =
  "Ask health questions in plain language. NutritiScan's supervisor can bring specialist agents together for source-linked educational answers.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: TITLE, template: "%s — NutritiScan AI" },
  description: DESCRIPTION,
  applicationName: "NutritiScan AI",
  keywords: ["AI health", "health agents", "nutrition AI", "health questions", "medical education"],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "NutritiScan AI",
    title: TITLE,
    description: DESCRIPTION,
    locale: "en_US",
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
  robots: { index: true, follow: true },
  // Health data on a personal device — never worth surfacing in a search
  // engine's cached snapshot of a logged-in view.
  formatDetection: { telephone: false, address: false, email: false },
};

export const viewport: Viewport = {
  themeColor: "#090b0d",
  width: "device-width",
  initialScale: 1,
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={"antialiased"}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
