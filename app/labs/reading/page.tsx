import type { Metadata } from "next";
import { LabReadingScreen } from "@/components/screens/lab-reading";

export const metadata: Metadata = { title: "Reading your panel" };

export default function Page() {
  return <LabReadingScreen />;
}
