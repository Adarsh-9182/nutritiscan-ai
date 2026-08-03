import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import Providers from "@/components/providers";
import { TabBar } from "@/components/ds/tabbar";
import { THEME_BOOT_SCRIPT } from "@/lib/v2/store";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"], display: "swap" });

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://nutritiscan-ai-968m.vercel.app";

const TITLE = "NutritiScan — Start with a question";
const DESCRIPTION =
  "One surface answers everything: food, labs, medicine, plans. A calm, knowledgeable health companion that shows its evidence and ends every answer with one next step.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: TITLE, template: "%s — NutritiScan" },
  description: DESCRIPTION,
  applicationName: "NutritiScan",
  alternates: { canonical: "/" },
  openGraph: { type: "website", url: "/", siteName: "NutritiScan", title: TITLE, description: DESCRIPTION, locale: "en_GB" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
  robots: { index: true, follow: true },
  // Health data on a personal device — never worth surfacing in a
  // search engine's cached snapshot of a logged-in view.
  formatDetection: { telephone: false, address: false, email: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Deliberately NOT `maximumScale: 1`. Pinch-zoom is the assistive
  // technology most people actually use, and a health product is the
  // last place to disable it for the sake of a tidy layout.
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0b0908" },
    { media: "(prefers-color-scheme: light)", color: "#fdfaf7" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/*
          Resolves the stored theme before first paint. Without it,
          every light-mode user sees one dark frame before the flip —
          the flash-of-wrong-theme that makes an app feel cheap.

          `suppressHydrationWarning` on <html> is required because
          this script mutates the very element React then hydrates.
        */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className={geistSans.variable}>
        <a href="#main" className="sr-only skip-link">
          Skip to content
        </a>
        <Providers>
          <div className="app-shell">{children}</div>
          <TabBar />
        </Providers>
      </body>
    </html>
  );
}
