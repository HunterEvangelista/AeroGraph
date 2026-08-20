import { afterEach, describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const cliEntrypoint = join(packageRoot, "src/cli.ts");
const temporaryRoots: string[] = [];

const runCli = (cwd: string, ...args: ReadonlyArray<string>) => {
  const result = spawnSync("bun", ["run", cliEntrypoint, ...args], {
    cwd,
    encoding: "utf8",
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
    const help = runCli(packageRoot, "--help");

    expect(help.status).toBe(0);
    expect(help.stdout).toContain("USAGE\n  aerograph <subcommand>");
    expect(help.stdout).not.toContain("kioku <subcommand>");

    const packageManifest = readFileSync(join(packageRoot, "package.json"), "utf8");
    expect(packageManifest).toContain('"aerograph": "./bin/aerograph"');
    expect(packageManifest).not.toContain('"kioku": "./bin/kioku"');
    expect(existsSync(join(packageRoot, "bin/aerograph"))).toBe(true);
    expect(existsSync(join(packageRoot, "bin/kioku"))).toBe(false);
  });

  it("initializes only the clean-break AeroGraph workspace path", () => {
    const root = mkdtempSync(join(tmpdir(), "aerograph-branding-test-"));
    temporaryRoots.push(root);

    const init = runCli(packageRoot, "init", root);

    expect(init.status).toBe(0);
    expect(init.stdout).toContain("Initializing AeroGraph workspace");
    expect(existsSync(join(root, ".aerograph/config.json"))).toBe(true);
    expect(existsSync(join(root, ".aerograph/aerograph.db"))).toBe(true);
    expect(existsSync(join(root, ".kioku"))).toBe(false);
  });

  it("refuses to create a divergent workspace beside legacy data", () => {
    const root = mkdtempSync(join(tmpdir(), "aerograph-legacy-guard-test-"));
    temporaryRoots.push(root);
    const legacyWorkspace = join(root, ".kioku");
    const legacyDatabase = join(legacyWorkspace, "kioku.db");
    mkdirSync(legacyWorkspace);
    writeFileSync(legacyDatabase, "valuable legacy data");

    const init = runCli(packageRoot, "init", root);

    expect(init.status).not.toBe(0);
    expect(init.stderr).toContain("Legacy Kioku workspace found");
    expect(readFileSync(legacyDatabase, "utf8")).toBe("valuable legacy data");
    expect(existsSync(join(root, ".aerograph"))).toBe(false);
  });
});
