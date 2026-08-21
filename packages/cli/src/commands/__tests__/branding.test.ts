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
    expect(init.stdout).toContain("Initializing AeroGraph workspace");
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
    expect(status.stdout).toContain(`Root:     ${root}`);
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

  it("refuses to create a divergent workspace beside legacy data", () => {
    const root = realpathSync.native(mkdtempSync(join(tmpdir(), "aerograph-legacy-guard-test-")));
    const aerographHome = mkdtempSync(join(tmpdir(), "aerograph-home-test-"));
    temporaryRoots.push(root, aerographHome);
    const legacyWorkspace = join(root, ".kioku");
    const legacyDatabase = join(legacyWorkspace, "kioku.db");
    mkdirSync(legacyWorkspace);
    writeFileSync(legacyDatabase, "valuable legacy data");

    const init = runCli(packageRoot, ["init", root], {
      ...process.env,
      AEROGRAPH_HOME: aerographHome,
    });

    expect(init.status).not.toBe(0);
    expect(init.stderr).toContain("Legacy Kioku workspace found");
    expect(readFileSync(legacyDatabase, "utf8")).toBe("valuable legacy data");
    expect(existsSync(join(aerographHome, "config.json"))).toBe(false);
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
    expect(init.stderr).toContain("Repository-local AeroGraph storage found");
    expect(readFileSync(localDatabase, "utf8")).toBe("valuable project graph");
    expect(existsSync(join(aerographHome, "config.json"))).toBe(false);
  });
});
