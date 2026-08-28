import { spawn, spawnSync } from "node:child_process";
import {
  PlatformName,
  ResolvedConfig,
  TargetDistribution,
} from "./config.js";
import { checkRequiredEnv } from "./env.js";
import { distributeAndroid } from "./firebase.js";
import { readVersion } from "./version.js";

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

/** iOS first, so a single-file change to this order stays deliberate. */
const PLATFORM_ORDER: PlatformName[] = ["ios", "android"];

export function getProfile(
  config: ResolvedConfig,
  target: ReleaseTarget,
  platform?: PlatformName,
) {
  const base =
    target === "production" ? config.productionProfile : config.testflightProfile;
  if (!platform) return base;
  return config.platformProfiles?.[target]?.[platform] ?? base;
}

export function getChannel(config: ResolvedConfig, target: ReleaseTarget) {
  return target === "production" ? config.productionChannel : config.testflightChannel;
}

export function getEnvironment(config: ResolvedConfig, target: ReleaseTarget) {
  return target === "production" ? config.productionEnvironment : config.testflightEnvironment;
}

export function getDistribution(
  config: ResolvedConfig,
  target: ReleaseTarget,
): TargetDistribution {
  return config.distribute?.[target] ?? {};
}

export async function runBuild(
  config: ResolvedConfig,
  target: ReleaseTarget,
  options: BuildOptions = {},
) {
  const channel = getChannel(config, target);
  assertVersionChannel(config, channel, `build '${target}'`, `version:bump-build ${target}`);
  runPreflight(config, target, config.beforeBuildCommands);

  const platform = options.platform ?? config.defaultBuildPlatform;
  const platforms: PlatformName[] =
    platform === "all" ? [...PLATFORM_ORDER] : [platform];

  if (platforms.length === 1) {
    assertRepairsDrift(config, target, platforms[0]);
    await buildPlatform(config, target, platforms[0], options, false);
    return;
  }

  if (!config.parallelBuilds) {
    for (const item of platforms) {
      await buildPlatform(config, target, item, options, false);
    }
    return;
  }

  // Concurrent, but isolated: one platform failing never cancels or fails the
  // other. Exit codes are aggregated only after both have settled.
  const results = await Promise.all(
    platforms.map(async (item) => {
      try {
        await buildPlatform(config, target, item, options, true);
        return { platform: item, error: undefined as Error | undefined };
      } catch (error) {
        return {
          platform: item,
          error: error instanceof Error ? error : new Error(String(error)),
        };
      }
    }),
  );

  console.log("\n──────── build summary ────────");
  for (const result of results) {
    console.log(
      result.error
        ? `${result.platform.padEnd(8)} FAILED  ${result.error.message}`
        : `${result.platform.padEnd(8)} OK`,
    );
  }

  const failed = results.filter((result) => result.error);
  if (failed.length) {
    throw new Error(
      `${failed.map((result) => result.platform).join(", ")} failed; see summary above`,
    );
  }
}

/**
 * Building is all or nothing. `buildNumber` is one counter shared by both
 * platforms and it derives `runtimeVersion`, so shipping a single platform
 * strands the other on an older runtime where it silently stops receiving OTA
 * updates. A single-platform build is therefore allowed only when it repairs
 * drift that already exists.
 */
function assertRepairsDrift(
  config: ResolvedConfig,
  target: ReleaseTarget,
  platform: PlatformName,
) {
  if (config.defaultBuildPlatform !== "all") return;

  const buildNumber = String(readVersion(config).buildNumber);
  const other: PlatformName = platform === "ios" ? "android" : "ios";
  const built = (item: PlatformName) =>
    finishedBuildExists(config, item, buildNumber);

  if (built(other) && !built(platform)) return;

  const run = `eas-release build ${target}`;
  throw new Error(
    built(platform)
      ? `Both platforms already have Build ${buildNumber}; there is no drift to repair. Building is all or nothing - run \`${run}\`.`
      : `Refusing to build only ${platform} at Build ${buildNumber}: ${other} has no build at that number either, so this would strand ${other} on an older runtime and stop its OTA updates. Building is all or nothing - run \`${run}\`.`,
  );
}

