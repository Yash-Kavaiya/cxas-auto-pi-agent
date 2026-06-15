import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface ChannelConfig {
  terminal: { enabled: boolean };
  webhook: { enabled: boolean; url: string; format: "slack" | "discord" };
  email: { enabled: boolean; to: string; via: "smtp" };
}

export interface ForgeConfig {
  channels: ChannelConfig;
  routing: { policy: Record<string, string> };
  bounds: { maxIterations: number; gateTimeoutHours: number };
  cxas: { binPath: string };
}

export const DEFAULT_CONFIG: ForgeConfig = {
  channels: {
    terminal: { enabled: true },
    webhook: { enabled: false, url: "${FORGE_WEBHOOK_URL}", format: "slack" },
    email: { enabled: false, to: "", via: "smtp" },
  },
  routing: {
    policy: {
      intake: "gemini/gemini-2.0-flash",
      clarify: "gemini/gemini-2.0-flash",
      build: "anthropic/claude-opus-4-8",
      test: "anthropic/claude-sonnet-4-6",
      evaluate: "gemini/gemini-2.0-pro",
      improve: "anthropic/claude-opus-4-8",
      deliver: "anthropic/claude-sonnet-4-6",
      fallback: "openai/gpt-4o",
      sensitive: "ollama/llama3.1",
    },
  },
  bounds: { maxIterations: 3, gateTimeoutHours: 72 },
  cxas: { binPath: "cxas" },
};

function configPath(root: string): string {
  return join(root, ".pi-forge", "config.json");
}

export function loadConfig(root: string): ForgeConfig {
  const path = configPath(root);
  if (!existsSync(path)) return DEFAULT_CONFIG;
  const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<ForgeConfig>;
  return {
    channels: { ...DEFAULT_CONFIG.channels, ...(raw.channels ?? {}) },
    routing: {
      policy: { ...DEFAULT_CONFIG.routing.policy, ...(raw.routing?.policy ?? {}) },
    },
    bounds: { ...DEFAULT_CONFIG.bounds, ...(raw.bounds ?? {}) },
    cxas: { ...DEFAULT_CONFIG.cxas, ...(raw.cxas ?? {}) },
  };
}

export function resolveEnv(value: string): string {
  return value.replace(/\$\{([A-Z0-9_]+)\}/g, (_m, name: string) => process.env[name] ?? "");
}

export function routeFor(
  config: ForgeConfig,
  phase: string,
  overrides: Record<string, string>,
): string {
  // Final literal keeps the return type `string` under noUncheckedIndexedAccess;
  // it equals DEFAULT_CONFIG's fallback so behaviour is unchanged when a config is present.
  return (
    overrides[phase] ??
    config.routing.policy[phase] ??
    config.routing.policy.fallback ??
    "openai/gpt-4o"
  );
}
