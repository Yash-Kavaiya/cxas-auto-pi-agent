import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { forgeDir, statePath, initState, loadState, saveState, setArtifact } from "../src/state.js";

let root: string;
const fixedNow = () => "2026-06-14T18:00:00.000Z";
beforeEach(() => { root = mkdtempSync(join(tmpdir(), "forge-state-")); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

describe("initState", () => {
  it("starts at intake with three not_reached gates", () => {
    const s = initState({ name: "Acme Support Assistant", type: "cxas" }, fixedNow);
    expect(s.phase.current).toBe("intake");
    expect(s.project.slug).toBe("acme-support-assistant");
    expect(s.project.type).toBe("cxas");
    expect(s.project.created).toBe("2026-06-14T18:00:00.000Z");
    expect(s.gates).toEqual({
      G1: { status: "not_reached" },
      G2: { status: "not_reached" },
      G3: { status: "not_reached" },
    });
    expect(s.improve).toEqual({ iteration: 0, maxIterations: 3 });
  });
  it("defaults type to general and respects maxIterations", () => {
    const s = initState({ name: "X", maxIterations: 5 }, fixedNow);
    expect(s.project.type).toBe("general");
    expect(s.improve.maxIterations).toBe(5);
  });
});

describe("save/load round-trip", () => {
  it("persists to .pi-forge/state.json and reloads identically", () => {
    const s = initState({ name: "Round Trip" }, fixedNow);
    saveState(root, s);
    expect(existsSync(statePath(root))).toBe(true);
    expect(existsSync(forgeDir(root))).toBe(true);
    expect(loadState(root)).toEqual(s);
  });
  it("throws a clear error when no state exists", () => {
    expect(() => loadState(root)).toThrow(/no pi-forge state/i);
  });
});

describe("setArtifact", () => {
  it("registers an artifact pointer immutably", () => {
    const s = initState({ name: "T" }, fixedNow);
    const next = setArtifact(s, "brief", "artifacts/brief.md");
    expect(s.artifacts).toEqual({}); // original unchanged
    expect(next.artifacts).toEqual({ brief: "artifacts/brief.md" });
  });
  it("overwrites an existing key", () => {
    const s = setArtifact(initState({ name: "T" }, fixedNow), "brief", "artifacts/old.md");
    const next = setArtifact(s, "brief", "artifacts/new.md");
    expect(next.artifacts).toEqual({ brief: "artifacts/new.md" });
  });
});
