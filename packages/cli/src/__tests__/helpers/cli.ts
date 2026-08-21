import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface CliResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

export interface CliWorkspaceOptions {
  /** Seed the term-governance fixture in addition to the baseline query data. */
  readonly seedTerms?: boolean;
}

export interface CliWorkspace {
  readonly rootPath: string;
  readonly aerographHome: string;
  readonly dbPath: string;
  readonly run: (...args: ReadonlyArray<string>) => CliResult;
  readonly runAsync: (...args: ReadonlyArray<string>) => Promise<CliResult>;
  readonly cleanup: () => void;
}

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const cliEntrypoint = join(packageRoot, "src/cli.ts");
const seedQueryFixtureEntrypoint = join(packageRoot, "src/__tests__/helpers/seed-query-fixture.ts");
const seedTermFixtureEntrypoint = join(packageRoot, "src/__tests__/helpers/term-cli-fixture.ts");

const runBun = (
  args: ReadonlyArray<string>,
  cwd: string,
  environment: NodeJS.ProcessEnv
): CliResult => {
  const result = spawnSync("bun", args, {
    cwd,
    encoding: "utf8",
    env: environment,
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

const runBunAsync = (
  args: ReadonlyArray<string>,
  cwd: string,
  environment: NodeJS.ProcessEnv
): Promise<CliResult> =>
  new Promise((resolve, reject) => {
    const child = spawn("bun", args, {
      cwd,
      env: environment,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (status) => {
      resolve({
        status,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      } satisfies CliResult);
    });
  });

export const createCliWorkspace = (options: CliWorkspaceOptions = {}): CliWorkspace => {
  const rootPath = realpathSync.native(mkdtempSync(join(tmpdir(), "aerograph-cli-test-")));
  const aerographHome = mkdtempSync(join(tmpdir(), "aerograph-home-test-"));
  const environment = {
    ...process.env,
    AEROGRAPH_HOME: aerographHome,
  };

  const init = runBun(["run", cliEntrypoint, "init", rootPath], packageRoot, environment);
  if (init.status !== 0) {
    rmSync(rootPath, { recursive: true, force: true });
    rmSync(aerographHome, { recursive: true, force: true });
    throw new Error(`Failed to initialize CLI workspace:\n${init.stderr}\n${init.stdout}`);
  }

  // SAFETY: The successful init command wrote this versioned registry, and the required project
  // match is checked before any asserted field is used to construct the fixture database path.
  const registry = JSON.parse(readFileSync(join(aerographHome, "config.json"), "utf8")) as {
    projects: Array<{ id: string; rootPath: string }>;
  };
  const project = registry.projects.find((candidate) => candidate.rootPath === rootPath);
  if (!project) {
    rmSync(rootPath, { recursive: true, force: true });
    rmSync(aerographHome, { recursive: true, force: true });
    throw new Error(`Initialized project was not registered for ${rootPath}`);
  }
  const dbPath = join(aerographHome, "projects", project.id, "aerograph.db");

  const seed = runBun(
    ["run", seedQueryFixtureEntrypoint, dbPath, rootPath],
    packageRoot,
    environment
  );
  if (seed.status !== 0) {
    rmSync(rootPath, { recursive: true, force: true });
    rmSync(aerographHome, { recursive: true, force: true });
    throw new Error(`Failed to seed CLI workspace:\n${seed.stderr}\n${seed.stdout}`);
  }

  if (options.seedTerms) {
    const termSeed = runBun(["run", seedTermFixtureEntrypoint, dbPath], packageRoot, environment);
    if (termSeed.status !== 0) {
      rmSync(rootPath, { recursive: true, force: true });
      rmSync(aerographHome, { recursive: true, force: true });
      throw new Error(`Failed to seed term CLI workspace:\n${termSeed.stderr}\n${termSeed.stdout}`);
    }
  }

  return {
    rootPath,
    aerographHome,
    dbPath,
    run: (...args) => runBun(["run", cliEntrypoint, ...args], rootPath, environment),
    runAsync: (...args) => runBunAsync(["run", cliEntrypoint, ...args], rootPath, environment),
    cleanup: () => {
      rmSync(rootPath, { recursive: true, force: true });
      rmSync(aerographHome, { recursive: true, force: true });
    },
  } satisfies CliWorkspace;
};
