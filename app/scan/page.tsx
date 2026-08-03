import type { Metadata } from "next";
import { Suspense } from "react";
import { ScanScreen } from "@/components/screens/scan";

export const metadata: Metadata = { title: "Scan" };

export default function Page() {
  // The screen reads `?mode=` with useSearchParams, which needs a
  // Suspense boundary or the whole route drops out of static
  // rendering.
  return (
    <Suspense fallback={null}>
      <ScanScreen />
    </Suspense>
  );
}
