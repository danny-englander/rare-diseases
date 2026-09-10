// Reads git metadata for the currently checked-out commit, once at build
// time. Netlify does a real (if shallow) git clone before running the
// build, so `git log`/`git rev-parse` reflect the exact commit being
// deployed, not just whatever was in the last full CI run.
import { execSync } from "node:child_process";

function git(command: string): string {
  try {
    return execSync(command, {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

export const repoUrl = "https://github.com/danny-englander/rare-diseases";

const sha = git("git rev-parse HEAD") || process.env.COMMIT_REF || "";

export const commitSha = sha;
export const commitShortSha = sha.slice(0, 7);
export const commitMessage = git("git log -1 --format=%s");
export const commitDate = git("git log -1 --format=%cI");
export const commitUrl = sha ? `${repoUrl}/commit/${sha}` : repoUrl;
