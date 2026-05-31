import { mkdtempSync, cpSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { backupVersionFiles, cleanupBackups, commitVersion, readVersion, updateNativeVersion, writeVersion } from "../src/version.js";

const root = resolve(import.meta.dirname, "..");

describe("version management", () => {
  it("commits generated ignored native projects without passing native pathspecs", () => {
    const cwd = copyFixture("generated-ios");
    mkdirSync(join(cwd, "ios/demo"), { recursive: true });
    mkdirSync(join(cwd, "ios/demo.xcodeproj"), { recursive: true });
    writeFileSync(join(cwd, "ios/demo/Info.plist"), "<plist></plist>");
    writeFileSync(join(cwd, "ios/demo.xcodeproj/project.pbxproj"), "CURRENT_PROJECT_VERSION = 2;");
    initRepo(cwd);

    const config = loadConfig(cwd);
    const current = readVersion(config);
    backupVersionFiles(config);
    writeVersion(config, { ...current, otaVersion: 1 });
    expect(() => commitVersion(config, "chore: OTA update v1 for Build 2")).not.toThrow();
    cleanupBackups(config);

    expect(git(cwd, ["show", "--name-only", "--format=", "HEAD"]).stdout.trim()).toBe("lib/version.ts");
  });

  it("includes tracked native files when bumping native build versions", () => {
    const cwd = copyFixture("tracked-ios");
    initRepo(cwd);

    const config = loadConfig(cwd);
    const current = readVersion(config);
    backupVersionFiles(config);
    writeVersion(config, { ...current, buildNumber: 3, otaVersion: 0 });
    updateNativeVersion(config, 3);
    commitVersion(config, "chore: release Build 3");
    cleanupBackups(config);

    const committed = git(cwd, ["show", "--name-only", "--format=", "HEAD"]).stdout.trim().split("\n");
    expect(committed).toContain("lib/version.ts");
    expect(committed).toContain("ios/demo.xcodeproj/project.pbxproj");
    expect(readFileSync(join(cwd, "ios/demo.xcodeproj/project.pbxproj"), "utf8")).toContain("CURRENT_PROJECT_VERSION = 3;");
  });

  it("updates tracked Android versionCode when syncing native build versions", () => {
    const cwd = copyFixture("tracked-android");
    initRepo(cwd);

    const config = loadConfig(cwd);
    const current = readVersion(config);
    backupVersionFiles(config);
    writeVersion(config, { ...current, buildNumber: 3, otaVersion: 0 });
    updateNativeVersion(config, 3);
    commitVersion(config, "chore: release Build 3");
    cleanupBackups(config);

    const committed = git(cwd, ["show", "--name-only", "--format=", "HEAD"]).stdout.trim().split("\n");
    expect(committed).toContain("lib/version.ts");
    expect(committed).toContain("android/app/build.gradle");
    expect(readFileSync(join(cwd, "android/app/build.gradle"), "utf8")).toContain("versionCode 3");
  });
});

function copyFixture(name: string) {
  const cwd = mkdtempSync(join(tmpdir(), `eas-release-${name}-`));
  cpSync(join(root, "fixtures", name), cwd, { recursive: true });
  return cwd;
}

function initRepo(cwd: string) {
  git(cwd, ["init"]);
  git(cwd, ["config", "user.email", "test@example.com"]);
  git(cwd, ["config", "user.name", "Test User"]);
  git(cwd, ["add", "."]);
  git(cwd, ["commit", "-m", "initial"]);
}

function git(cwd: string, args: string[]) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error([result.stdout, result.stderr].filter(Boolean).join("\n"));
  }
  return result;
}
