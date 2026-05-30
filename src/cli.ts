#!/usr/bin/env node
import { Command } from "commander";
import { loadConfig } from "./config.js";
import { getChannel, ReleaseTarget, runBuild, runUpdate } from "./eas.js";
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

program
  .name("eas-release")
  .description("Small release CLI for Sam's Expo/EAS apps")
  .version("0.1.0");

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

program.command("rollback").action(() => {
  rollback(loadConfig());
});

program
  .command("build")
  .argument("[target]", "testflight or production", "testflight")
  .option("--platform <platform>", "ios, android, or all", "ios")
  .action((targetArg: string, options: { platform: string }) => {
    runBuild(loadConfig(), parseTarget(targetArg), parsePlatform(options.platform));
  });

program
  .command("update")
  .argument("[target]", "testflight or production", "testflight")
  .action((targetArg: string) => {
    runUpdate(loadConfig(), parseTarget(targetArg));
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
  console.log(`Current version: ${current.version} (${current.buildNumber}.${current.otaVersion})`);
  console.log(`New version: ${next.version} (${next.buildNumber}.${next.otaVersion})`);
  backupVersionFiles(config);
  try {
    writeVersion(config, next);
    if (updateNative) updateNativeVersion(config, next.buildNumber);
    commitVersion(config, commitMessage);
    cleanupBackups(config);
    console.log("Version changes committed");
  } catch (error) {
    cleanupBackups(config);
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

function parsePlatform(value: string) {
  if (value === "ios" || value === "android" || value === "all") return value;
  throw new Error(`Unknown platform: ${value}`);
}
