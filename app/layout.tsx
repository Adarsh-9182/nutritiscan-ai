import type { Metadata, Viewport } from "next";

import { Instrument_Sans, Noto_Sans_Devanagari } from "next/font/google";
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

const TITLE = "NutritiScan — AI health agent";
const DESCRIPTION =
  "A personal health companion for your questions, daily wellbeing, medicines and records. Source-linked education, private on-device AI and tools to prepare for care.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: TITLE, template: "%s — NutritiScan AI" },
  description: DESCRIPTION,
  applicationName: "NutritiScan AI",
  keywords: ["AI health", "health OS", "nutrition AI", "health records", "lab reports", "visit preparation"],
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
  themeColor: "#faf9f5",
  width: "device-width",
  initialScale: 1,
  colorScheme: "light",
};

const sans = Instrument_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-ui",
});
// Hindi answers and the Devanagari parts of the page.
const devanagari = Noto_Sans_Devanagari({
  subsets: ["devanagari"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-deva",
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${devanagari.variable}`}>
      <body className={"antialiased"}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
