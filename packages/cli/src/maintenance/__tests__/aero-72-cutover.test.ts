import { Database } from "bun:sqlite";
import { afterEach, describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CREATE_TABLES_SQL, INSERT_SCHEMA_VERSION_SQL, SCHEMA_VERSION } from "../../db/schema";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const scriptPath = join(packageRoot, "src/maintenance/aero-72-cutover.ts");
const temporaryRoots: string[] = [];

const createProjectDatabase = (rootPath: string): string => {
  const storagePath = join(rootPath, ".aerograph");
  const databasePath = join(storagePath, "aerograph.db");
  mkdirSync(storagePath);
  const database = new Database(databasePath, { create: true });
  try {
    database.exec(CREATE_TABLES_SQL);
    database.run(INSERT_SCHEMA_VERSION_SQL, [String(SCHEMA_VERSION)]);
    database.run(
      "INSERT INTO entities (id, type, title, content, created_at, updated_at, version) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ["cutover-doc", "doc", "Cutover", "Preserved graph data", "2026-01-01", "2026-01-01", 1]
    );
  } finally {
    database.close();
  }
  return databasePath;
};

const runScript = (rootPath: string, aerographHome: string, args: ReadonlyArray<string> = []) => {
  const result = spawnSync("bun", ["run", scriptPath, ...args, rootPath], {
    cwd: packageRoot,
    encoding: "utf8",
    env: { ...process.env, AEROGRAPH_HOME: aerographHome },
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

describe("AERO-72 cutover", () => {
  it("previews without writing global state", () => {
    const rootPath = realpathSync.native(mkdtempSync(join(tmpdir(), "aero-72-project-")));
    const aerographHome = mkdtempSync(join(tmpdir(), "aero-72-home-"));
    temporaryRoots.push(rootPath, aerographHome);
    createProjectDatabase(rootPath);

    const result = runScript(rootPath, aerographHome);

    expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: "" });
    expect(result.stdout).toContain("Mode:        dry run");
    expect(result.stdout).toContain("Source verification passed");
    expect(existsSync(join(aerographHome, "config.json"))).toBe(false);
  });

  it("copies, verifies, and registers the graph without deleting its source", () => {
    const rootPath = realpathSync.native(mkdtempSync(join(tmpdir(), "aero-72-project-")));
    const aerographHome = mkdtempSync(join(tmpdir(), "aero-72-home-"));
    temporaryRoots.push(rootPath, aerographHome);
    const sourcePath = createProjectDatabase(rootPath);
    const sourceBeforeCutover = readFileSync(sourcePath);

    const result = runScript(rootPath, aerographHome, ["--apply"]);

    expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: "" });
    expect(result.stdout).toContain("Cutover verified and registered");
    expect(existsSync(sourcePath)).toBe(true);
    expect(readFileSync(sourcePath)).toEqual(sourceBeforeCutover);

    // SAFETY: A successful cutover writes this versioned registry, and the test immediately
    // inspects only the required project identity fields produced by that script.
    const registry = JSON.parse(readFileSync(join(aerographHome, "config.json"), "utf8")) as {
      projects: Array<{ id: string; rootPath: string }>;
    };
    expect(registry.projects).toHaveLength(1);
    expect(registry.projects[0]?.rootPath).toBe(rootPath);
    const destinationPath = join(
      aerographHome,
      "projects",
      registry.projects[0]?.id ?? "",
      "aerograph.db"
    );
    expect(existsSync(destinationPath)).toBe(true);

    const source = new Database(sourcePath, { readonly: true });
    const destination = new Database(destinationPath, { readonly: true });
    try {
      const query = "SELECT title, content FROM entities WHERE id = ?";
      expect(destination.query(query).get("cutover-doc")).toEqual(
        source.query(query).get("cutover-doc")
      );
    } finally {
      source.close();
      destination.close();
    }

    const repeated = runScript(rootPath, aerographHome, ["--apply"]);
    expect(repeated.status).not.toBe(0);
    expect(repeated.stderr).toContain("already registered");
    expect(registry.projects).toHaveLength(1);
  });
});
