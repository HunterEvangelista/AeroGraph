import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

const [tarballArgument] = process.argv.slice(2);
if (tarballArgument === undefined || process.argv.length !== 3) {
  throw new Error("Usage: bun-only-smoke.ts <package.tgz>");
}

const tarball = resolve(tarballArgument);
const bunExecutable = process.execPath;
const tempRoot = await mkdtemp(join(tmpdir(), "aerograph-bun-only-smoke-"));
const runtimeBin = join(tempRoot, "bin");
const project = join(tempRoot, "project");
const installRoot = join(tempRoot, "install");
const home = join(tempRoot, "home");

const run = async (command: string[], cwd: string) => {
  const child = Bun.spawn(command, {
    cwd,
    env: {
      ...Bun.env,
      AEROGRAPH_HOME: home,
      HOME: home,
      // Only Bun is available. In particular, neither node nor npm can be
      // discovered by the package manager or the installed CLI.
      PATH: runtimeBin,
    },
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
  await Promise.all([
    mkdir(runtimeBin, { recursive: true }),
    mkdir(project, { recursive: true }),
    mkdir(installRoot, { recursive: true }),
  ]);
  await symlink(bunExecutable, join(runtimeBin, "bun"));
  await writeFile(
    join(installRoot, "package.json"),
    `${JSON.stringify(
      {
        private: true,
        dependencies: {
          aerograph: `file:${tarball}`,
        },
      },
      null,
      2
    )}\n`
  );
  await run([bunExecutable, "install", "--ignore-scripts"], installRoot);

  const invoke = (...args: ReadonlyArray<string>) => [
    bunExecutable,
    "x",
    "--bun",
    "aerograph",
    ...args,
  ];
  await run(invoke("--version"), installRoot);
  await run(invoke("init", project), installRoot);
  await run(invoke("status"), project);

  console.log(`Bun-only runtime smoke test passed: ${basename(tarball)}`);
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
