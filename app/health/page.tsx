import type { Metadata } from "next";
import { HealthScreen } from "@/components/screens/health";

export const metadata: Metadata = { title: "Health", robots: { index: false, follow: false } };

export default function Page() {
  return <HealthScreen />;
}
