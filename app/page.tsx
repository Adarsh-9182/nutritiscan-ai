import type { Viewport } from "next";
import ProductLanding from "@/components/product-landing";

// The whole app is dark now, so this only has to match the landing's own
// ground rather than opt out of a light layout as it used to.
export const viewport: Viewport = { themeColor: "#05080a" };

export default function Page() {
  return <ProductLanding />;
}
