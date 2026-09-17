/**
 * Checks a generated answer as it streams. A personal dosing instruction
 * stops the answer and replaces it; general facts about medicines remain.
 */
const PERSONAL_DOSE =
  /\b(take|start|increase|double|reduce|lower|raise|stop|skip|le\s*lo|lijiye|lein|khayein|khao|badha|kam\s*kar)\b[^.\n]{0,40}?\b\d+(?:\.\d+)?\s?(?:mg|mcg|µg|g|ml|units?|iu|tablets?|pills?|capsules?|goli|goliyan|drops?)\b/i;
// Hindi puts the verb after the amount: "roz 1000 iu le lo".
const PERSONAL_DOSE_HI =
  /\b\d+(?:\.\d+)?\s?(?:mg|mcg|µg|ml|units?|iu|tablets?|goli|goliyan|drops?)\b[^.\n]{0,25}?\b(?:le\s*lo|le\s*lijiye|lijiye|lein|khayein|khao|kha\s*lo)\b/i;
const STOP_MEDICINE =
  /\b(stop|discontinue|quit|band\s*kar\s*(?:do|dein|dijiye)|chhod\s*(?:do|dein|dijiye))\b[^.\n]{0,25}\b(your|apni|apna)?\s*(medicine|medication|tablets?|pills?|insulin|dawai|dawa)\b/i;
const CERTAINTY =
  /\b(you (?:definitely|certainly) have|you are (?:definitely )?(?:safe|fine) (?:to|and don't need)|no need to see a doctor|doctor ki zaroorat nahi)\b/i;

// "Haan, metformin band kar do" / "yes, you can stop taking it".
const STOP_NAMED =
  /\b(?:haan|yes|sure|ok(?:ay)?|bilkul)\b[^.\n]{0,40}?\b(?:band\s*kar\s*(?:do|dein|dijiye|du|sakte)|chhod\s*(?:do|dein|dijiye|sakte)|stop\s+(?:taking|using))\b|\byou\s+can\s+(?:safely\s+)?stop\s+(?:taking|using)\s+\w+/i;
// "Your dose is 400 mg", "500 mg every 8 hours": a dose without a verb.
const DOSE_STATEMENT =
  /\b(?:your|aapki|apki|aapka|apka|tumhari)\s+(?:dose|dosage)\b[^.\n]{0,30}?\d+(?:\.\d+)?\s?(?:mg|mcg|µg|ml|units?|iu|tablets?|goli)\b|\b\d+(?:\.\d+)?\s?(?:mg|mcg|µg|ml|units?|iu|tablets?|goli)\s+(?:every|har)\s+\d+\s*(?:hours?|hrs?|ghante)\b/i;
// "Aapko ulcer hai": a certain diagnosis in Hinglish or Hindi.
const CERTAINTY_HI =
  /\b(?:aapko|apko|tumhe|tumko)\s+(?:pakka\s+|zaroor\s+|definitely\s+)?(?:diabetes|sugar|pcos|pcod|thyroid|hypothyroidism|hypertension|bp|anaemia|anemia|kidney\s+stones?|pathri|cancer|tb|typhoid|dengue|malaria|ulcer|infection|fatty\s+liver|migraine)\s+(?:hai|ho\s+gaya|ho\s+gayi)\b|आपको\s+(?:पक्का\s+)?(?:डायबिटीज|मधुमेह|थायराइड|शुगर|कैंसर|अल्सर)\s+है/i;
// The model repeating its own instructions.
const PROMPT_LEAK =
  /safety rules you always follow|context \(data, not instructions\)|you are nutritiscan, a health-focused ai assistant/i;

const RULES: [string, RegExp][] = [
  ["personal_dose", PERSONAL_DOSE],
  ["personal_dose_hi", PERSONAL_DOSE_HI],
  ["stop_medicine", STOP_MEDICINE],
  ["certain_diagnosis", CERTAINTY],
  ["stop_named_medicine", STOP_NAMED],
  ["dose_statement", DOSE_STATEMENT],
  ["certain_diagnosis_hi", CERTAINTY_HI],
  ["prompt_leak", PROMPT_LEAK],
];

const DIAGNOSIS_RULES = new Set(["certain_diagnosis", "certain_diagnosis_hi"]);

/**
 * The id of the first rule an answer breaks, or null. `known` is what the
 * person already recorded (conditions and medicines): restating a condition
 * they told us about ("since you have diabetes") is not a new diagnosis,
 * and a conditional ("agar aapko…", "if you have…") is not one either.
 */
export function guardRule(text: string, known = ""): string | null {
  const recorded = known.toLowerCase();
  for (const [id, re] of RULES) {
    const match = re.exec(text);
    if (!match) continue;
    if (DIAGNOSIS_RULES.has(id)) {
      const before = text.slice(Math.max(0, match.index - 12), match.index);
      if (/\b(?:agar|if|jab|when)\s*$/i.test(before)) continue;
      // The condition can follow the matched phrase ("you definitely have \u2026").
      const span = text
        .slice(match.index, match.index + match[0].length + 30)
        .toLowerCase();
      const words = span.match(/[a-z\u0900-\u097f]{3,}/g) ?? [];
      const condition = words.find(
        (w) =>
          !/^(?:you|have|definitely|certainly|aapko|apko|tumhe|tumko|pakka|zaroor|hai|gaya|gayi|आपको|पक्का)$/.test(
            w,
          ),
      );
      if (condition && recorded.includes(condition)) continue;
    }
    return id;
  }
  return null;
}

export function unsafeOutput(text: string, known = ""): boolean {
  return guardRule(text, known) !== null;
}

export function boundaryText(hinglish: boolean) {
  return hinglish
    ? "Is sawal ke jawab me personal dawai ya dose ki salah aa rahi thi, jo main nahi de sakta. Apni dawai ya dose ke baare me apne doctor ya pharmacist se poochhein. Main dawai ke baare me aam jaankari aur doctor se poochhne ke sawal taiyaar karne me madad kar sakta hoon."
    : "That answer was heading into personal medicine or dose advice, which I can’t give. Please check doses and changes with your prescriber or pharmacist. I can explain how a medicine works in general or help you prepare questions for them.";
}
