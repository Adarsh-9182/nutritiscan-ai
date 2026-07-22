import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "NutritiScan AI — Your Health Has A Memory",
  description:
    "An intelligent AI Health Operating System. Understand your body, track your progress, interpret your data, and make better decisions every day — with a personal AI that remembers everything.",
  keywords: ["AI health", "health OS", "nutrition AI", "AI coach", "health memory"],
};

export const viewport: Viewport = {
  themeColor: "#05070a",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} bg-aurora antialiased`}>
        {children}
      </body>
    </html>
  );
}
