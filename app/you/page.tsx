import type { Metadata } from "next";
import { YouScreen } from "@/components/screens/you";

export const metadata: Metadata = { title: "You", robots: { index: false, follow: false } };

export default function Page() {
  return <YouScreen />;
}
