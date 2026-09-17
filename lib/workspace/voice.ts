import type { Profile } from "./types";

// Common Hinglish function words. Two or more in one message, or any
// Devanagari, is a strong enough signal to answer in Hinglish.
const HINGLISH =
  /\b(hai|hain|hoon|hu|kya|kaise|kaisa|kaisi|maine|mera|meri|mere|mujhe|aaj|kal|khaya|khayi|khaye|piya|pee|li|liya|nahi|nahin|kitna|kitni|karna|karo|kar|dawai|dawa|neend|paani|pani|roz|yaad|dilana|dilao|batao|bata|thoda|abhi|hafte|aage|chahiye|subah|raat|shaam|ghante|aur|ke|ka|ki|se|mein)\b/gi;

export function speaksHinglish(text: string, profile?: Profile) {
  if (profile?.language === "Hindi / Hinglish") return true;
  if (/[ऀ-ॿ]/.test(text)) return true;
  return (text.match(HINGLISH) ?? []).length >= 2;
}

/** Picks the English or Hinglish form of a fixed, authored reply. */
export const say = (hi: boolean, en: string, hinglish: string) =>
  hi ? hinglish : en;
