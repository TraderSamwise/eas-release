import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ResolvedConfig } from "./config.js";

export function loadDotEnv(config: ResolvedConfig) {
  const path = resolve(config.cwd, ".env");
  if (!existsSync(path)) return {};
  const values: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index <= 0) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
    values[key] = value;
  }
  return values;
}

export function checkRequiredEnv(config: ResolvedConfig) {
  const env = { ...loadDotEnv(config), ...process.env };
  const missing = config.requiredEnv.filter((key) => !env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required env vars:\n${missing.map((key) => `  - ${key}`).join("\n")}`);
  }
}
