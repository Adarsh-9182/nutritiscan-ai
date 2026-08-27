import { describe, expect, it } from "vitest";
import { applyResult, describeError } from "./dictation";

/**
 * Shapes a SpeechRecognition event the way the browser delivers one: each
 * result is an array-like of alternatives that also carries `isFinal`.
 */
const event = (segments: { text: string; final: boolean }[], resultIndex = 0) => ({
  resultIndex,
  results: segments.map((s) =>
    Object.assign([{ transcript: s.text }], { isFinal: s.final }),
  ),
});

describe("applyResult", () => {
  it("commits only finalised segments", () => {
    const r = applyResult("", event([{ text: "chest pain", final: true }]));
    expect(r.committed).toBe("chest pain");
    expect(r.interim).toBe("");
  });

  it("keeps interim text out of the committed string", () => {
    // The engine revises interim results as you keep speaking, so committing
    // them would leave half-heard words in the box.
    const r = applyResult("", event([{ text: "chest pai", final: false }]));
    expect(r.committed).toBe("");
    expect(r.interim).toBe("chest pai");
  });

  it("appends to what is already there with a single space", () => {
    const r = applyResult("since yesterday", event([{ text: "and my arm aches", final: true }]));
    expect(r.committed).toBe("since yesterday and my arm aches");
  });

  it("never produces a leading space when dictating into an empty box", () => {
    const r = applyResult("", event([{ text: "  fever  ", final: true }]));
    expect(r.committed).toBe("fever");
  });

  it("does not double a space when the existing text already ends with one", () => {
    const r = applyResult("fever ", event([{ text: "since Monday", final: true }]));
    expect(r.committed).toBe("fever since Monday");
  });

  it("handles a mixed event, committing the final part and returning the tail", () => {
    const r = applyResult("I have", event([
      { text: " a headache", final: true },
      { text: " and some nau", final: false },
    ]));
    expect(r.committed).toBe("I have a headache");
    expect(r.interim).toBe(" and some nau");
  });

  it("reads from resultIndex, ignoring segments the engine already delivered", () => {
    const e = event(
      [
        { text: "old text", final: true },
        { text: "new text", final: true },
      ],
      1,
    );
    expect(applyResult("", e).committed).toBe("new text");
  });

  it("leaves the committed text untouched when nothing was finalised", () => {
    const r = applyResult("chest pain", event([{ text: "and", final: false }]));
    expect(r.committed).toBe("chest pain");
  });
});

describe("describeError", () => {
  it("tells someone how to fix a blocked microphone", () => {
    expect(describeError("not-allowed")).toContain("site settings");
    expect(describeError("service-not-allowed")).toContain("site settings");
  });

  it("distinguishes silence from a missing device", () => {
    expect(describeError("no-speech")).toContain("didn't catch");
    expect(describeError("audio-capture")).toContain("No microphone");
  });

  it("always offers typing as the way out", () => {
    expect(describeError("something-new")).toContain("type instead");
  });
});
