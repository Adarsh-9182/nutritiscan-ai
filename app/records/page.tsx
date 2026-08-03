import type { Metadata } from "next";
import { RecordsScreen } from "@/components/screens/records";

export const metadata: Metadata = { title: "Records", robots: { index: false, follow: false } };

export default function Page() {
  return <RecordsScreen />;
}
