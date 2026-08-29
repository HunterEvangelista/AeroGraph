import { compareSemver } from "./release-trigger";

export function assertAlphaTagAdvances(candidate: string, currentAlpha: string): void {
  if (compareSemver(candidate, currentAlpha) <= 0) {
    throw new Error(
      `Refusing to move the npm alpha tag backward or sideways: ${currentAlpha} -> ${candidate}`
    );
  }
}

if (import.meta.main) {
  const [candidate, currentAlpha] = process.argv.slice(2);
  if (candidate === undefined || currentAlpha === undefined || process.argv.length !== 4) {
    throw new Error("Usage: registry-tag-guard.ts <candidate-version> <current-alpha-version>");
  }
  assertAlphaTagAdvances(candidate, currentAlpha);
  console.log(`npm alpha tag advances: ${currentAlpha} -> ${candidate}`);
}
