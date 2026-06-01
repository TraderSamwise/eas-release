#!/usr/bin/env node
import { Command } from "commander";
import { createRequire } from "node:module";
import { loadConfig } from "./config.js";
import { getChannel, Platform, ReleaseTarget, runBuild, runUpdate } from "./eas.js";
import { assertOtaRuntimeStable, readExpoRuntimeVersion } from "./runtime.js";
import {
  backupVersionFiles,
  cleanupBackups,
  commitVersion,
  readVersion,
  rollback,
  updateNativeVersion,
  writeVersion,
} from "./version.js";

const program = new Command();
const require = createRequire(import.meta.url);
const packageJson = require("../package.json") as { version: string };

program
  .name("eas-release")
  .description("Small release CLI for Sam's Expo/EAS apps")
  .version(packageJson.version);

program.command("current").action(() => {
  const config = loadConfig();
  const version = readVersion(config);
  printCurrent(version);
});

program
  .command("bump-build")
  .argument("[target]", "release target", "testflight")
  .action((targetArg: string) => {
    const target = parseTarget(targetArg);
    const config = loadConfig();
    const current = readVersion(config);
    const next = {
      ...current,
      buildNumber: current.buildNumber + 1,
      otaVersion: 0,
      channel: getChannel(config, target),
    };
    runVersionUpdate(config, next, `chore: release Build ${next.buildNumber} (${next.channel})`, true);
  });

program
  .command("bump-ota")
  .argument("[target]", "release target", "testflight")
  .action((targetArg: string) => {
    const target = parseTarget(targetArg);
    const config = loadConfig();
    const current = readVersion(config);
    const next = {
      ...current,
      otaVersion: current.otaVersion + 1,
      channel: getChannel(config, target),
    };
    runVersionUpdate(config, next, `chore: OTA update v${next.otaVersion} for Build ${next.buildNumber}`, false);
  });

program
  .command("set")
  .argument("<version>", "BUILD.OTA, for example 2.1")
  .argument("[target]", "release target", "testflight")
  .action((versionArg: string, targetArg: string) => {
    const match = versionArg.match(/^([0-9]+)\.([0-9]+)$/);
    if (!match) throw new Error("Version must use BUILD.OTA format, for example 2.1");
    const target = parseTarget(targetArg);
    const config = loadConfig();
    const current = readVersion(config);
    const next = {
      ...current,
      buildNumber: Number(match[1]),
      otaVersion: Number(match[2]),
      channel: getChannel(config, target),
    };
    runVersionUpdate(config, next, `chore: set version to Build ${next.buildNumber}.${next.otaVersion} (${next.channel})`, true);
  });

program.command("sync").action(() => {
  const config = loadConfig();
  const current = readVersion(config);
  backupVersionFiles(config);
  try {
    writeVersion(config, current);
    updateNativeVersion(config, current.buildNumber);
    cleanupBackups(config);
    console.log(`Synced native files to Build ${current.buildNumber}`);
  } catch (error) {
    cleanupBackups(config);
    throw error;
  }
});

program.command("rollback").action(() => {
  rollback(loadConfig());
});

program
  .command("build")
  .argument("[target]", "testflight or production", "testflight")
  .option("--platform <platform>", "ios, android, or all")
  .option("--ios", "build iOS")
  .option("--android", "build Android")
  .option("--all", "build iOS and Android")
  .option("--no-auto-submit", "do not pass --auto-submit to EAS")
  .action((targetArg: string, options: PlatformOptions & { autoSubmit: boolean }) => {
    runBuild(loadConfig(), parseTarget(targetArg), {
      platform: resolvePlatformOption(options),
      autoSubmit: options.autoSubmit,
    });
  });

program
  .command("update")
  .argument("[target]", "testflight or production", "testflight")
  .option("--platform <platform>", "ios, android, or all")
  .option("--ios", "update iOS")
  .option("--android", "update Android")
  .option("--all", "update iOS and Android")
  .option("--clear-cache", "pass --clear-cache to EAS")
  .action((targetArg: string, options: PlatformOptions & { clearCache?: boolean }) => {
    runUpdate(loadConfig(), parseTarget(targetArg), {
      platform: resolvePlatformOption(options),
      clearCache: options.clearCache,
    });
  });

program.parseAsync().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});

function runVersionUpdate(
  config: ReturnType<typeof loadConfig>,
  next: ReturnType<typeof readVersion>,
  commitMessage: string,
  updateNative: boolean,
) {
  const current = readVersion(config);
  const runtimeBefore = updateNative ? undefined : readExpoRuntimeVersion(config.cwd);
  console.log(`Current version: ${current.version} (${current.buildNumber}.${current.otaVersion})`);
  console.log(`New version: ${next.version} (${next.buildNumber}.${next.otaVersion})`);
  backupVersionFiles(config);
  try {
    writeVersion(config, next);
    if (!updateNative) {
      assertOtaRuntimeStable(runtimeBefore, readExpoRuntimeVersion(config.cwd));
    }
    if (updateNative) updateNativeVersion(config, next.buildNumber);
    commitVersion(config, commitMessage);
    cleanupBackups(config);
    console.log("Version changes committed");
  } catch (error) {
    rollback(config);
    throw error;
  }
}

function printCurrent(version: ReturnType<typeof readVersion>) {
  console.log("Current version:");
  console.log(`  Marketing Version: ${version.version}`);
  console.log(`  Build Number: ${version.buildNumber}`);
  console.log(`  OTA Version: ${version.otaVersion}`);
  console.log(`  Channel: ${version.channel}`);
  console.log(`  Display: ${version.version} (${version.buildNumber}.${version.otaVersion})`);
}

function parseTarget(value: string): ReleaseTarget {
  if (value === "testflight" || value === "production") return value;
  throw new Error(`Unknown target: ${value}`);
}

function parsePlatform(value: string): Platform {
  if (value === "ios" || value === "android" || value === "all") return value;
  throw new Error(`Unknown platform: ${value}`);
}

type PlatformOptions = {
  platform?: string;
  ios?: boolean;
  android?: boolean;
  all?: boolean;
};

function resolvePlatformOption(options: PlatformOptions): Platform | undefined {
  if (options.platform) return parsePlatform(options.platform);
  if (options.ios) return "ios";
  if (options.android) return "android";
  if (options.all) return "all";
  return undefined;
}
