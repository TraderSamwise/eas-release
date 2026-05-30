import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export type EasReleaseConfig = {
  versionFile?: string;
  versionJsFile?: string | false;
  native?: {
    ios?: {
      infoPlist?: string;
      pbxproj?: string;
    };
  };
  eas?: {
    testflightProfile?: string;
    productionProfile?: string;
    testflightChannel?: string;
    productionChannel?: string;
  };
  env?: {
    required?: string[];
  };
};

export type ResolvedConfig = {
  cwd: string;
  versionFile: string;
  versionJsFile?: string;
  infoPlist?: string;
  pbxproj?: string;
  testflightProfile: string;
  productionProfile: string;
  testflightChannel: string;
  productionChannel: string;
  requiredEnv: string[];
};

export function loadConfig(cwd = process.cwd()): ResolvedConfig {
  const configPath = resolve(cwd, "eas-release.config.json");
  const config = existsSync(configPath)
    ? (JSON.parse(readFileSync(configPath, "utf8")) as EasReleaseConfig)
    : {};

  const versionFile = config.versionFile ?? "lib/version.ts";
  const versionJsFile = config.versionJsFile === false ? undefined : config.versionJsFile;

  return {
    cwd,
    versionFile,
    versionJsFile,
    infoPlist: config.native?.ios?.infoPlist,
    pbxproj: config.native?.ios?.pbxproj,
    testflightProfile: config.eas?.testflightProfile ?? "testflight",
    productionProfile: config.eas?.productionProfile ?? "production",
    testflightChannel: config.eas?.testflightChannel ?? "testflight",
    productionChannel: config.eas?.productionChannel ?? "production",
    requiredEnv: config.env?.required ?? [],
  };
}

export function resolveInCwd(config: ResolvedConfig, path: string) {
  return resolve(config.cwd, path);
}
