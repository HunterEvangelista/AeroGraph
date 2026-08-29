import { compareSemver } from "./release-trigger";

export function assertLatestTagAdvances(candidate: string, currentLatest: string): void {
  if (compareSemver(candidate, currentLatest) <= 0) {
    throw new Error(
      `Refusing to move the npm latest tag backward or sideways: ${currentLatest} -> ${candidate}`
    );
  }
}

if (import.meta.main) {
  const [candidate, currentLatest] = process.argv.slice(2);
  if (candidate === undefined || currentLatest === undefined || process.argv.length !== 4) {
    throw new Error("Usage: registry-tag-guard.ts <candidate-version> <current-latest-version>");
  }
  assertLatestTagAdvances(candidate, currentLatest);
  console.log(`npm latest tag advances: ${currentLatest} -> ${candidate}`);
}
