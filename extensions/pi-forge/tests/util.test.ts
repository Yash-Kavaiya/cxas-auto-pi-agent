import { describe, it, expect } from "vitest";
import { slugify, nowIso } from "../src/util.js";

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Acme Support Assistant")).toBe("acme-support-assistant");
  });
  it("collapses non-alphanumerics and trims hyphens", () => {
    expect(slugify("  Hello,  World!! ")).toBe("hello-world");
  });
  it("handles empty-ish input", () => {
    expect(slugify("***")).toBe("untitled");
  });
});

describe("nowIso", () => {
  it("returns an ISO-8601 UTC string", () => {
    expect(nowIso()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});
