import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { nowIso } from "./util.js";
import { forgeDir } from "./state.js";

export function appendDecision(root: string, text: string, now: () => string = nowIso): void {
  mkdirSync(forgeDir(root), { recursive: true });
  const file = join(forgeDir(root), "decisions.md");
  if (!existsSync(file)) writeFileSync(file, "# Decisions\n\n");
  appendFileSync(file, `- ${now()} — ${text}\n`);
}

export function readMetrics(root: string): Record<string, unknown> {
  const file = join(forgeDir(root), "metrics.json");
  if (!existsSync(file)) return {};
  return JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
}

export function writeMetric(root: string, key: string, value: unknown): void {
  mkdirSync(forgeDir(root), { recursive: true });
  const metrics = readMetrics(root);
  metrics[key] = value;
  writeFileSync(join(forgeDir(root), "metrics.json"), JSON.stringify(metrics, null, 2));
}
