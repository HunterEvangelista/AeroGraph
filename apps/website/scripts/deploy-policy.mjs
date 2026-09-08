import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export function assertDeployment(environment, mainSha, checkoutSha) {
  if (
    environment.GITHUB_REPOSITORY !== "HunterEvangelista/AeroGraph" ||
    environment.GITHUB_EVENT_NAME !== "push" ||
    environment.GITHUB_REF !== "refs/heads/main"
  ) {
    throw new Error("Production deployment requires an upstream push to main.");
  }
  const sha = environment.GITHUB_SHA;
  if (!/^[a-f0-9]{40}$/.test(sha ?? "") || checkoutSha !== sha) {
    throw new Error("The checkout must match the full tested commit SHA.");
  }
  // The deployment lock serializes publishers; rejecting stale heads prevents late CI runs
  // and reruns from replacing a newer deployment. Main must prohibit force pushes.
  if (mainSha !== sha) {
    throw new Error("This revision is superseded. Use the CI run for the current main commit.");
  }
  for (const name of ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"]) {
    if (!environment[name]?.trim()) throw new Error(`Missing production credential: ${name}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
  try {
    const mainSha = git("ls-remote", "--exit-code", "origin", "refs/heads/main").split(/\s+/)[0];
    assertDeployment(process.env, mainSha, git("rev-parse", "HEAD"));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
