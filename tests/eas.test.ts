import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { runBuild, runUpdate } from "../src/eas.js";
import type { ResolvedConfig } from "../src/config.js";

vi.mock("node:child_process", () => ({
  spawnSync: vi.fn(() => ({ status: 0 })),
  spawn: vi.fn(() => fakeChild(0)),
}));

/** Minimal stand-in for a spawned process that exits with `code`. */
function fakeChild(code: number) {
  const child = new EventEmitter() as EventEmitter & {
    stdout: null;
    stderr: null;
  };
  child.stdout = null;
  child.stderr = null;
  queueMicrotask(() => child.emit("close", code));
  return child;
}

describe("EAS release channel guards", () => {
  beforeEach(() => {
    vi.mocked(spawnSync).mockClear();
    vi.mocked(spawn).mockClear();
    vi.mocked(spawn).mockImplementation((() => fakeChild(0)) as never);
  });

  it("refuses native builds when the version channel does not match the target channel", async () => {
    const config = fixtureConfig("testflight");

    await expect(runBuild(config, "production")).rejects.toThrow(
      /Refusing to build 'production' while lib\/version\.ts channel is 'testflight'/,
    );
    expect(spawn).not.toHaveBeenCalled();
  });

  it("runs the matching EAS build target", async () => {
    const config = fixtureConfig("testflight");

    await expect(runBuild(config, "testflight")).resolves.toBeUndefined();
    expect(spawn).toHaveBeenCalledWith(
      "yarn",
      ["eas", "build", "--profile", "testflight", "--platform", "ios", "--auto-submit"],
      expect.objectContaining({ cwd: config.cwd, stdio: "inherit" }),
    );
  });

  it("uses the per-platform profile override when one is configured", async () => {
    const config = fixtureConfig("testflight");
    config.platformProfiles = { testflight: { android: "testflight-android" } };

    await expect(runBuild(config, "testflight", { platform: "android" })).resolves
      .toBeUndefined();
    expect(spawn).toHaveBeenCalledWith(
      "yarn",
      expect.arrayContaining(["--profile", "testflight-android"]),
      expect.anything(),
    );
  });

  it("builds both platforms concurrently and reports one failure without losing the other", async () => {
    const config = fixtureConfig("testflight");
    vi.mocked(spawn).mockImplementation(((_cmd: string, args: string[]) =>
      fakeChild(args.includes("android") ? 1 : 0)) as never);

    await expect(runBuild(config, "testflight", { platform: "all" })).rejects.toThrow(
      /android failed/,
    );
    expect(spawn).toHaveBeenCalledTimes(2);
  });

  it("refuses OTA updates when the version channel does not match the target channel", () => {
    const config = fixtureConfig("testflight");

    expect(() => runUpdate(config, "production")).toThrow(
      /Refusing to publish OTA to 'production' while lib\/version\.ts channel is 'testflight'/,
    );
    expect(spawnSync).not.toHaveBeenCalled();
  });
});

function fixtureConfig(channel: string): ResolvedConfig {
  const cwd = mkdtempSync(join(tmpdir(), "eas-release-eas-"));
  mkdirSync(join(cwd, "lib"), { recursive: true });
  writeFileSync(
    join(cwd, "lib/version.ts"),
    `export const APP_VERSION = {
  version: "1.0.0",
  buildNumber: 2,
  otaVersion: 0,
  channel: "${channel}",
};`,
  );
  return {
    cwd,
    versionFile: "lib/version.ts",
    testflightProfile: "testflight",
    productionProfile: "production",
    testflightChannel: "testflight",
    productionChannel: "production",
    platformProfiles: {},
    defaultBuildPlatform: "ios",
    defaultUpdatePlatform: "ios",
    autoSubmit: true,
    parallelBuilds: true,
    distribute: {},
    requiredEnv: [],
    beforeBuildCommands: [],
    beforeUpdateCommands: [],
  };
}

describe("build parity", () => {
  beforeEach(() => {
    vi.mocked(spawnSync).mockClear();
    vi.mocked(spawn).mockClear();
    vi.mocked(spawn).mockImplementation((() => fakeChild(0)) as never);
  });

  /** `eas build:list --json` stub: which builds exist at which build number. */
  function withFinishedBuilds(byPlatform: Record<string, string[]>) {
    vi.mocked(spawnSync).mockImplementation(((cmd: string, args: string[]) => {
      if (args?.includes("build:list")) {
        const platform = args[args.indexOf("--platform") + 1];
        const versions = byPlatform[platform] ?? [];
        return {
          status: 0,
          stdout: JSON.stringify(
            versions.map((appBuildVersion) => ({ appBuildVersion })),
          ),
        };
      }
      return { status: 0, stdout: "" };
    }) as never);
  }

  function parityConfig() {
    const config = fixtureConfig("testflight");
    config.defaultBuildPlatform = "all";
    return config;
  }

  it("refuses a single platform when neither platform has the build", async () => {
    const config = parityConfig();
    withFinishedBuilds({ ios: [], android: [] });

    await expect(
      runBuild(config, "testflight", { platform: "android" }),
    ).rejects.toThrow(/strand ios on an older runtime/);
    expect(spawn).not.toHaveBeenCalled();
  });

  it("refuses a single platform when both platforms already have the build", async () => {
    const config = parityConfig();
    withFinishedBuilds({ ios: ["2"], android: ["2"] });

    await expect(
      runBuild(config, "testflight", { platform: "android" }),
    ).rejects.toThrow(/no drift to repair/);
    expect(spawn).not.toHaveBeenCalled();
  });

  it("allows a single platform that repairs drift", async () => {
    const config = parityConfig();
    withFinishedBuilds({ ios: ["2"], android: [] });

    await expect(
      runBuild(config, "testflight", { platform: "android" }),
    ).resolves.toBeUndefined();
    expect(spawn).toHaveBeenCalledWith(
      "yarn",
      expect.arrayContaining(["--platform", "android"]),
      expect.anything(),
    );
  });

  it("never blocks an all-platform build", async () => {
    const config = parityConfig();
    withFinishedBuilds({ ios: [], android: [] });

    await expect(
      runBuild(config, "testflight", { platform: "all" }),
    ).resolves.toBeUndefined();
    expect(spawn).toHaveBeenCalledTimes(2);
  });
});
