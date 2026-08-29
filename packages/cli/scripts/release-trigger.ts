import { appendFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";

export interface PackageManifest {
  name: string;
  version: string;
  publishConfig?: { tag?: string };
}

interface Semver {
  core: readonly [bigint, bigint, bigint];
  prerelease: readonly string[];
}

export interface PublishTransition {
  publish: boolean;
  version: string;
}

export function evaluatePublishTransition(
  previous: PackageManifest,
  current: PackageManifest
): PublishTransition {
  if (current.name !== "aerograph") {
    throw new Error(`Release automation only publishes aerograph, received ${current.name}`);
  }
  if (previous.name !== current.name) return { publish: false, version: current.version };

  const comparison = compareSemver(current.version, previous.version);
  if (comparison === 0) return { publish: false, version: current.version };
  if (comparison < 0) {
    throw new Error(
      `Refusing to publish version downgrade ${previous.version} -> ${current.version}`
    );
  }

  const parsed = parseSemver(current.version);
  if (
    parsed.prerelease.length !== 2 ||
    parsed.prerelease[0] !== "alpha" ||
    !isNumericIdentifier(parsed.prerelease[1])
  ) {
    throw new Error(
      `Release automation only publishes alpha versions, received ${current.version}`
    );
  }
  if (current.publishConfig?.tag !== "alpha") {
    throw new Error(
      `Release automation requires publishConfig.tag alpha, received ${current.publishConfig?.tag}`
    );
  }
  return { publish: true, version: current.version };
}

export function compareSemver(left: string, right: string): number {
  const a = parseSemver(left);
  const b = parseSemver(right);
  for (let index = 0; index < a.core.length; index += 1) {
    const leftPart = a.core[index];
    const rightPart = b.core[index];
    if (leftPart === undefined || rightPart === undefined) throw new Error("Invalid SemVer core");
    if (leftPart > rightPart) return 1;
    if (leftPart < rightPart) return -1;
  }

  if (a.prerelease.length === 0 && b.prerelease.length === 0) return 0;
  if (a.prerelease.length === 0) return 1;
  if (b.prerelease.length === 0) return -1;

  const length = Math.max(a.prerelease.length, b.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = a.prerelease[index];
    const rightPart = b.prerelease[index];
    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;
    if (leftPart === rightPart) continue;
    const leftNumeric = isNumericIdentifier(leftPart);
    const rightNumeric = isNumericIdentifier(rightPart);
    if (leftNumeric && rightNumeric) return BigInt(leftPart) > BigInt(rightPart) ? 1 : -1;
    if (leftNumeric) return -1;
    if (rightNumeric) return 1;
    return leftPart > rightPart ? 1 : -1;
  }
  return 0;
}

function parseSemver(value: string): Semver {
  const match =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.exec(
      value
    );
  if (match === null) throw new Error(`Invalid SemVer version: ${value}`);
  const major = match[1];
  const minor = match[2];
  const patch = match[3];
  if (major === undefined || minor === undefined || patch === undefined) {
    throw new Error(`Invalid SemVer version: ${value}`);
  }
  const prerelease = match[4]?.split(".") ?? [];
  if (
    prerelease.some((part) => isNumericIdentifier(part) && part.length > 1 && part.startsWith("0"))
  ) {
    throw new Error(`Invalid SemVer prerelease: ${value}`);
  }
  return { core: [BigInt(major), BigInt(minor), BigInt(patch)], prerelease };
}

function isNumericIdentifier(value: string | undefined): value is string {
  return value !== undefined && /^(0|[1-9]\d*)$/.test(value);
}

async function manifestAtRevision(revision: string): Promise<PackageManifest> {
  const child = Bun.spawn(["git", "show", `${revision}:packages/cli/package.json`], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (code !== 0) throw new Error(`Unable to read the previous CLI manifest:\n${stderr}`);
  return JSON.parse(stdout) as PackageManifest;
}

async function main(): Promise<void> {
  const [beforeRevision] = process.argv.slice(2);
  if (beforeRevision === undefined || process.argv.length !== 3) {
    throw new Error("Usage: release-trigger.ts <previous-main-revision>");
  }
  const manifestPath = resolve(import.meta.dir, "../package.json");
  const current = JSON.parse(await readFile(manifestPath, "utf8")) as PackageManifest;
  const previous = await manifestAtRevision(beforeRevision);
  const transition = evaluatePublishTransition(previous, current);
  console.log(
    transition.publish
      ? `CLI version increased: ${previous.version} -> ${current.version}`
      : previous.name === current.name
        ? `CLI version unchanged at ${current.version}; publication is not required.`
        : `Package identity changed from ${previous.name} to ${current.name}; publication waits for a version increment.`
  );

  const outputPath = process.env["GITHUB_OUTPUT"];
  if (outputPath !== undefined) {
    await appendFile(
      outputPath,
      `publish=${String(transition.publish)}\nversion=${transition.version}\n`
    );
  }
}

if (import.meta.main) await main();
