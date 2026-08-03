import type { Metadata } from "next";
import { MealPlanScreen } from "@/components/screens/meal-plan";

export const metadata: Metadata = { title: "This week" };

export default function Page() {
  return <MealPlanScreen />;
}
