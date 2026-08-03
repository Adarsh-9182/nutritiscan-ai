import type { Metadata } from "next";
import { GroceryScreen } from "@/components/screens/grocery";

export const metadata: Metadata = { title: "Shopping list" };

export default function Page() {
  return <GroceryScreen />;
}
