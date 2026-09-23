import type { Profile } from "./types";
import type { AssistantAnswer } from "./assistant";
import { say, speaksHinglish } from "./voice";

const MEDICINE_TERMS = /\b(?:medicin(?:e|es)|medication(?:s)?|meds|drug(?:s)?|pill(?:s)?|tablet(?:s)?|capsule(?:s)?|prescri(?:be|bed|bing|ption|ptions)|dos(?:e|es|age)|side[ -]?effects?|interactions?|antibiotics?|insulin|inhalers?|paracetamol|acetaminophen|ibuprofen|metformin|supplements?|syrups?|dawai(?:yan|yon|yaan)?|dawa|dava|goli(?:ya|yaan)?|ilaj|ilaaj|treatment)\b|दवा|दवाई|दवाइयाँ|गोली|गोलियाँ|खुराक|इलाज/i;

export function mentionsMedicines(text: string, profile?: Profile): boolean {
  if (MEDICINE_TERMS.test(text)) return true;
  if (/\b(?:take|taking|refill|start|stop)\b.{0,50}\b(?:vitamin|iron)\b/i.test(text)) return true;
  if (!profile?.medicines.trim()) return false;
  const words = new Set(text.toLowerCase().match(/[\p{L}\p{M}]+/gu) ?? []);
  return profile.medicines
    .split(/[\n,;]+/)
    .map((entry) => entry.trim().split(/\s+/)[0]?.toLowerCase())
    .some((name) => name && name.length > 3 && words.has(name));
}

export function medicineBoundary(question: string, profile: Profile): AssistantAnswer {
  return {
    mode: "unavailable",
    text: say(
      speaksHinglish(question, profile),
      "NutritiScan does not provide medicine, dose, interaction or treatment information. For a personal medicine question, contact your pharmacist or prescribing clinician. I can help with non-medicine health topics, your confirmed reports and visit preparation.",
      "NutritiScan dawai, dose, interaction ya ilaaj ke baare mein jaankari nahi deta. Apni dawai ke sawaal ke liye pharmacist ya dawai likhne wale doctor se baat karein. Main doosre health topics, aapki confirmed reports aur doctor visit ki taiyaari mein madad kar sakta hoon.",
    ),
    sources: [],
  };
}
