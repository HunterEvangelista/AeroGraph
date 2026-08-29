import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

const [tarballArgument] = process.argv.slice(2);
if (tarballArgument === undefined || process.argv.length !== 3) {
  throw new Error("Usage: runtime-smoke.ts <package.tgz>");
}

const tarball = resolve(tarballArgument);
const tempRoot = await mkdtemp(join(tmpdir(), "aerograph-runtime-smoke-"));
const installPrefix = join(tempRoot, "install");
const project = join(tempRoot, "project");
const home = join(tempRoot, "home");

const run = async (command: string[]) => {
  const child = Bun.spawn(command, {
    cwd: project,
    env: { ...Bun.env, AEROGRAPH_HOME: home, HOME: home },
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
  await run([
    "npm",
    "install",
    "--ignore-scripts",
    "--no-package-lock",
    "--prefix",
    installPrefix,
    tarball,
  ]);
  const installed = join(installPrefix, "node_modules", "aerograph");
  const manifest = JSON.parse(await readFile(join(installed, "package.json"), "utf8")) as {
    version: string;
  };
  const executable = join(installPrefix, "node_modules", ".bin", "aerograph");
  const version = (await run([executable, "--version"])).trim();
  if (version !== `aerograph v${manifest.version}`) {
    throw new Error(`Unexpected version: ${version}`);
  }
  await run([executable, "--help"]);
  await run([executable, "init"]);
  await run([executable, "status"]);
  console.log(`Bun ${Bun.version} runtime smoke test passed: ${basename(tarball)}`);
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
