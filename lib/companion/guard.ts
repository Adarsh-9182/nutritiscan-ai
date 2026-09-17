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

export function unsafeOutput(text: string): boolean {
  return (
    PERSONAL_DOSE.test(text) ||
    PERSONAL_DOSE_HI.test(text) ||
    STOP_MEDICINE.test(text) ||
    CERTAINTY.test(text)
  );
}

export function boundaryText(hinglish: boolean) {
  return hinglish
    ? "Is sawal ke jawab me personal dawai ya dose ki salah aa rahi thi, jo main nahi de sakta. Apni dawai ya dose ke baare me apne doctor ya pharmacist se poochhein. Main dawai ke baare me aam jaankari aur doctor se poochhne ke sawal taiyaar karne me madad kar sakta hoon."
    : "That answer was heading into personal medicine or dose advice, which I can’t give. Please check doses and changes with your prescriber or pharmacist. I can explain how a medicine works in general or help you prepare questions for them.";
}
