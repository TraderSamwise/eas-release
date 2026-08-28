import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export type ReleaseTargetName = "testflight" | "production";
export type PlatformName = "ios" | "android";

export type FirebaseDistribution = {
  appId: string;
  project?: string;
  groups?: string[];
  testers?: string[];
  serviceAccountKeyPath?: string;
};

export type PlatformDistribution = {
  firebase?: FirebaseDistribution;
};

export type TargetDistribution = Partial<Record<PlatformName, PlatformDistribution>>;

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
    /**
     * Per-platform profile overrides. Needed whenever one platform's tester
     * artifact differs from the other's - an Android APK for Firebase App
     * Distribution cannot come from the same profile as an iOS store build.
     */
    platformProfiles?: Partial<
      Record<ReleaseTargetName, Partial<Record<PlatformName, string>>>
    >;
    defaultBuildPlatform?: "ios" | "android" | "all";
    defaultUpdatePlatform?: "ios" | "android" | "all";
    autoSubmit?: boolean;
    /** Build platforms concurrently when platform is "all". Defaults to true. */
    parallelBuilds?: boolean;
    testflightEnvironment?: string;
    productionEnvironment?: string;
  };
  distribute?: Partial<Record<ReleaseTargetName, TargetDistribution>>;
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
  platformProfiles: Partial<
    Record<ReleaseTargetName, Partial<Record<PlatformName, string>>>
  >;
  defaultBuildPlatform: "ios" | "android" | "all";
  defaultUpdatePlatform: "ios" | "android" | "all";
  autoSubmit: boolean;
  parallelBuilds: boolean;
  testflightEnvironment?: string;
  productionEnvironment?: string;
  distribute: Partial<Record<ReleaseTargetName, TargetDistribution>>;
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
    platformProfiles: config.eas?.platformProfiles ?? {},
    defaultBuildPlatform: config.eas?.defaultBuildPlatform ?? "ios",
    defaultUpdatePlatform: config.eas?.defaultUpdatePlatform ?? "ios",
    autoSubmit: config.eas?.autoSubmit ?? true,
    parallelBuilds: config.eas?.parallelBuilds ?? true,
    testflightEnvironment: config.eas?.testflightEnvironment,
    productionEnvironment: config.eas?.productionEnvironment,
    distribute: config.distribute ?? {},
    requiredEnv: config.env?.required ?? [],
    checkReleaseEnvCommand: config.commands?.checkReleaseEnv,
    beforeBuildCommands: config.commands?.beforeBuild ?? [],
    beforeUpdateCommands: config.commands?.beforeUpdate ?? [],
  };
}

export function resolveInCwd(config: ResolvedConfig, path: string) {
  return resolve(config.cwd, path);
}
