import type { Metadata } from "next";
import DischargeDemo from "@/components/discharge-demo";

export const metadata: Metadata = {
  title: "Synthetic discharge workflow demo",
  description: "A fictional pending-result follow-up workflow for reviewing NutritiScan's product direction.",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <DischargeDemo />;
}
