import { Database } from "bun:sqlite";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect, Exit } from "effect";
import { makeDatabaseClient } from "../../client.js";

const root = mkdtempSync(join(tmpdir(), "kioku-upgrade-"));

const createV3Database = (
  path: string,
  rows: ReadonlyArray<{
    termId: string;
    kind: string;
    name: string;
    displayName: string;
    nameKind: string;
  }>,
  version = "3"
) => {
  const db = new Database(path, { create: true });
  db.run("PRAGMA foreign_keys = ON;");
  db.run("CREATE TABLE schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);");
  db.run("INSERT INTO schema_meta (key, value) VALUES ('version', ?);", [version]);
  db.run(`
    CREATE TABLE terms (
      id TEXT PRIMARY KEY,
      canonical_name TEXT NOT NULL,
      kind TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      merged_into_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  db.run(`
    CREATE TABLE term_names (
      term_id TEXT NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      display_name TEXT NOT NULL,
      name_kind TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (term_id, name)
    );
  `);
  const insertTerm = db.prepare(
    "INSERT INTO terms (id, canonical_name, kind, status, created_at, updated_at) VALUES (?, ?, ?, 'active', ?, ?)"
  );
  const insertName = db.prepare(
    "INSERT INTO term_names (term_id, name, display_name, name_kind, created_at) VALUES (?, ?, ?, ?, ?)"
  );
  for (const row of rows) {
    insertTerm.run(row.termId, row.displayName, row.kind, "2026-01-01", "2026-01-01");
    insertName.run(row.termId, row.name, row.displayName, row.nameKind, "2026-01-01");
  }
  db.close();
};

try {
  const validPath = join(root, "valid.db");
  createV3Database(validPath, [
    {
      termId: "term-brand-kioku",
      kind: "brand",
      name: " Kioku_Name ",
      displayName: "Kioku Name",
      nameKind: "canonical",
    },
    {
      termId: "term-package-kioku",
      kind: "package",
      name: "kioku name",
      displayName: "Kioku Package",
      nameKind: "canonical",
    },
  ]);
  const client = await Effect.runPromise(makeDatabaseClient(validPath));
  const migrated = client.db
    .query("SELECT kind, name FROM term_names WHERE term_id = 'term-brand-kioku'")
    .get() as {
    kind: string;
    name: string;
  };
  assert.deepEqual(migrated, { kind: "brand", name: "kioku-name" });
  assert.equal(
    (
      client.db
        .query("SELECT count(*) AS count FROM term_names WHERE name = 'kioku-name'")
        .get() as {
        count: number;
      }
    ).count,
    2
  );
  const kindColumn = (
    client.db.query("PRAGMA table_info(term_names)").all() as Array<{
      name: string;
      notnull: number;
    }>
  ).find(({ name }) => name === "kind");
  assert.equal(kindColumn?.notnull, 1);
  assert.throws(() =>
    client.db.run(
      "INSERT INTO term_names VALUES ('term-brand-kioku', NULL, 'alias', 'Alias', 'alias', '2026-01-01')"
    )
  );
  assert.throws(() =>
    client.db.run(
      "INSERT INTO term_names VALUES ('term-brand-kioku', 'brand', 'UPPER', 'Upper', 'alias', '2026-01-01')"
    )
  );
  assert.throws(() =>
    client.db.run("UPDATE terms SET canonical_name = 'Foo, Inc.' WHERE id = 'term-brand-kioku'")
  );
  assert.deepEqual(client.db.query("PRAGMA foreign_key_check").all(), []);
  assert.equal(
    (
      client.db.query("SELECT value FROM schema_meta WHERE key = 'version'").get() as {
        value: string;
      }
    ).value,
    "4"
  );
  await Effect.runPromise(client.close());

  const reopened = await Effect.runPromise(makeDatabaseClient(validPath));
  assert.equal(
    (reopened.db.query("SELECT name FROM term_names").get() as { name: string }).name,
    "kioku-name"
  );
  await Effect.runPromise(reopened.close());

  const collisionPath = join(root, "collision.db");
  createV3Database(collisionPath, [
    {
      termId: "term-brand-one",
      kind: "brand",
      name: "Aero Graph",
      displayName: "Aero Graph",
      nameKind: "canonical",
    },
    {
      termId: "term-brand-two",
      kind: "brand",
      name: "aero_graph",
      displayName: "Aero Graph Two",
      nameKind: "canonical",
    },
  ]);
  const collisionExit = await Effect.runPromiseExit(makeDatabaseClient(collisionPath));
  assert.ok(Exit.isFailure(collisionExit));
  const collisionDb = new Database(collisionPath);
  assert.equal(
    (
      collisionDb.query("SELECT value FROM schema_meta WHERE key = 'version'").get() as {
        value: string;
      }
    ).value,
    "3"
  );
  assert.equal(
    (collisionDb.query("SELECT count(*) AS count FROM term_names").get() as { count: number })
      .count,
    2
  );
  collisionDb.close();

  const commaPath = join(root, "comma.db");
  createV3Database(commaPath, [
    {
      termId: "term-brand-foo",
      kind: "brand",
      name: "foo-inc",
      displayName: "Foo, Inc.",
      nameKind: "canonical",
    },
  ]);
  const commaExit = await Effect.runPromiseExit(makeDatabaseClient(commaPath));
  assert.ok(Exit.isFailure(commaExit));
  const commaDb = new Database(commaPath);
  assert.equal(
    (
      commaDb.query("SELECT value FROM schema_meta WHERE key = 'version'").get() as {
        value: string;
      }
    ).value,
    "3"
  );
  commaDb.close();

  const malformedPath = join(root, "malformed.db");
  createV3Database(malformedPath, [], "3garbage");
  const malformedExit = await Effect.runPromiseExit(makeDatabaseClient(malformedPath));
  assert.ok(Exit.isFailure(malformedExit));
  const malformedDb = new Database(malformedPath);
  assert.equal(
    (
      malformedDb.query("SELECT value FROM schema_meta WHERE key = 'version'").get() as {
        value: string;
      }
    ).value,
    "3garbage"
  );
  malformedDb.close();
} finally {
  rmSync(root, { recursive: true, force: true });
}
