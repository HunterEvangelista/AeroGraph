import { Database } from "bun:sqlite";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect, Exit } from "effect";
import { type DatabaseClient, DatabaseClientLive, DatabaseClientTag } from "../../client";

const root = mkdtempSync(join(tmpdir(), "aerograph-upgrade-"));
const getRequired = <T>(row: T | null): T => {
  assert.ok(row);
  return row;
};
const withDatabase = <A>(path: string, assertions: (client: DatabaseClient) => A) =>
  Effect.scoped(
    Effect.gen(function* () {
      const client = yield* DatabaseClientTag;
      return yield* Effect.sync(() => assertions(client));
    }).pipe(Effect.provide(DatabaseClientLive(path)))
  );

type CountRow = { count: number };
type SchemaMetaRow = { value: string };
type TermNameRow = { kind: string; name: string };
type TableInfoRow = { name: string; notnull: number };
type MigrationJournalRow = { to_name: string; related_term_id: string | null };

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
  if (version === "4") {
    const legacyTerm = rows[0];
    if (!legacyTerm) throw new Error("v4 fixture requires a term");
    db.run("ALTER TABLE term_names ADD COLUMN kind TEXT;");
    db.run(
      "UPDATE term_names SET kind = (SELECT kind FROM terms WHERE terms.id = term_names.term_id);"
    );
    db.run("UPDATE term_names SET name = lower(replace(replace(trim(name), ' ', '-'), '_', '-'));");
    db.run(`
      CREATE TABLE term_names_v4 (
        term_id TEXT NOT NULL REFERENCES terms(id),
        kind TEXT NOT NULL,
        name TEXT NOT NULL,
        display_name TEXT NOT NULL,
        name_kind TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (term_id, name),
        CHECK(kind IN ('brand', 'project', 'feature', 'api', 'concept', 'package', 'other')),
        CHECK(name_kind IN ('canonical', 'alias', 'deprecated')),
        CHECK(name = lower(name) AND name = trim(name) AND instr(name, ' ') = 0 AND instr(name, '_') = 0 AND instr(name, ',') = 0)
      );
    `);
    db.run(
      "INSERT INTO term_names_v4 SELECT term_id, kind, name, display_name, name_kind, created_at FROM term_names;"
    );
    db.run("DROP TABLE term_names;");
    db.run("ALTER TABLE term_names_v4 RENAME TO term_names;");
    db.run(`
      CREATE TABLE migration_journal (
        id TEXT PRIMARY KEY,
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
        dry_run INTEGER NOT NULL DEFAULT 0
      );
    `);
    db.run(
      "INSERT INTO migration_journal (id, operation, kind, from_name, to_name, term_id, affected_entity_ids, affected_count, applied_at, dry_run) VALUES ('journal-v4-create', 'create', 'brand', 'Legacy', '  Legacy Create  ', ?, '[]', 0, '2026-01-01', 0)",
      [legacyTerm.termId]
    );
  }
  db.close();
};

