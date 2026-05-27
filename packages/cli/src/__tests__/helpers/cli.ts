import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface CliResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

export interface CliWorkspace {
  readonly rootPath: string;
  readonly run: (...args: ReadonlyArray<string>) => CliResult;
  readonly cleanup: () => void;
}

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const cliEntrypoint = join(packageRoot, "src/index.ts");
const seedQueryFixtureEntrypoint = join(packageRoot, "src/__tests__/helpers/seed-query-fixture.ts");

const runBun = (args: ReadonlyArray<string>, cwd: string): CliResult => {
  const result = spawnSync("bun", args, {
    cwd,
    encoding: "utf8",
    shell: false,
  });

  if (result.error) {
    throw result.error;
  }

  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  } satisfies CliResult;
};

export const createCliWorkspace = (): CliWorkspace => {
  const rootPath = mkdtempSync(join(tmpdir(), "kioku-cli-test-"));
  const kiokuPath = join(rootPath, ".kioku");
  mkdirSync(kiokuPath);
  writeFileSync(
    join(kiokuPath, "config.json"),
    JSON.stringify(
      {
        version: 1,
        createdAt: "2026-01-01T00:00:00.000Z",
        repoPath: rootPath,
      },
      null,
      2
    )
  );

  const seed = runBun(["run", seedQueryFixtureEntrypoint, rootPath], packageRoot);
  if (seed.status !== 0) {
    rmSync(rootPath, { recursive: true, force: true });
    throw new Error(`Failed to seed CLI workspace:\n${seed.stderr}\n${seed.stdout}`);
  }

  return {
    rootPath,
    run: (...args) => runBun(["run", cliEntrypoint, ...args], rootPath),
    cleanup: () => rmSync(rootPath, { recursive: true, force: true }),
  } satisfies CliWorkspace;
};
