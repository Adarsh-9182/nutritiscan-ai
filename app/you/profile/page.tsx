import type { Metadata } from "next";
import { HealthProfileScreen } from "@/components/screens/health-profile";

export const metadata: Metadata = { title: "Health profile", robots: { index: false, follow: false } };

export default function Page() {
  return <HealthProfileScreen />;
}
