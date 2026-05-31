import { spawnSync } from "node:child_process";
import { ResolvedConfig } from "./config.js";
import { checkRequiredEnv } from "./env.js";

export type ReleaseTarget = "testflight" | "production";
export type Platform = "ios" | "android" | "all";

export type BuildOptions = {
  platform?: Platform;
  autoSubmit?: boolean;
};

export type UpdateOptions = {
  platform?: Platform;
  clearCache?: boolean;
};

export function getProfile(config: ResolvedConfig, target: ReleaseTarget) {
  return target === "production" ? config.productionProfile : config.testflightProfile;
}

export function getChannel(config: ResolvedConfig, target: ReleaseTarget) {
  return target === "production" ? config.productionChannel : config.testflightChannel;
}

export function getEnvironment(config: ResolvedConfig, target: ReleaseTarget) {
  return target === "production" ? config.productionEnvironment : config.testflightEnvironment;
}

export function runBuild(config: ResolvedConfig, target: ReleaseTarget, options: BuildOptions = {}) {
  runPreflight(config, config.beforeBuildCommands);
  const profile = getProfile(config, target);
  const platform = options.platform ?? config.defaultBuildPlatform;
  const autoSubmit = options.autoSubmit ?? config.autoSubmit;
  const args = ["eas", "build", "--profile", profile];
  if (platform !== "all") {
    args.push("--platform", platform);
  }
  if (autoSubmit) {
    args.push("--auto-submit");
  }
  runYarn(args, config.cwd);
}

export function runUpdate(config: ResolvedConfig, target: ReleaseTarget, options: UpdateOptions = {}) {
  runPreflight(config, config.beforeUpdateCommands);
  const channel = getChannel(config, target);
  const platform = options.platform ?? config.defaultUpdatePlatform;
  const environment = getEnvironment(config, target);
  const args = ["eas", "update", "--branch", channel, "--platform", platform];
  if (environment) {
    args.push("--environment", environment);
  }
  if (options.clearCache) {
    args.push("--clear-cache");
  }
  runYarn(args, config.cwd);
}

function runPreflight(config: ResolvedConfig, commands: string[]) {
  checkRequiredEnv(config);
  if (config.checkReleaseEnvCommand) {
    runShell(config.checkReleaseEnvCommand, config.cwd);
  }
  for (const command of commands) {
    runShell(command, config.cwd);
  }
}

function runYarn(args: string[], cwd: string) {
  const result = spawnSync("yarn", args, {
    cwd,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`${["yarn", ...args].join(" ")} failed`);
  }
}

function runShell(command: string, cwd: string) {
  const result = spawnSync(command, {
    cwd,
    shell: true,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`${command} failed`);
  }
}
