import { describe, expect, it } from "vitest";
import { publicPageEvent } from "./public-analytics";

describe("public page counts", () => {
  it("removes query strings and fragments from an allowed discovery page", () => {
    expect(publicPageEvent({ type: "pageview", url: "https://www.nutritiscan.com/download?private=value#private" }))
      .toEqual({ type: "pageview", url: "https://www.nutritiscan.com/download" });
  });
  it("excludes health, research, account and authentication events", () => {
    for (const path of ["/chat", "/research", "/health", "/account", "/login", "/api/chat", "/unknown"]) {
      expect(publicPageEvent({ type: "pageview", url: `https://www.nutritiscan.com${path}?private=value` })).toBeNull();
    }
    expect(publicPageEvent({ type: "event", url: "https://www.nutritiscan.com/" })).toBeNull();
    expect(publicPageEvent({ type: "pageview", url: "https://preview.vercel.app/" })).toBeNull();
  });
});
