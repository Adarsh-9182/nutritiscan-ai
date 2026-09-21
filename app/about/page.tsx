import type { Viewport } from "next";
import ProductLanding from "@/components/product-landing";

export const metadata = {
  title: "Know more about NutritiScan",
  description:
    "What NutritiScan is, the engine behind it, how a conversation works, and the limits it holds itself to. Source-linked health education with your records under your control.",
  alternates: { canonical: "/about" },
};

export const viewport: Viewport = { themeColor: "#05080a" };

export default function Page() {
  return <ProductLanding />;
}
