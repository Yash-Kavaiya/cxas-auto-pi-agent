import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { nowIso } from "./util.js";
import { forgeDir } from "./state.js";
import type { ForgeState } from "./types.js";

export function writeCheckpoint(
  root: string,
  state: ForgeState,
  label: string,
  now: () => string = nowIso,
): string {
  const dir = join(forgeDir(root), "checkpoints");
  mkdirSync(dir, { recursive: true });
  const count = readdirSync(dir).filter((f) => f.endsWith(".json")).length;
  const idx = String(count).padStart(4, "0");
  const safeLabel = label.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "");
  const file = join(dir, `${idx}-${safeLabel}.json`);
  writeFileSync(file, JSON.stringify({ at: now(), label, state }, null, 2));
  return file;
}
