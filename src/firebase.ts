import { spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import { FirebaseDistribution, ResolvedConfig } from "./config.js";
import { readVersion } from "./version.js";

const DEFAULT_KEY_PATH = "credentials/firebase-distribute.json";

/**
 * Play has no TestFlight. Firebase App Distribution is the only Android channel
 * that emails testers per build and shows them which build they are on, so it
 * is the Android peer of iOS `--auto-submit`.
 */
export function distributeAndroid(
  config: ResolvedConfig,
  firebase: FirebaseDistribution,
) {
  const cli = firebaseBin();
  if (!cli) {
    throw new Error(
      "firebase CLI not found. Install it with: volta install firebase-tools",
    );
  }

  const keyPath = resolve(
    config.cwd,
    firebase.serviceAccountKeyPath ?? DEFAULT_KEY_PATH,
  );
  if (!existsSync(keyPath)) {
    throw new Error(`Firebase service account key not found at ${keyPath}`);
  }

  const build = latestFinishedAndroidBuild(config);
  const artifact =
    build.artifacts?.applicationArchiveUrl ?? build.artifacts?.buildUrl;
  if (!artifact) {
    throw new Error(`EAS build ${build.id} has no downloadable artifact.`);
  }
  if (extname(artifact) !== ".apk") {
    throw new Error(
      `Latest Android artifact is '${extname(artifact)}', not '.apk'. Firebase only ` +
        "accepts .aab when the Firebase project is linked to a Play developer " +
        "account; build an APK profile instead.",
    );
  }

  const version = readVersion(config);
  const notes = `${version.version} (${version.buildNumber}.${version.otaVersion})`;
  const localFile = join(
    tmpdir(),
    `eas-release-${version.buildNumber}-${build.id.slice(0, 8)}.apk`,
  );

  console.log(`Downloading Android artifact for ${notes}`);
  download(artifact, localFile);

  const args = [
    "appdistribution:distribute",
    localFile,
    "--app",
    firebase.appId,
    "--release-notes",
    notes,
  ];
  if (firebase.groups?.length) args.push("--groups", firebase.groups.join(","));
  if (firebase.testers?.length) args.push("--testers", firebase.testers.join(","));
  if (firebase.project) args.push("--project", firebase.project);

  const result = spawnSync(cli, args, {
    cwd: config.cwd,
    stdio: "inherit",
    env: { ...process.env, GOOGLE_APPLICATION_CREDENTIALS: keyPath },
  });
  rmSync(localFile, { force: true });

  if (result.status !== 0) {
    throw new Error("firebase appdistribution:distribute failed");
  }
  console.log(`Distributed ${notes} to Firebase App Distribution`);
}

function firebaseBin() {
  for (const candidate of [join(homedir(), ".volta", "bin", "firebase"), "firebase"]) {
    const probe = spawnSync(candidate, ["--version"], { encoding: "utf8" });
    if (probe.status === 0) return candidate;
  }
  return undefined;
}

type EasBuild = {
  id: string;
  artifacts?: { applicationArchiveUrl?: string; buildUrl?: string };
};

function latestFinishedAndroidBuild(config: ResolvedConfig): EasBuild {
  const result = spawnSync(
    "yarn",
    [
      "--silent",
      "eas",
      "build:list",
      "--platform",
      "android",
      "--status",
      "finished",
      "--limit",
      "1",
      "--json",
      "--non-interactive",
    ],
    { cwd: config.cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  if (result.status !== 0) {
    throw new Error("eas build:list failed while looking for the Android artifact");
  }
  const start = result.stdout.indexOf("[");
  if (start === -1) {
    throw new Error(`Could not parse eas build:list output:\n${result.stdout}`);
  }
  const builds = JSON.parse(result.stdout.slice(start)) as EasBuild[];
  if (!builds.length) throw new Error("No finished Android build found on EAS.");
  return builds[0];
}

function download(url: string, destination: string) {
  const result = spawnSync("curl", ["-sSL", "-o", destination, url], {
    stdio: "inherit",
  });
  if (result.status !== 0) throw new Error(`Failed to download ${url}`);
}
