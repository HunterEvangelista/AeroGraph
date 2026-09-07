import { Database } from "bun:sqlite";
import { mkdir, mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

const [tarballArgument] = process.argv.slice(2);
if (tarballArgument === undefined || process.argv.length !== 3) {
  throw new Error("Usage: runtime-upgrade-smoke.ts <package.tgz>");
}

interface Registry {
  readonly projects: ReadonlyArray<{
    readonly id: string;
    readonly rootPath: string;
  }>;
}

const tarball = resolve(tarballArgument);
const tempRoot = await mkdtemp(join(tmpdir(), "aerograph-runtime-upgrade-smoke-"));
const installPrefix = join(tempRoot, "install");
const projectsRoot = join(tempRoot, "projects");
const home = join(tempRoot, "home");

const run = async (command: string[], cwd: string) => {
  const child = Bun.spawn(command, {
    cwd,
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

const replaceFtsTriggersWithLegacyDefinitions = (db: Database): void => {
  db.run("DROP TRIGGER entities_ai;");
  db.run("DROP TRIGGER entities_ad;");
  db.run("DROP TRIGGER entities_au;");
  db.run(`
    CREATE TRIGGER entities_ai AFTER INSERT ON entities BEGIN
      INSERT INTO entities_fts(id, title, content) VALUES (new.id, new.title, new.content);
    END;
  `);
  db.run(`
    CREATE TRIGGER entities_ad AFTER DELETE ON entities BEGIN
      INSERT INTO entities_fts(entities_fts, id, title, content)
      VALUES('delete', old.id, old.title, old.content);
    END;
  `);
  db.run(`
    CREATE TRIGGER entities_au AFTER UPDATE ON entities BEGIN
      INSERT INTO entities_fts(entities_fts, id, title, content)
      VALUES('delete', old.id, old.title, old.content);
      INSERT INTO entities_fts(id, title, content) VALUES (new.id, new.title, new.content);
    END;
  `);
};

const seedSharedFixtureRows = (db: Database, marker: string): void => {
  db.run(
    "INSERT INTO entities (rowid, id, type, title, content, created_at, updated_at, version) VALUES (10, ?, 'doc', ?, ?, '2026-01-01', '2026-01-01', 1), (20, ?, 'doc', 'Linked target', 'target marker', '2026-01-01', '2026-01-01', 1)",
    [`${marker}-source`, `${marker} source`, `${marker} searchable content`, `${marker}-target`]
  );
  db.run(
    "INSERT INTO links (id, source_id, target_id, type, created_at) VALUES (?, ?, ?, 'references', '2026-01-01')",
    [`${marker}-link`, `${marker}-source`, `${marker}-target`]
  );
  db.run(`
    CREATE TRIGGER custom_entities_audit AFTER UPDATE ON entities BEGIN
      SELECT 1;
    END;
  `);
};

const createV3Fixture = (path: string): void => {
  const db = new Database(path);
  try {
    db.run("PRAGMA foreign_keys = OFF;");
    for (const statement of [
      "DROP TABLE migration_journal;",
      "DROP TABLE term_names;",
      "DROP TABLE terms;",
    ])
      db.run(statement);
    db.run(`
      CREATE TABLE terms (
        id TEXT PRIMARY KEY NOT NULL,
        canonical_name TEXT NOT NULL,
        kind TEXT NOT NULL,
        description TEXT,
        status TEXT DEFAULT 'active' NOT NULL,
        merged_into_id TEXT REFERENCES terms(id),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE term_names (
        term_id TEXT NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        name TEXT NOT NULL,
        display_name TEXT NOT NULL,
        name_kind TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY(term_id, name)
      );
      CREATE TABLE migration_journal (
        id TEXT PRIMARY KEY NOT NULL,
        operation TEXT NOT NULL,
        kind TEXT,
        from_name TEXT NOT NULL,
        to_name TEXT NOT NULL,
        term_id TEXT NOT NULL REFERENCES terms(id),
        affected_entity_ids TEXT NOT NULL,
        affected_count INTEGER NOT NULL,
        reason TEXT,
        applied_at TEXT NOT NULL,
        applied_by TEXT,
        dry_run INTEGER DEFAULT 0 NOT NULL
      );
    `);
    db.run(
      "INSERT INTO terms (id, canonical_name, kind, status, created_at, updated_at) VALUES ('legacy-term', 'Legacy Term', 'concept', 'active', '2026-01-01', '2026-01-01')"
    );
    db.run(
      "INSERT INTO term_names (term_id, kind, name, display_name, name_kind, created_at) VALUES ('legacy-term', 'concept', ' Legacy_Term ', 'Legacy Term', 'canonical', '2026-01-01')"
    );
    replaceFtsTriggersWithLegacyDefinitions(db);
    seedSharedFixtureRows(db, "oldest");
    db.run("UPDATE schema_meta SET value = '3' WHERE key = 'version';");
  } finally {
    db.close();
  }
};

const createV5Fixture = (path: string): void => {
  const db = new Database(path);
  try {
    replaceFtsTriggersWithLegacyDefinitions(db);
    db.run(
      "INSERT INTO terms (id, canonical_name, kind, status, created_at, updated_at) VALUES ('pre-fts-term', 'Pre FTS Term', 'concept', 'active', '2026-01-01', '2026-01-01')"
    );
    db.run(
      "INSERT INTO term_names (term_id, kind, name, display_name, name_kind, created_at) VALUES ('pre-fts-term', 'concept', 'pre-fts-term', 'Pre FTS Term', 'canonical', '2026-01-01')"
    );
    seedSharedFixtureRows(db, "pre-fts");
    db.run("UPDATE schema_meta SET value = '5' WHERE key = 'version';");
  } finally {
    db.close();
  }
};

const databasePathFor = async (project: string): Promise<string> => {
  const registry = JSON.parse(await readFile(join(home, "config.json"), "utf8")) as Registry;
  const normalizedProject = await realpath(project);
  const entry = registry.projects.find(({ rootPath }) => rootPath === normalizedProject);
  if (!entry) throw new Error(`Project was not registered: ${project}`);
  return join(home, "projects", entry.id, "aerograph.db");
};

const NODE_ASSERTIONS = `
  import assert from "node:assert/strict";
  import { DatabaseSync } from "node:sqlite";
  const [path, termName] = process.argv.slice(1);
  const db = new DatabaseSync(path);
  try {
    assert.equal(db.prepare("SELECT value FROM schema_meta WHERE key = 'version'").get().value, "6");
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
    assert.equal(db.prepare("SELECT count(*) AS count FROM links").get().count, 1);
    assert.equal(db.prepare("SELECT count(*) AS count FROM terms").get().count, 1);
    assert.ok(db.prepare("SELECT 1 FROM term_names WHERE name = ?").get(termName));
    assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'trigger' AND name = 'custom_entities_audit'").get());
    assert.equal(
      db.prepare("SELECT count(*) AS count FROM entities e JOIN entities_fts fts ON e.rowid = fts.rowid WHERE entities_fts MATCH 'searchable'").get().count,
      1
    );
    const managedTrigger = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = 'entities_ai'").get();
    assert.match(managedTrigger.sql, /new\\.rowid/);
  } finally {
    db.close();
  }
`;

try {
  await mkdir(projectsRoot, { recursive: true });
  await run(
    ["npm", "install", "--ignore-scripts", "--no-package-lock", "--prefix", installPrefix, tarball],
    tempRoot
  );
  const executable = join(installPrefix, "node_modules", ".bin", "aerograph");

  for (const fixture of [
    { name: "v3", marker: "oldest", termName: "legacy-term", create: createV3Fixture },
    { name: "v5", marker: "pre-fts", termName: "pre-fts-term", create: createV5Fixture },
  ]) {
    const project = join(projectsRoot, fixture.name);
    await mkdir(project, { recursive: true });
    await run([executable, "init"], project);
    const databasePath = await databasePathFor(project);
    fixture.create(databasePath);

    await run([executable, "status", "--verbose"], project);
    await run(
      ["node", "--input-type=module", "--eval", NODE_ASSERTIONS, databasePath, fixture.termName],
      project
    );

    // Reopen the Node-upgraded graph with the packaged Bun runtime and exercise
    // both FTS and the migrated term registry through public CLI commands.
    await run(["bun", executable, "status", "--verbose"], project);
    const search = await run(["bun", executable, "doc", "list", "--search", "searchable"], project);
    if (!search.includes(`${fixture.marker} source`)) {
      throw new Error(`Bun could not search the Node-upgraded ${fixture.name} fixture`);
    }
    const terms = await run(["bun", executable, "term", "list"], project);
    if (!terms.includes(fixture.termName)) {
      throw new Error(`Bun could not read terms from the Node-upgraded ${fixture.name} fixture`);
    }
  }

  console.log(`Cross-runtime database upgrade smoke test passed: ${basename(tarball)}`);
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
