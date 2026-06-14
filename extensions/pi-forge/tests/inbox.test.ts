import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeInbox, readInbox, clearInbox } from "../src/inbox.js";

let root: string;
const fixedNow = () => "2026-06-14T21:00:00.000Z";
beforeEach(() => { root = mkdtempSync(join(tmpdir(), "forge-inbox-")); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

describe("inbox", () => {
  it("writes a pending gate and reads it back", () => {
    const f = writeInbox(root, "G1", "Ready to build?", fixedNow);
    expect(existsSync(f)).toBe(true);
    const entry = readInbox(root, "G1");
    expect(entry).toEqual({
      id: "G1",
      summary: "Ready to build?",
      at: "2026-06-14T21:00:00.000Z",
      resolve: "/forge-approve G1 approve",
    });
  });
  it("returns null for a missing entry and clears existing ones", () => {
    expect(readInbox(root, "G2")).toBeNull();
    writeInbox(root, "G2", "x", fixedNow);
    clearInbox(root, "G2");
    expect(readInbox(root, "G2")).toBeNull();
  });
});
