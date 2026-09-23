import { describe, expect, it } from "vitest";
import { parseMeal } from "./analyze";
import { FOODS, matchFoods } from "./foods";
import { runHealthAgent } from "@/lib/workspace/health-agent";
import { logAnswer, proposeLog } from "@/lib/workspace/daily";
import { speaksHinglish } from "@/lib/workspace/voice";
import type { Workspace } from "@/lib/workspace/types";

const grams = (text: string) =>
  Object.fromEntries(parseMeal(text).map((i) => [i.name, i.grams]));

describe("Indian meals and Hindi quantities", () => {
  it("reads Hindi numbers and portions", () => {
    expect(grams("do roti aur ek katori dal")).toEqual({ Roti: 80, Dal: 120 });
    expect(grams("teen puri aur chole")).toMatchObject({ Puri: 75 });
    expect(grams("ek glass chaas")).toEqual({ Buttermilk: 250 });
    expect(grams("do chammach ghee")).toEqual({ Ghee: 30 });
    expect(grams("dedh roti")).toEqual({ Roti: 60 });
    expect(grams("aadhi plate pav bhaji")).toEqual({ "Pav bhaji": 125 });
  });
  it("treats half as half, not one", () => {
    expect(grams("half a bowl of khichdi")).toEqual({ Khichdi: 75 });
    expect(grams("one and a half roti")).toEqual({ Roti: 60 });
    expect(grams("1.5 roti")).toEqual({ Roti: 60 });
  });
  it("finds every food in one phrase and binds counts to the right one", () => {
    expect(grams("2 idli sambar ke saath")).toEqual({ Idli: 80, Dal: 150 });
    expect(grams("brown rice")).toEqual({ "Brown rice": 180 });
  });
  it("keeps weights written after the food and survives full stops", () => {
    expect(grams("rice 200g")).toEqual({ "Cooked rice": 200 });
    expect(grams("dal 100g rice 200g")).toEqual({
      Dal: 100,
      "Cooked rice": 200,
    });
    expect(grams("2 rotis and dal.")).toEqual({ Roti: 80, Dal: 150 });
    expect(grams("3 eggs.")).toEqual({ Egg: 150 });
    expect(grams("eggs 3")).toEqual({ Egg: 150 });
    expect(grams("idli at 9 in the morning")).toEqual({ Idli: 80 });
  });
  it("does not read English 'do' as two", () => {
    expect(grams("I do love rajma")).toEqual({ Rajma: 150 });
  });
  it("prefers the specific dish over its ingredient", () => {
    expect(Object.keys(grams("dal makhani"))).toEqual(["Dal makhani"]);
    expect(Object.keys(grams("palak paneer"))).toEqual(["Palak paneer"]);
    expect(Object.keys(grams("paneer tikka"))).toEqual(["Paneer"]);
    expect(Object.keys(grams("aloo gobi"))).toEqual(["Aloo sabzi"]);
  });
  it("keeps the food table consistent", () => {
    const ids = new Set<string>();
    const aliases = new Map<string, string>();
    for (const f of FOODS) {
      expect(ids.has(f.id)).toBe(false);
      ids.add(f.id);
      for (const a of f.aliases) {
        expect(aliases.get(a), `${a} is claimed twice`).toBeUndefined();
        aliases.set(a, f.id);
      }
      expect(f.kcal).toBeGreaterThan(0);
      // Energy from macros should roughly agree with the stated kcal.
      const macro = f.protein * 4 + f.carbs * 4 + f.fat * 9;
      expect(Math.abs(macro - f.kcal) / f.kcal, f.id).toBeLessThan(0.35);
    }
    expect(FOODS.length).toBeGreaterThan(100);
    expect(matchFoods("nothing edible here")).toEqual([]);
  });
});

const workspace: Workspace = {
  profile: {
    name: "A",
    language: "English",
    allergies: "",
    medicines: "",
    conditions: "",
  },
  reports: [],
  tasks: [],
  days: [],
};

describe("Hinglish replies", () => {
  it("detects Hinglish without catching plain English", () => {
    expect(speaksHinglish("maine aaj do roti khayi")).toBe(true);
    expect(speaksHinglish("सीने में दर्द")).toBe(true);
    expect(speaksHinglish("I had two rotis for lunch")).toBe(false);
    expect(
      speaksHinglish("hello", {
        ...workspace.profile,
        language: "Hindi / Hinglish",
      }),
    ).toBe(true);
  });
  it("logs Hinglish meals and answers in Hinglish", async () => {
    expect(proposeLog("maine lunch me do roti aur dal khayi")?.[0].kind).toBe(
      "meal",
    );
    const reply = await runHealthAgent(
      "maine lunch me do roti aur dal khayi",
      workspace,
    );
    expect(reply.text).toContain("Aaj ke log me");
    expect(reply.text).toContain("Check karke");
    const english = await runHealthAgent("had 2 rotis for lunch", workspace);
    expect(english.text).toContain("I can add this");
  });
  it("keeps the dose boundary in Hinglish", async () => {
    const reply = await runHealthAgent(
      "BP ki dawai kitni goli leni chahiye",
      workspace,
    );
    expect(reply.text).toContain("jaankari nahi deta");
  });
  it("answers log questions in Hinglish", () => {
    expect(
      logAnswer("is hafte meri neend kaisi rahi", workspace, "2026-09-17")
        ?.text,
    ).toContain("Pichhle 7 din me kuch log nahi hua");
  });
});
