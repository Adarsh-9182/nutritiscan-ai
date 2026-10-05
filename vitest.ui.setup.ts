import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// Node 26 exposes its own localStorage accessor. Vitest's jsdom bridge can
// leave that accessor in front of jsdom's storage, so use deterministic
// browser storage for component tests.
const values = new Map<string, string>();
const storage = {
  get length() { return values.size; },
  clear: () => values.clear(),
  getItem: (key: string) => values.get(key) ?? null,
  key: (index: number) => [...values.keys()][index] ?? null,
  removeItem: (key: string) => values.delete(key),
  setItem: (key: string, value: string) => values.set(key, String(value)),
};
Object.defineProperty(window, "localStorage", { configurable: true, value: storage });
vi.stubGlobal("localStorage", storage);

afterEach(() => {
  cleanup();
  storage.clear();
});

/**
 * Browser APIs jsdom does not implement, stubbed to the shape the components
 * expect rather than to something permissive.
 *
 * `scrollTo` is a no-op here: the transcript's follow-the-stream behaviour is
 * about *when* it scrolls, which jsdom cannot measure (every element reports
 * zero height), so it is not what these tests are for.
 */
Element.prototype.scrollTo = vi.fn();

// `matchMedia` backs useReducedMotion. Answering "no preference" keeps the
// components on their normal animated path, which is the one users get.
vi.stubGlobal(
  "matchMedia",
  vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
);
