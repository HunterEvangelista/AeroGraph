import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

const [runtime, tarballArgument] = process.argv.slice(2);
if (
  (runtime !== "bun" && runtime !== "node") ||
  tarballArgument === undefined ||
  process.argv.length !== 4
) {
  throw new Error("Usage: runtime-smoke.ts <bun|node> <package.tgz>");
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
  const invoke = (...args: ReadonlyArray<string>) =>
    runtime === "bun" ? ["bun", executable, ...args] : [executable, ...args];
  const version = (await run(invoke("--version"))).trim();
  if (version !== `aerograph v${manifest.version}`) {
    throw new Error(`Unexpected version: ${version}`);
  }
  await run(invoke("--help"));
  await run(invoke("init"));
  await run(invoke("doc", "create", "Runtime smoke", "--content", "portable sqlite marker"));
  const search = await run(invoke("doc", "list", "--search", "portable sqlite"));
  if (!search.includes("Runtime smoke")) throw new Error("Runtime FTS smoke test failed");
  await Promise.all(
    Array.from({ length: 4 }, (_, index) =>
      run(
        invoke(
          "doc",
          "create",
          `Concurrent runtime smoke ${index}`,
          "--content",
          `concurrent marker ${index}`,
          "--tags",
          "runtime/concurrency"
        )
      )
    )
  );
  const status = await run(invoke("status", "--verbose"));
  const expectedRuntime = runtime === "bun" ? "Runtime:    Bun " : "Runtime:    Node.js ";
  if (!status.includes(expectedRuntime)) {
    throw new Error(`Runtime diagnostics did not identify ${runtime}`);
  }
  const runtimeVersion =
    runtime === "bun" ? `Bun ${Bun.version}` : (await run(["node", "--version"])).trim();
  console.log(`${runtimeVersion} runtime smoke test passed: ${basename(tarball)}`);
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
