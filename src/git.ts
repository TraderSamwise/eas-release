import { spawnSync } from "node:child_process";

export function runGit(args: string[], cwd: string) {
  return spawnSync("git", args, {
    cwd,
    encoding: "utf8",
  });
}

export function isTracked(path: string, cwd: string) {
  const result = runGit(["ls-files", "--error-unmatch", path], cwd);
  return result.status === 0;
}

export function commitFiles(message: string, files: string[], cwd: string) {
  const result = runGit(["commit", "-m", message, "--no-verify", "--", ...files], cwd);
  if (result.status !== 0) {
    const detail = [result.stdout.trim(), result.stderr.trim()].filter(Boolean).join("\n");
    throw new Error(detail || "git commit failed");
  }
}
