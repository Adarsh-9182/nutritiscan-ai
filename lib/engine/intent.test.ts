import { describe, expect, it } from "vitest";
import { isClinicalQuestion } from "./intent";

describe("isClinicalQuestion", () => {
  it.each([
    "I've had a sore throat for three days",
    "my knee hurts when I climb stairs",
    "should I be worried about this rash",
    "what could this be? my stomach keeps cramping",
    "do i have a fever if i feel cold",
    "I've been feeling awful since Tuesday",
    "is this serious",
    "how do i treat a burn",
  ])("routes %j to the clinical pipeline", (text) => {
    expect(isClinicalQuestion(text)).toBe(true);
  });

  it.each([
    "how much protein should I eat to build muscle",
    "what's a good push day split",
    "explain my vitamin D result",
    "help me plan groceries for the week",
    "how many calories are in two rotis",
  ])("leaves %j with the topic supervisor", (text) => {
    expect(isClinicalQuestion(text)).toBe(false);
  });

  it("is case insensitive", () => {
    expect(isClinicalQuestion("MY HEAD ACHES")).toBe(true);
  });
});
