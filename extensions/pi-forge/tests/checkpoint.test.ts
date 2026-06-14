import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initState } from "../src/state.js";
import { writeCheckpoint } from "../src/checkpoint.js";

let root: string;
const fixedNow = () => "2026-06-14T20:00:00.000Z";
beforeEach(() => { root = mkdtempSync(join(tmpdir(), "forge-ckpt-")); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

describe("writeCheckpoint", () => {
  it("writes a numbered, labelled snapshot and increments the index", () => {
    const s = initState({ name: "T" }, fixedNow);
    const f1 = writeCheckpoint(root, s, "advance->clarify", fixedNow);
    const f2 = writeCheckpoint(root, s, "advance->build", fixedNow);
    expect(f1).toMatch(/0000-advance-clarify\.json$/);
    expect(f2).toMatch(/0001-advance-build\.json$/);
    const dir = join(root, ".pi-forge", "checkpoints");
    expect(readdirSync(dir).sort()).toEqual(["0000-advance-clarify.json", "0001-advance-build.json"]);
    const snap = JSON.parse(readFileSync(f1, "utf8"));
    expect(snap.label).toBe("advance->clarify");
    expect(snap.at).toBe("2026-06-14T20:00:00.000Z");
    expect(snap.state.phase.current).toBe("intake");
  });
});
