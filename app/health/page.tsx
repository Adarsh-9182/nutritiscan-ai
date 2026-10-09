import type { Metadata } from "next";
import HealthPlatform from "@/components/health-platform";
export const metadata: Metadata = { title: "Your health memory · NutritiScan", robots: { index: false, follow: false } };
export default function Page() { return <HealthPlatform />; }
