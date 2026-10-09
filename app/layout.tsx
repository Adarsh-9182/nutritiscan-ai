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
 * www is the canonical production host. The apex host redirects to it.
 */
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.nutritiscan.com";

const TITLE = "NutritiScan | Personal health journal & doctor visit prep";
const DESCRIPTION =
  "Keep health notes, meals and doctor-visit questions together. NutritiScan offers an educational web chat and an Android journal in beta; it does not diagnose or prescribe.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: TITLE, template: "%s | NutritiScan" },
  description: DESCRIPTION,
  applicationName: "NutritiScan",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "NutritiScan",
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
  themeColor: "#05080a",
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
