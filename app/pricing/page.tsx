import type { Metadata } from "next";
import PricingWorkspace from "@/components/pricing-workspace";
export const metadata: Metadata = { title: "Free, Pro and Max plans", description: "Compare NutritiScan plans for Health chat and Research." };
export default function PricingPage() { return <div className="ns-chat-home"><PricingWorkspace /></div>; }
