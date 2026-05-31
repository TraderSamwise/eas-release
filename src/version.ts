import { copyFileSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { ResolvedConfig, resolveInCwd } from "./config.js";
import { commitFiles, isTracked } from "./git.js";

export type VersionInfo = {
  version: string;
  buildNumber: number;
  otaVersion: number;
  channel: string;
};

export function readVersion(config: ResolvedConfig): VersionInfo {
  const file = resolveInCwd(config, config.versionFile);
  if (!existsSync(file)) {
    throw new Error(`Version file not found: ${config.versionFile}`);
  }

  const source = readFileSync(file, "utf8");
  const version = matchString(source, /version:\s*["']([^"']+)["']/, "version");
  const buildNumber = matchNumber(source, /buildNumber:\s*([0-9]+)/, "buildNumber");
  const otaVersion = matchNumber(source, /otaVersion:\s*([0-9]+)/, "otaVersion");
  const channel = matchString(source, /channel:\s*["']([^"']+)["']/, "channel");
  return { version, buildNumber, otaVersion, channel };
}

export function writeVersion(config: ResolvedConfig, next: VersionInfo) {
  const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const ts = `// Auto-generated version file - DO NOT EDIT MANUALLY
// Use release scripts for new native builds or OTA updates

export const APP_VERSION = {
  version: "${next.version}", // Marketing version for app stores
  buildNumber: ${next.buildNumber}, // Native build number (increments only for native builds)
  otaVersion: ${next.otaVersion}, // OTA update version (increments for JS updates)
  timestamp: "${timestamp}", // Last update timestamp
  channel: "${next.channel}", // Release channel
};

export const getVersionString = () => {
  const { buildNumber, otaVersion } = APP_VERSION;
  const versionStr = \`\${APP_VERSION.version} (\${buildNumber}.\${otaVersion})\`;
  return versionStr;
};

export const getVersionCode = () => {
  return \`\${APP_VERSION.buildNumber}.\${APP_VERSION.otaVersion}\`;
};
`;

  writeFileSync(resolveInCwd(config, config.versionFile), ts);

  if (config.versionJsFile) {
    const js = ts
      .replace("export const APP_VERSION =", "const APP_VERSION =")
      .replace("export const getVersionString = () =>", "const getVersionString = () =>")
      .replace("export const getVersionCode = () =>", "const getVersionCode = () =>") +
      "\nmodule.exports = { APP_VERSION, getVersionString, getVersionCode };\n";
    writeFileSync(resolveInCwd(config, config.versionJsFile), js);
  }
}

export function updateNativeVersion(config: ResolvedConfig, buildNumber: number) {
  if (config.infoPlist && existsSync(resolveInCwd(config, config.infoPlist))) {
    if (process.platform !== "darwin") {
      throw new Error("Updating iOS native version files requires macOS.");
    }
    runChecked("/usr/libexec/PlistBuddy", ["-c", `Set :CFBundleVersion ${buildNumber}`, config.infoPlist], config.cwd);
  }

  if (config.pbxproj && existsSync(resolveInCwd(config, config.pbxproj))) {
    const path = resolveInCwd(config, config.pbxproj);
    const source = readFileSync(path, "utf8");
    writeFileSync(path, source.replace(/CURRENT_PROJECT_VERSION = [0-9]+;/g, `CURRENT_PROJECT_VERSION = ${buildNumber};`));
  }

  if (config.buildGradle && existsSync(resolveInCwd(config, config.buildGradle))) {
    const path = resolveInCwd(config, config.buildGradle);
    const source = readFileSync(path, "utf8");
    writeFileSync(path, source.replace(/versionCode [0-9]+/g, `versionCode ${buildNumber}`));
  }
}

export function backupVersionFiles(config: ResolvedConfig) {
  for (const file of versionManagedFiles(config, true)) {
    const abs = resolveInCwd(config, file);
    if (existsSync(abs)) {
      copyFileSync(abs, `${abs}.backup`);
    }
  }
}

export function cleanupBackups(config: ResolvedConfig) {
  for (const file of versionManagedFiles(config, true)) {
    rmSync(`${resolveInCwd(config, file)}.backup`, { force: true });
  }
}

export function rollback(config: ResolvedConfig) {
  let restored = 0;
  for (const file of versionManagedFiles(config, true)) {
    const abs = resolveInCwd(config, file);
    const backup = `${abs}.backup`;
    if (existsSync(backup)) {
      copyFileSync(backup, abs);
      rmSync(backup, { force: true });
      restored += 1;
      console.log(`Rolled back ${file}`);
    }
  }
  if (restored === 0) {
    console.log("No backup found");
  }
}

export function commitVersion(config: ResolvedConfig, message: string) {
  const files = versionManagedFiles(config, false).filter((file) => {
    if (file === config.versionFile || file === config.versionJsFile) return true;
    return isTracked(file, config.cwd);
  });
  commitFiles(message, files, config.cwd);
}

function versionManagedFiles(config: ResolvedConfig, includeNativeGenerated: boolean) {
  const files = [config.versionFile];
  if (config.versionJsFile) files.push(config.versionJsFile);
  for (const file of [config.infoPlist, config.pbxproj, config.buildGradle]) {
    if (file && (includeNativeGenerated || isTracked(file, config.cwd))) {
      files.push(file);
    }
  }
  return files;
}

function matchNumber(source: string, regex: RegExp, label: string) {
  const match = source.match(regex);
  if (!match?.[1]) throw new Error(`Could not read ${label} from version file`);
  return Number(match[1]);
}

function matchString(source: string, regex: RegExp, label: string) {
  const match = source.match(regex);
  if (!match?.[1]) throw new Error(`Could not read ${label} from version file`);
  return match[1];
}

function runChecked(command: string, args: string[], cwd: string) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `${command} failed`);
  }
}
