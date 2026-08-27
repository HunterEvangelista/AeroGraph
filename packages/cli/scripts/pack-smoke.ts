import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const packageRoot = resolve(import.meta.dir, "..");
const manifest = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8")) as {
  version: string;
};
const tempRoot = await mkdtemp(join(tmpdir(), "aerograph-pack-"));
const home = join(tempRoot, "home");
const project = join(tempRoot, "project");
const packageDir = join(tempRoot, "package");

const run = async (command: string[], cwd = tempRoot) => {
  const process = Bun.spawn(command, {
    cwd,
    env: { ...Bun.env, AEROGRAPH_HOME: home },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ]);
  if (exitCode !== 0)
    throw new Error(`${command.join(" ")} failed (${exitCode})\n${stdout}${stderr}`);
  return stdout;
};

try {
  // Remove any developer-produced artifact so npm pack's lifecycle build is
  // the only way the tarball can obtain dist/cli.js.
  await rm(resolve(packageRoot, "dist"), { recursive: true, force: true });
  await Bun.$`mkdir -p ${project} ${packageDir}`;
  // Plain npm pack must rebuild the bundle through the prepack lifecycle hook;
  // callers should not need to remember a separate build command.
  await run(["npm", "pack", "--pack-destination", tempRoot], packageRoot);
  const tarballs = (await readdir(tempRoot)).filter((entry) => entry.endsWith(".tgz"));
  if (tarballs.length !== 1)
    throw new Error(`Expected one packed tarball, found ${tarballs.length}`);
  const [tarballName] = tarballs;
  if (!tarballName) throw new Error("npm pack did not produce a tarball");
  const tarball = join(tempRoot, tarballName);
  const packageJson = JSON.parse(
    await run(["tar", "-xOf", tarball, "package/package.json"], tempRoot)
  ) as {
    license?: string;
  };
  if (packageJson.license !== "Apache-2.0")
    throw new Error(`Expected Apache-2.0 package metadata, got ${packageJson.license}`);
  const license = await run(["tar", "-xOf", tarball, "package/LICENSE"], tempRoot);
  if (!license.includes("Apache License") || !license.includes("TERMS AND CONDITIONS"))
    throw new Error("Tarball LICENSE is missing or is not Apache-2.0");
  const thirdParty = await run(
    ["tar", "-xOf", tarball, "package/THIRD_PARTY_LICENSES.md"],
    tempRoot
  );
  if (
    !thirdParty.includes("@effect/platform-bun") ||
    !thirdParty.includes("Copyright © Hunter Evangelista")
  )
    throw new Error("Tarball third-party license artifact is incomplete");
  const bundledArtifact = await run(["tar", "-xOf", tarball, "package/dist/cli.js"], tempRoot);
  const externalImports = [
    ...bundledArtifact.matchAll(/^import .* from ["']([^"']+)["'];?$/gm),
  ].flatMap((match) => {
    const specifier = match[1];
    if (
      specifier === undefined ||
      specifier.startsWith("node:") ||
      specifier.startsWith("bun:") ||
      [
        "child_process",
        "crypto",
        "fs",
        "fs/promises",
        "os",
        "path",
        "readline",
        "stream",
        "url",
      ].includes(specifier)
    ) {
      return [];
    }
    return [specifier];
  });
  if (externalImports.length > 0)
    throw new Error(`Bundle contains external package imports: ${externalImports.join(", ")}`);
  if (bundledArtifact.includes('from "ws"'))
    throw new Error("Bundle retains the optional Node ws import");
  if (bundledArtifact.includes(packageRoot)) {
    throw new Error(`Bundle contains checkout path: ${packageRoot}`);
  }
  if (/\/(?:Users|home)\/[^\s"']+\/(?:repos|src|node_modules)\//.test(bundledArtifact)) {
    throw new Error("Bundle contains an absolute checkout or user path");
  }
  await run([
    "npm",
    "install",
    "--ignore-scripts",
    "--no-package-lock",
    "--prefix",
    packageDir,
    tarball,
  ]);
  const executable = join(packageDir, "node_modules", ".bin", "aerograph");
  const versionOutput = (await run([executable, "--version"], project)).trim();
  const version = versionOutput.replace(/^aerograph v/, "");
  if (version !== manifest.version) {
    throw new Error(`Expected --version ${manifest.version}, got ${versionOutput}`);
  }
  await run([executable, "--help"], project);
  await run([executable, "init"], project);
  await run([executable, "status"], project);
  console.log(`Packed CLI smoke test passed: ${version}, --help, init, status`);
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
