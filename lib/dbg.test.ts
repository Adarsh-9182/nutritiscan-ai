import { it } from "vitest";
import { HealthProfileSchema } from "./memory/schema";
it("debug", () => {
  const r = HealthProfileSchema.safeParse({ name: "Adarsh", goal: "Build muscle" });
  console.log("SUCCESS:", r.success);
  if (!r.success) console.log(JSON.stringify(r.error.issues, null, 2));
});