try {
  const validPath = join(root, "valid.db");
  createV3Database(
    validPath,
    [
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
    ],
    "4"
  );
  await Effect.runPromise(
    withDatabase(validPath, (client) => {
      const migrated = client.db
        .query<TermNameRow, []>(
          "SELECT kind, name FROM term_names WHERE term_id = 'term-brand-kioku'"
        )
        .get();
      assert.deepEqual(migrated, { kind: "brand", name: "kioku-name" });
      assert.equal(
        getRequired(
          client.db
            .query<CountRow, []>(
              "SELECT count(*) AS count FROM term_names WHERE name = 'kioku-name'"
            )
            .get()
        ).count,
        2
      );
      const kindColumn = client.db
        .query<TableInfoRow, []>("PRAGMA table_info(term_names)")
        .all()
        .find(({ name }) => name === "kind");
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
      assert.equal(
        getRequired(
          client.db
            .query<MigrationJournalRow, []>(
              "SELECT to_name, related_term_id FROM migration_journal WHERE id = 'journal-v4-create'"
            )
            .get()
        ).to_name,
        "  Legacy Create  "
      );
      client.db.run(
        "INSERT INTO migration_journal (id, operation, kind, from_name, to_name, term_id, related_term_id, affected_entity_ids, affected_count, applied_at) VALUES ('journal-create-null', 'create', 'brand', 'New', NULL, 'term-brand-kioku', NULL, '[]', 0, '2026-01-01')"
      );
      client.db.run(
        "INSERT INTO migration_journal (id, operation, kind, from_name, to_name, term_id, related_term_id, affected_entity_ids, affected_count, applied_at) VALUES ('journal-create-name', 'create', 'brand', 'New', 'New Create', 'term-brand-kioku', NULL, '[]', 0, '2026-01-01')"
      );
      assert.throws(() =>
        client.db.run(
          "INSERT INTO migration_journal (id, operation, kind, from_name, to_name, term_id, related_term_id, affected_entity_ids, affected_count, applied_at) VALUES ('journal-create-empty', 'create', 'brand', 'New', '   ', 'term-brand-kioku', NULL, '[]', 0, '2026-01-01')"
        )
      );
      assert.throws(() =>
        client.db.run(
          "INSERT INTO migration_journal (id, operation, kind, from_name, to_name, term_id, related_term_id, affected_entity_ids, affected_count, applied_at) VALUES ('journal-create-related', 'create', 'brand', 'New', NULL, 'term-brand-kioku', 'term-package-kioku', '[]', 0, '2026-01-01')"
        )
      );
      assert.deepEqual(client.db.query("PRAGMA foreign_key_check").all(), []);
      assert.equal(
        getRequired(
          client.db
            .query<SchemaMetaRow, []>("SELECT value FROM schema_meta WHERE key = 'version'")
            .get()
        ).value,
        "5"
      );
    })
  );

  await Effect.runPromise(
    withDatabase(validPath, (reopened) => {
      assert.equal(
        getRequired(reopened.db.query<{ name: string }, []>("SELECT name FROM term_names").get())
          .name,
        "kioku-name"
      );
      assert.equal(
        getRequired(
          reopened.db
            .query<{ to_name: string }, []>(
              "SELECT to_name FROM migration_journal WHERE id = 'journal-v4-create'"
            )
            .get()
        ).to_name,
        "  Legacy Create  "
      );
    })
  );

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
  const collisionExit = await Effect.runPromiseExit(withDatabase(collisionPath, () => undefined));
  assert.ok(Exit.isFailure(collisionExit));
  const collisionDb = new Database(collisionPath);
  assert.equal(
    getRequired(
      collisionDb
        .query<SchemaMetaRow, []>("SELECT value FROM schema_meta WHERE key = 'version'")
        .get()
    ).value,
    "3"
  );
  assert.equal(
    getRequired(collisionDb.query<CountRow, []>("SELECT count(*) AS count FROM term_names").get())
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
  const commaExit = await Effect.runPromiseExit(withDatabase(commaPath, () => undefined));
  assert.ok(Exit.isFailure(commaExit));
  const commaDb = new Database(commaPath);
  assert.equal(
    getRequired(
      commaDb.query<SchemaMetaRow, []>("SELECT value FROM schema_meta WHERE key = 'version'").get()
    ).value,
    "3"
  );
  commaDb.close();

  const malformedPath = join(root, "malformed.db");
  createV3Database(malformedPath, [], "3garbage");
  const malformedExit = await Effect.runPromiseExit(withDatabase(malformedPath, () => undefined));
  assert.ok(Exit.isFailure(malformedExit));
  const malformedDb = new Database(malformedPath);
  assert.equal(
    getRequired(
      malformedDb
        .query<SchemaMetaRow, []>("SELECT value FROM schema_meta WHERE key = 'version'")
        .get()
    ).value,
    "3garbage"
  );
  malformedDb.close();
} finally {
  rmSync(root, { recursive: true, force: true });
}
