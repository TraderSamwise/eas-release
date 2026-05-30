import { spawnSync } from "node:child_process";
import { ResolvedConfig } from "./config.js";
import { checkRequiredEnv } from "./env.js";

export type ReleaseTarget = "testflight" | "production";

export function getProfile(config: ResolvedConfig, target: ReleaseTarget) {
  return target === "production" ? config.productionProfile : config.testflightProfile;
}

export function getChannel(config: ResolvedConfig, target: ReleaseTarget) {
  return target === "production" ? config.productionChannel : config.testflightChannel;
}

export function runBuild(config: ResolvedConfig, target: ReleaseTarget, platform: "ios" | "android" | "all") {
  checkRequiredEnv(config);
  const profile = getProfile(config, target);
  const args = ["eas", "build", "--profile", profile];
  if (platform !== "all") {
    args.push("--platform", platform);
  }
  runYarn(args, config.cwd);
}

export function runUpdate(config: ResolvedConfig, target: ReleaseTarget) {
  checkRequiredEnv(config);
  const channel = getChannel(config, target);
  runYarn(["eas", "update", "--channel", channel], config.cwd);
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
