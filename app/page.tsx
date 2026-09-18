import type { Viewport } from "next";
import ProductLanding from "@/components/product-landing";

// The public page is dark; the workspace and policy pages stay on the light
// theme set in the root layout. Matching the browser chrome to it keeps the
// phone's status bar from framing the hero in cream.
export const viewport: Viewport = { themeColor: "#080d0b" };

export default function Page() {
  return <ProductLanding />;
}
