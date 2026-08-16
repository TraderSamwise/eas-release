import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { runBuild, runUpdate } from "../src/eas.js";
import type { ResolvedConfig } from "../src/config.js";

vi.mock("node:child_process", () => ({
  spawnSync: vi.fn(() => ({ status: 0 })),
}));

describe("EAS release channel guards", () => {
  beforeEach(() => {
    vi.mocked(spawnSync).mockClear();
  });

  it("refuses native builds when the version channel does not match the target channel", () => {
    const config = fixtureConfig("testflight");

    expect(() => runBuild(config, "production")).toThrow(
      /Refusing to build 'production' while lib\/version\.ts channel is 'testflight'/,
    );
    expect(spawnSync).not.toHaveBeenCalledWith("yarn", expect.arrayContaining(["build"]), expect.anything());
  });

  it("runs the matching EAS build target", () => {
    const config = fixtureConfig("testflight");

    expect(() => runBuild(config, "testflight")).not.toThrow();
    expect(spawnSync).toHaveBeenCalledWith(
      "yarn",
      ["eas", "build", "--profile", "testflight", "--platform", "ios", "--auto-submit"],
      expect.objectContaining({ cwd: config.cwd, stdio: "inherit" }),
    );
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
    defaultBuildPlatform: "ios",
    defaultUpdatePlatform: "ios",
    autoSubmit: true,
    requiredEnv: [],
    beforeBuildCommands: [],
    beforeUpdateCommands: [],
  };
}
