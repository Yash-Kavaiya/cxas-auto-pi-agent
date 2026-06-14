import { describe, it, expect } from "vitest";
import { initState } from "../src/state.js";
import { formatGateMessage, terminalChannel, fanOut, type NotifyChannel } from "../src/notifier.js";

const fixedNow = () => "2026-06-14T18:00:00.000Z";

describe("formatGateMessage", () => {
  it("includes gate id, project name, phase, and summary", () => {
    const s = initState({ name: "Acme Bot" }, fixedNow);
    s.phase.current = "clarify";
    const msg = formatGateMessage(s, "G1", "Ready to build?");
    expect(msg).toContain("G1");
    expect(msg).toContain("Acme Bot");
    expect(msg).toContain("clarify");
    expect(msg).toContain("Ready to build?");
  });
});

describe("terminalChannel + fanOut", () => {
  it("sends the message through an injected writer", async () => {
    const lines: string[] = [];
    const ch = terminalChannel((s) => lines.push(s));
    await fanOut([ch], "hello");
    expect(lines).toEqual(["hello"]);
  });
  it("fans out to every channel and tolerates one failing", async () => {
    const seen: string[] = [];
    const ok: NotifyChannel = { name: "ok", send: (m) => { seen.push(m); } };
    const bad: NotifyChannel = { name: "bad", send: () => { throw new Error("boom"); } };
    await fanOut([ok, bad, ok], "msg"); // must not throw
    expect(seen).toEqual(["msg", "msg"]);
  });
});
