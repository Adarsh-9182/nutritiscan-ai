import { describe, expect, it } from "vitest";
import { escalation } from "@/lib/workspace/escalation";
import { assessTurn } from "@/lib/safety/triage";
import { blankProfile } from "@/lib/memory/profile";

const verdict = (text: string) =>
  assessTurn({
    text,
    profile: blankProfile,
    consultationId: "test",
    turn: 1,
  }).triage.verdict;

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
    "मेरा हाथ सुन्न हो गया है",
    "बोलने में दिक्कत हो रही है",
    "गला बंद हो रहा है",
    "saans bilkul nahi aa rahi",
    "सांस बिल्कुल नहीं आ रही",
    "khoon nahi ruk raha",
    "khoon ruk hi nahi raha",
    "खून रुक नहीं रहा",
  ])("Codex re-review: escalates %s", (text) => {
    expect(mode(text)).toBe("escalation");
  });

  it.each([
    ["seene me severe chest pain ho raha hai", "severe chest pain"],
    ["seene mein bahut tez dard hai", "severe chest pain"],
    ["सीने में बहुत तेज दर्द है", "severe chest pain"],
  ])("keeps severity: %s is as urgent as %s", (hindi, english) => {
    expect(verdict(english)).toBe("emergency");
    expect(verdict(hindi)).toBe(verdict(english));
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
