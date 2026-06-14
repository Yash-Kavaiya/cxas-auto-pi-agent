import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendDecision, writeMetric, readMetrics } from "../src/artifacts.js";

let root: string;
const fixedNow = () => "2026-06-14T22:00:00.000Z";
beforeEach(() => { root = mkdtempSync(join(tmpdir(), "forge-art-")); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

describe("appendDecision", () => {
  it("appends timestamped ADR lines to decisions.md", () => {
    appendDecision(root, "Chose vitest for tests", fixedNow);
    appendDecision(root, "Picked NodeNext modules", fixedNow);
    const md = readFileSync(join(root, ".pi-forge", "decisions.md"), "utf8");
    expect(md).toContain("- 2026-06-14T22:00:00.000Z — Chose vitest for tests");
    expect(md).toContain("- 2026-06-14T22:00:00.000Z — Picked NodeNext modules");
  });
});

describe("metrics", () => {
  it("merges keys into metrics.json and reads them", () => {
    writeMetric(root, "test", { passRate: 0.97 });
    writeMetric(root, "eval", { scorecard: 0.88 });
    expect(readMetrics(root)).toEqual({ test: { passRate: 0.97 }, eval: { scorecard: 0.88 } });
  });
});
