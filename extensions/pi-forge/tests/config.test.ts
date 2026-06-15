import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_CONFIG, loadConfig, resolveEnv, routeFor } from "../src/config.js";

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), "forge-cfg-")); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

describe("loadConfig", () => {
  it("returns defaults when no config file exists", () => {
    expect(loadConfig(root)).toEqual(DEFAULT_CONFIG);
  });
  it("merges a partial config file over defaults", () => {
    mkdirSync(join(root, ".pi-forge"), { recursive: true });
    writeFileSync(
      join(root, ".pi-forge", "config.json"),
      JSON.stringify({ bounds: { maxIterations: 5 } }),
    );
    const cfg = loadConfig(root);
    expect(cfg.bounds.maxIterations).toBe(5);
    expect(cfg.bounds.gateTimeoutHours).toBe(DEFAULT_CONFIG.bounds.gateTimeoutHours);
    expect(cfg.routing.policy.build).toBe(DEFAULT_CONFIG.routing.policy.build);
  });
});

describe("resolveEnv", () => {
  it("substitutes ${VAR} from process.env", () => {
    process.env.FORGE_TEST_VAR = "https://hooks.example/abc";
    expect(resolveEnv("${FORGE_TEST_VAR}")).toBe("https://hooks.example/abc");
    delete process.env.FORGE_TEST_VAR;
  });
  it("leaves plain strings untouched and blanks unknown vars", () => {
    expect(resolveEnv("plain")).toBe("plain");
    expect(resolveEnv("${FORGE_DOES_NOT_EXIST}")).toBe("");
  });
});

describe("routeFor", () => {
  it("prefers an override, then policy, then fallback", () => {
    expect(routeFor(DEFAULT_CONFIG, "build", {})).toBe(DEFAULT_CONFIG.routing.policy.build);
    expect(routeFor(DEFAULT_CONFIG, "build", { build: "ollama/llama3.1" })).toBe("ollama/llama3.1");
    expect(routeFor(DEFAULT_CONFIG, "nonexistent-phase", {})).toBe(DEFAULT_CONFIG.routing.policy.fallback);
  });
});

describe("cxas config", () => {
  it("defaults binPath to 'cxas'", () => {
    expect(DEFAULT_CONFIG.cxas.binPath).toBe("cxas");
    expect(loadConfig(root).cxas.binPath).toBe("cxas");
  });
  it("merges an override", () => {
    mkdirSync(join(root, ".pi-forge"), { recursive: true });
    writeFileSync(join(root, ".pi-forge", "config.json"), JSON.stringify({ cxas: { binPath: "/opt/cxas" } }));
    expect(loadConfig(root).cxas.binPath).toBe("/opt/cxas");
  });
  it("falls back to defaults on malformed config.json", () => {
    mkdirSync(join(root, ".pi-forge"), { recursive: true });
    writeFileSync(join(root, ".pi-forge", "config.json"), "{ not valid json,,,");
    expect(loadConfig(root)).toEqual(DEFAULT_CONFIG);
  });
});
