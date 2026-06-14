import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { nowIso } from "./util.js";
import { forgeDir } from "./state.js";
import type { GateId } from "./types.js";

export interface InboxEntry {
  id: GateId;
  summary: string;
  at: string;
  resolve: string;
}

function inboxFile(root: string, id: GateId): string {
  return join(forgeDir(root), "inbox", `${id}.json`);
}

export function writeInbox(root: string, id: GateId, summary: string, now: () => string = nowIso): string {
  const dir = join(forgeDir(root), "inbox");
  mkdirSync(dir, { recursive: true });
  const entry: InboxEntry = { id, summary, at: now(), resolve: `/forge-approve ${id} approve` };
  const file = inboxFile(root, id);
  writeFileSync(file, JSON.stringify(entry, null, 2));
  return file;
}

export function readInbox(root: string, id: GateId): InboxEntry | null {
  const file = inboxFile(root, id);
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, "utf8")) as InboxEntry;
}

export function clearInbox(root: string, id: GateId): void {
  const file = inboxFile(root, id);
  if (existsSync(file)) rmSync(file);
}
