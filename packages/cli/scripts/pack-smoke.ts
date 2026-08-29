import { cp, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { assertNoExternalBundleImports } from "./bundle-imports";

const packageRoot = resolve(import.meta.dir, "..");
const sourceRoot = resolve(packageRoot, "../..");
const manifest = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8")) as {
  name: string;
  version: string;
};
const tempRoot = await mkdtemp(join(tmpdir(), "aerograph-pack-smoke-"));
const project = join(tempRoot, "checkout");
const installPrefix = join(tempRoot, "install");
const home = join(tempRoot, "home");
const outputDirectory = parseOutputDirectory(process.argv.slice(2));

const copy = async (relative: string) =>
  cp(join(sourceRoot, relative), join(project, relative), {
    recursive: true,
    verbatimSymlinks: true,
  });

const run = async (command: string[], cwd: string) => {
  const child = Bun.spawn(command, {
    cwd,
    env: { ...Bun.env, AEROGRAPH_HOME: home },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (code !== 0) throw new Error(`${command.join(" ")} failed (${code})\n${stdout}${stderr}`);
  return stdout;
};

try {
  await mkdir(project, { recursive: true });
  // This is intentionally a small checkout. In particular, generated output,
  // graph state, VCS metadata, and unrelated workspace packages never enter it.
  for (const file of ["package.json", "bun.lock", "tsconfig.json", "LICENSE"]) await copy(file);
  await copy("packages/core/package.json");
  await copy("packages/core/tsconfig.json");
  await copy("packages/core/src");
  for (const file of [
    "package.json",
    ".npmignore",
    "README.md",
    "bin",
    "src",
    "scripts",
    "tsconfig.json",
    "tsconfig.tests.json",
  ])
    await copy(`packages/cli/${file}`);

  // Copy only installed dependencies. A symlink would make Bun embed the
  // source checkout's absolute node_modules paths in the generated bundle.
  await cp(join(sourceRoot, "node_modules"), join(project, "node_modules"), {
    recursive: true,
    verbatimSymlinks: true,
  });

  // npm pack must be the first build in the isolated checkout so this test
  // exercises the complete prepack lifecycle, including the core build.
  const packOutput = await run(
    ["npm", "pack", "--json", "--pack-destination", tempRoot],
    join(project, "packages/cli")
  );
  const jsonStart = packOutput.indexOf("[");
  if (jsonStart < 0) throw new Error(`npm pack --json returned no JSON: ${packOutput}`);
  const packResult = JSON.parse(packOutput.slice(jsonStart)) as Array<{
    filename: string;
    files: Array<{ path: string }>;
  }>;
  if (packResult.length !== 1 || !packResult[0])
    throw new Error("npm pack did not return exactly one package");
  const tarball = join(tempRoot, packResult[0].filename);
  const listing = packResult[0].files.map(({ path }) => `package/${path}`).sort();
  const expected = [
    "package/LICENSE",
    "package/README.md",
    "package/THIRD_PARTY_LICENSES.md",
    "package/bin/aerograph",
    "package/dist/cli.js",
    "package/package.json",
  ];
  if (JSON.stringify(listing) !== JSON.stringify(expected))
    throw new Error(`npm pack files differ from allowlist:\n${listing.join("\n")}`);

  await run(
    ["npm", "install", "--ignore-scripts", "--no-package-lock", "--prefix", installPrefix, tarball],
    tempRoot
  );
  const installed = join(installPrefix, "node_modules", "aerograph");
  const packageJson = JSON.parse(await readFile(join(installed, "package.json"), "utf8")) as {
    license?: string;
    publishConfig?: { tag?: string };
  };
  if (packageJson.license !== "Apache-2.0" || packageJson.publishConfig?.tag !== "alpha")
    throw new Error("Tarball metadata must declare Apache-2.0 and publishConfig.tag alpha");
  const license = await readFile(join(installed, "LICENSE"), "utf8");
  if (!license.includes("Apache License") || !license.includes("TERMS AND CONDITIONS"))
    throw new Error("Invalid Apache license");
  const thirdParty = await readFile(join(installed, "THIRD_PARTY_LICENSES.md"), "utf8");
  if (
    !thirdParty.includes("@effect/platform-bun") ||
    !thirdParty.includes("Copyright © Hunter Evangelista")
  )
    throw new Error("Incomplete third-party attribution");
  const bundle = await readFile(join(installed, "dist/cli.js"), "utf8");
  assertNoExternalBundleImports(bundle);
  const forbidden = [
    bundle.includes('from "ws"') && "ws",
    bundle.includes("NodeSocketServer") && "NodeSocketServer",
    bundle.includes("msgpackr-extract") && "msgpackr-extract",
    bundle.includes(sourceRoot) && "source checkout path",
    bundle.includes(project) && "isolated checkout path",
    /\/(?:Users|home)\/[^\s"']+\/(?:repos|src|node_modules)\//.test(bundle) && "absolute path",
  ].filter(Boolean);
  if (forbidden.length)
    throw new Error(`Bundle contains forbidden content: ${forbidden.join(", ")}`);

  const executable = join(installPrefix, "node_modules", ".bin", "aerograph");
  const version = (await run([executable, "--version"], project)).trim();
  if (version !== `aerograph v${manifest.version}`)
    throw new Error(`Unexpected version: ${version}`);
  await run([executable, "--help"], project);
  await run([executable, "init"], project);
  await run([executable, "status"], project);

  if (outputDirectory !== undefined) {
    await mkdir(outputDirectory, { recursive: true });
    await cp(tarball, join(outputDirectory, packResult[0].filename));
  }
  console.log(`Packed CLI smoke test passed: ${packResult[0].filename}`);
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

function parseOutputDirectory(args: string[]): string | undefined {
  if (args.length === 0) return undefined;
  if (args.length !== 2 || args[0] !== "--output" || args[1] === undefined) {
    throw new Error("Usage: pack-smoke.ts [--output <directory>]");
  }
  return resolve(args[1]);
}
