import { afterEach, describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const cliEntrypoint = join(packageRoot, "src/cli.ts");
const temporaryRoots: string[] = [];

const runCli = (
  cwd: string,
  args: ReadonlyArray<string>,
  environment: NodeJS.ProcessEnv = process.env
) => {
  const result = spawnSync("bun", ["run", cliEntrypoint, ...args], {
    cwd,
    encoding: "utf8",
    env: environment,
    shell: false,
  });
  if (result.error) throw result.error;
  return result;
};

const runGit = (cwd: string, ...args: ReadonlyArray<string>) => {
  const result = spawnSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Git command failed: git -C ${cwd} ${args.join(" ")}\n${result.stderr}`);
  }
  return result;
};

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("AeroGraph branding", () => {
  it("exposes only the aerograph CLI name and binary", () => {
    const help = runCli(packageRoot, ["--help"]);

    expect(help.status).toBe(0);
    expect(help.stdout).toContain("USAGE\n  aerograph <subcommand>");
    expect(help.stdout).not.toContain("kioku <subcommand>");

    const packageManifest = readFileSync(join(packageRoot, "package.json"), "utf8");
    expect(packageManifest).toContain('"aerograph": "./bin/aerograph"');
    expect(packageManifest).not.toContain('"kioku": "./bin/kioku"');
    expect(existsSync(join(packageRoot, "bin/aerograph"))).toBe(true);
    expect(existsSync(join(packageRoot, "bin/kioku"))).toBe(false);
  });

  it("initializes project storage in the global AeroGraph home", () => {
    const root = realpathSync.native(mkdtempSync(join(tmpdir(), "aerograph-branding-test-")));
    const aerographHome = mkdtempSync(join(tmpdir(), "aerograph-home-test-"));
    temporaryRoots.push(root, aerographHome);

    const init = runCli(packageRoot, ["init", root], {
      ...process.env,
      AEROGRAPH_HOME: aerographHome,
    });

    expect(init.status).toBe(0);
    expect(init.stdout).toContain("Initializing AeroGraph project");
    // SAFETY: The successful init command wrote this versioned registry, and this test immediately
    // asserts the required version and project fields before using the generated project ID.
    const registry = JSON.parse(readFileSync(join(aerographHome, "config.json"), "utf8")) as {
      version: number;
      projects: Array<{ id: string; name: string; rootPath: string }>;
    };
    expect(registry.version).toBe(1);
    expect(registry.projects).toHaveLength(1);
    expect(registry.projects[0]?.name).toBe(basename(root));
    expect(registry.projects[0]?.rootPath).toBe(root);
    const projectId = registry.projects[0]?.id;
    expect(projectId).toBeTruthy();
    expect(existsSync(join(aerographHome, "projects", projectId ?? "", "aerograph.db"))).toBe(true);
    expect(existsSync(join(root, ".aerograph"))).toBe(false);
    expect(existsSync(join(root, ".kioku"))).toBe(false);

    const nestedDirectory = join(root, "packages", "example");
    mkdirSync(nestedDirectory, { recursive: true });
    const status = runCli(nestedDirectory, ["status"], {
      ...process.env,
      AEROGRAPH_HOME: aerographHome,
    });
    expect(status.status).toBe(0);
    expect(status.stdout).toContain("AeroGraph Project Status");
    expect(status.stdout).toContain(`Project: ${basename(root)}`);
    expect(status.stdout).toContain(`Root:    ${root}`);
    expect(status.stdout).not.toContain("Database:");
    expect(status.stdout).not.toContain("Registry:");

    const verboseStatus = runCli(nestedDirectory, ["status", "--verbose"], {
      ...process.env,
      AEROGRAPH_HOME: aerographHome,
    });
    expect(verboseStatus.status).toBe(0);
    expect(verboseStatus.stdout).toContain("Resolution: registered_path");
    expect(verboseStatus.stdout).toContain(`Registry:   ${join(aerographHome, "config.json")}`);
    expect(verboseStatus.stdout).toContain(
      `Database:   ${join(aerographHome, "projects", projectId ?? "", "aerograph.db")}`
    );
  });

  it("registers multiple projects in one global AeroGraph home", () => {
    const firstRoot = realpathSync.native(mkdtempSync(join(tmpdir(), "aerograph-first-test-")));
    const secondRoot = realpathSync.native(mkdtempSync(join(tmpdir(), "aerograph-second-test-")));
    const aerographHome = mkdtempSync(join(tmpdir(), "aerograph-home-test-"));
    temporaryRoots.push(firstRoot, secondRoot, aerographHome);
    const environment = {
      ...process.env,
      AEROGRAPH_HOME: aerographHome,
    };

    expect(runCli(packageRoot, ["init", firstRoot], environment).status).toBe(0);
    expect(runCli(packageRoot, ["init", secondRoot], environment).status).toBe(0);

    // SAFETY: Both successful init commands wrote this versioned registry, and the test only
    // inspects the required project identifiers and canonical roots.
    const registry = JSON.parse(readFileSync(join(aerographHome, "config.json"), "utf8")) as {
      projects: Array<{ id: string; rootPath: string }>;
    };
    expect(registry.projects).toHaveLength(2);
    expect(new Set(registry.projects.map((project) => project.id)).size).toBe(2);
    expect(registry.projects.map((project) => project.rootPath).sort()).toEqual(
      [firstRoot, secondRoot].sort()
    );
  });

  it("resolves linked Git worktrees to one project graph", () => {
    const container = realpathSync.native(mkdtempSync(join(tmpdir(), "aerograph-worktree-test-")));
    const root = join(container, "project");
    const worktreeRoot = join(container, "linked-worktree");
    const aerographHome = mkdtempSync(join(tmpdir(), "aerograph-home-test-"));
    temporaryRoots.push(container, aerographHome);
    mkdirSync(root);
    runGit(root, "init");
    writeFileSync(join(root, "README.md"), "# Test");
    runGit(root, "add", "README.md");
    runGit(
      root,
      "-c",
      "user.name=AeroGraph Test",
      "-c",
      "user.email=test@aerograph.local",
      "commit",
      "-m",
      "initial"
    );

    const environment = {
      ...process.env,
      AEROGRAPH_HOME: aerographHome,
    };
    expect(runCli(packageRoot, ["init", root], environment).status).toBe(0);
    runGit(root, "worktree", "add", "--detach", worktreeRoot);

    const create = runCli(
      worktreeRoot,
      ["doc", "create", "--content", "Shared from worktree.", "Worktree Memory"],
      environment
    );
    expect(create.status).toBe(0);

    const list = runCli(root, ["doc", "list"], environment);
    expect(list.status).toBe(0);
    expect(list.stdout).toContain("Worktree Memory");

    const status = runCli(worktreeRoot, ["status"], environment);
    expect(status.status).toBe(0);
    expect(status.stdout).toContain(`Root:    ${worktreeRoot}`);

    const verboseStatus = runCli(worktreeRoot, ["status", "--verbose"], environment);
    expect(verboseStatus.status).toBe(0);
    expect(verboseStatus.stdout).toContain("Resolution: git_common_dir");

    const duplicateInit = runCli(packageRoot, ["init", worktreeRoot], environment);
    expect(duplicateInit.status).not.toBe(0);
    expect(duplicateInit.stderr).toContain("already registered");

    // SAFETY: The successful initialization wrote the versioned registry, and this test only
    // verifies the single project record and Git identity emitted by that command.
    const registry = JSON.parse(readFileSync(join(aerographHome, "config.json"), "utf8")) as {
      projects: Array<{ gitCommonDir?: string }>;
    };
    expect(registry.projects).toHaveLength(1);
    expect(registry.projects[0]?.gitCommonDir).toBeTruthy();
  });

  it("allows unrelated historical tool directories", () => {
    const root = realpathSync.native(mkdtempSync(join(tmpdir(), "aerograph-directory-test-")));
    const aerographHome = mkdtempSync(join(tmpdir(), "aerograph-home-test-"));
    temporaryRoots.push(root, aerographHome);
    mkdirSync(join(root, ".aerograph"));
    mkdirSync(join(root, ".kioku"));

    const init = runCli(packageRoot, ["init", root], {
      ...process.env,
      AEROGRAPH_HOME: aerographHome,
    });

    expect(init.status).toBe(0);
    expect(existsSync(join(aerographHome, "config.json"))).toBe(true);
  });

  it("refuses to register a project with repository-local AeroGraph storage", () => {
    const root = realpathSync.native(
      mkdtempSync(join(tmpdir(), "aerograph-local-storage-guard-test-"))
    );
    const aerographHome = mkdtempSync(join(tmpdir(), "aerograph-home-test-"));
    temporaryRoots.push(root, aerographHome);
    const localStorage = join(root, ".aerograph");
    const localDatabase = join(localStorage, "aerograph.db");
    mkdirSync(localStorage);
    writeFileSync(localDatabase, "valuable project graph");

    const init = runCli(packageRoot, ["init", root], {
      ...process.env,
      AEROGRAPH_HOME: aerographHome,
    });

    expect(init.status).not.toBe(0);
    expect(init.stderr).toContain("Repository-local AeroGraph database found");
    expect(readFileSync(localDatabase, "utf8")).toBe("valuable project graph");
    expect(existsSync(join(aerographHome, "config.json"))).toBe(false);
  });
});
