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
    android?: {
      buildGradle?: string;
    };
  };
  eas?: {
    testflightProfile?: string;
    productionProfile?: string;
    testflightChannel?: string;
    productionChannel?: string;
    defaultBuildPlatform?: "ios" | "android" | "all";
    defaultUpdatePlatform?: "ios" | "android" | "all";
    autoSubmit?: boolean;
    testflightEnvironment?: string;
    productionEnvironment?: string;
  };
  env?: {
    required?: string[];
  };
  commands?: {
    checkReleaseEnv?: string;
    beforeBuild?: string[];
    beforeUpdate?: string[];
  };
};

export type ResolvedConfig = {
  cwd: string;
  versionFile: string;
  versionJsFile?: string;
  infoPlist?: string;
  pbxproj?: string;
  buildGradle?: string;
  testflightProfile: string;
  productionProfile: string;
  testflightChannel: string;
  productionChannel: string;
  defaultBuildPlatform: "ios" | "android" | "all";
  defaultUpdatePlatform: "ios" | "android" | "all";
  autoSubmit: boolean;
  testflightEnvironment?: string;
  productionEnvironment?: string;
  requiredEnv: string[];
  checkReleaseEnvCommand?: string;
  beforeBuildCommands: string[];
  beforeUpdateCommands: string[];
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
    buildGradle: config.native?.android?.buildGradle,
    testflightProfile: config.eas?.testflightProfile ?? "testflight",
    productionProfile: config.eas?.productionProfile ?? "production",
    testflightChannel: config.eas?.testflightChannel ?? "testflight",
    productionChannel: config.eas?.productionChannel ?? "production",
    defaultBuildPlatform: config.eas?.defaultBuildPlatform ?? "ios",
    defaultUpdatePlatform: config.eas?.defaultUpdatePlatform ?? "ios",
    autoSubmit: config.eas?.autoSubmit ?? true,
    testflightEnvironment: config.eas?.testflightEnvironment,
    productionEnvironment: config.eas?.productionEnvironment,
    requiredEnv: config.env?.required ?? [],
    checkReleaseEnvCommand: config.commands?.checkReleaseEnv,
    beforeBuildCommands: config.commands?.beforeBuild ?? [],
    beforeUpdateCommands: config.commands?.beforeUpdate ?? [],
  };
}

export function resolveInCwd(config: ResolvedConfig, path: string) {
  return resolve(config.cwd, path);
}
