import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

export function readExpoRuntimeVersion(cwd: string): string | undefined {
  const expoBin = localExpoBin(cwd);
  const result = spawnSync(expoBin.command, [...expoBin.args, "config", "--json"], {
    cwd,
    encoding: "utf8",
  });

  if (result.status !== 0) return undefined;

  return parseExpoRuntimeVersion(result.stdout);
}

export function parseExpoRuntimeVersion(output: string): string | undefined {
  try {
    const config = JSON.parse(output) as { runtimeVersion?: unknown };
    return typeof config.runtimeVersion === "string" ? config.runtimeVersion : undefined;
  } catch {
    return undefined;
  }
}

export function assertOtaRuntimeStable(before: string | undefined, after: string | undefined) {
  if (!before || !after || before === after) return;

  throw new Error(
    [
      "OTA version bump changed Expo runtimeVersion.",
      `Before: ${before}`,
      `After: ${after}`,
      "OTA updates only apply to installed native apps with the same runtimeVersion.",
      "Use a native-build-scoped runtime such as `${APP_VERSION.version}-${APP_VERSION.buildNumber}`.",
    ].join("\n"),
  );
}

function localExpoBin(cwd: string) {
  const direct = join(cwd, "node_modules", ".bin", process.platform === "win32" ? "expo.cmd" : "expo");
  if (existsSync(direct)) return { command: direct, args: [] };
  return { command: "npx", args: ["expo"] };
}
