import { describe, expect, it } from "vitest";
import { escalation } from "@/lib/workspace/escalation";

const profile = {
  name: "x",
  language: "Hindi / Hinglish" as const,
  allergies: "",
  medicines: "",
  conditions: "",
};
const mode = (text: string) => escalation(text, profile)?.mode;

describe("Hindi and Hinglish red flags escalate like their English forms", () => {
  it.each([
    "seene me tez dard hai aur saans nahi aa rahi",
    "सीने में दर्द और सांस नहीं आ रही",
    "chhati par bhaari dabav hai aur paseena aa raha",
    "saans lene me dikkat ho rahi hai",
    "behosh ho gaya",
    "papa ka chehra tedha ho gaya aur haath kamzor hai",
    "sir me bahut tez dard achanak shuru hua",
    "daura pada hai",
    "gala band ho raha hai, jeebh sujh gayi",
    "khoon ruk nahi raha",
    "khoon ki ulti ho rahi hai",
    "maine bahut saari goliyan kha li",
    "bachcha pet me hil nahi raha",
  ])("%s", (text) => {
    expect(mode(text)).toBe("escalation");
  });

  it.each([
    "mujhe marne ka mann kar raha hai",
    "jeena nahi chahta ab",
    "khudkushi ke khayal aa rahe hain",
    "मरने का मन करता है",
  ])("routes self-harm to crisis support: %s", (text) => {
    const reply = escalation(text, profile);
    expect(reply?.mode).toBe("escalation");
  });

  it.each([
    "aaj 2 roti khayi aur 7 ghante soya",
    "sar dard hai thoda sa",
    "mera mood acha hai",
    "seena chauda hai",
    "saans ki exercise ki",
    "I don't have chest pain",
  ])("does not escalate ordinary notes: %s", (text) => {
    expect(mode(text)).toBeUndefined();
  });
});