function finishedBuildExists(
  config: ResolvedConfig,
  platform: PlatformName,
  buildNumber: string,
) {
  const result = spawnSync(
    "yarn",
    [
      "--silent",
      "eas",
      "build:list",
      "--platform",
      platform,
      "--status",
      "finished",
      "--limit",
      "20",
      "--json",
      "--non-interactive",
    ],
    { cwd: config.cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  if (result.status !== 0) {
    throw new Error(`eas build:list failed while checking ${platform} builds`);
  }
  const start = result.stdout.indexOf("[");
  if (start === -1) return false;
  const builds = JSON.parse(result.stdout.slice(start)) as {
    appBuildVersion?: string;
  }[];
  return builds.some((build) => String(build.appBuildVersion) === buildNumber);
}

async function buildPlatform(
  config: ResolvedConfig,
  target: ReleaseTarget,
  platform: PlatformName,
  options: BuildOptions,
  prefixOutput: boolean,
) {
  const profile = getProfile(config, target, platform);
  const distribution = getDistribution(config, target)[platform];

  // A platform that distributes through its own channel must not also be
  // handed to `eas submit` - an APK bound for Firebase is not a store upload.
  const autoSubmit = (options.autoSubmit ?? config.autoSubmit) && !distribution;

  const args = ["eas", "build", "--profile", profile, "--platform", platform];
  if (autoSubmit) args.push("--auto-submit");
  if (prefixOutput) args.push("--non-interactive");

  await runYarnAsync(args, config.cwd, prefixOutput ? platform : undefined);

  if (distribution?.firebase) {
    distributeAndroid(config, distribution.firebase);
  }
}

export function runUpdate(config: ResolvedConfig, target: ReleaseTarget, options: UpdateOptions = {}) {
  const channel = getChannel(config, target);
  const platform = options.platform ?? config.defaultUpdatePlatform;
  const environment = getEnvironment(config, target);
  const version = assertVersionChannel(config, channel, `publish OTA to '${channel}'`, `version:bump-ota ${target}`);
  runPreflight(config, target, config.beforeUpdateCommands);

  const platformLabel = platform === "all" ? "OTA Update" : `${platform.toUpperCase()} OTA Update`;
  const message = `${platformLabel} v${version.otaVersion} for Build ${version.buildNumber} (${target === "production" ? "Production" : "TestFlight"})`;
  const args = ["eas", "update", "--branch", channel, "--platform", platform, "--message", message];
  if (environment) {
    args.push("--environment", environment);
  }
  if (options.clearCache) {
    args.push("--clear-cache");
  }
  runYarn(args, config.cwd);
}

function assertVersionChannel(
  config: ResolvedConfig,
  expectedChannel: string,
  action: string,
  versionCommand: string,
) {
  const version = readVersion(config);
  if (version.channel !== expectedChannel) {
    throw new Error(
      `Refusing to ${action} while ${config.versionFile} channel is '${version.channel}'. Run ${versionCommand} first, or set the version channel intentionally.`,
    );
  }
  return version;
}

function runPreflight(config: ResolvedConfig, target: ReleaseTarget, commands: string[]) {
  checkRequiredEnv(config);
  if (config.checkReleaseEnvCommand) {
    runShell(formatCommand(config.checkReleaseEnvCommand, target), config.cwd);
  }
  for (const command of commands) {
    runShell(formatCommand(command, target), config.cwd);
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

function runYarnAsync(args: string[], cwd: string, prefix?: string) {
  return new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn("yarn", args, {
      cwd,
      stdio: prefix ? ["ignore", "pipe", "pipe"] : "inherit",
    });

    if (prefix) {
      pipePrefixed(child.stdout, prefix, process.stdout);
      pipePrefixed(child.stderr, prefix, process.stderr);
    }

    child.on("error", rejectPromise);
    child.on("close", (code) => {
      if (code === 0) resolvePromise();
      else rejectPromise(new Error(`${["yarn", ...args].join(" ")} exited ${code}`));
    });
  });
}

function pipePrefixed(
  stream: NodeJS.ReadableStream | null,
  prefix: string,
  out: NodeJS.WritableStream,
) {
  if (!stream) return;
  let buffer = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk: string) => {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) out.write(`[${prefix}] ${line}\n`);
  });
  stream.on("end", () => {
    if (buffer) out.write(`[${prefix}] ${buffer}\n`);
  });
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

function formatCommand(command: string, target: ReleaseTarget) {
  return command.replaceAll("{target}", target);
}
