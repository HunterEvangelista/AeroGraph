import { Database } from "bun:sqlite";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { Effect, Exit } from "effect";
import { DatabaseClientLive, DatabaseClientTag } from "../../client";
import { CREATE_TABLES_SQL } from "../../schema";
import type { SqliteBinding } from "../../sqlite-driver";

interface CountRow {
  readonly count: number;
}
interface SchemaRow {
  readonly value: string;
}
interface TableInfoRow {
  readonly name: string;
  readonly type: string;
  readonly notnull: number;
  readonly pk: number;
}
interface ForeignKeyRow {
  readonly table: string;
  readonly from: string;
  readonly to: string;
  readonly on_delete: string;
  readonly on_update: string;
  readonly seq: number;
}
interface IndexRow {
  readonly name: string;
  readonly unique: number;
  readonly origin: string;
  readonly partial: number;
}
interface IndexColumnRow {
  readonly seqno: number;
  readonly cid: number;
  readonly name: string;
}
interface SqliteMasterRow {
  readonly sql: string | null;
}

const migrationsPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../drizzle");
const migrationNames = readdirSync(migrationsPath)
  .filter((name) => name.startsWith("20"))
  .sort();
const temporaryMigrations = mkdtempSync(join(tmpdir(), "aerograph-project-schema-migrations-"));
const v6Migrations = migrationNames.slice(0, 6);
for (const name of v6Migrations)
  cpSync(join(migrationsPath, name), join(temporaryMigrations, name), { recursive: true });

const required = <T>(row: T | null): T => {
  assert.ok(row);
  return row;
};
const count = (db: Database, table: string): number =>
  required(db.query<CountRow, []>(`SELECT count(*) AS count FROM ${table}`).get()).count;

const seed = (db: Database, includeProjects = true): void => {
  if (includeProjects) {
    db.run(
      "INSERT INTO projects VALUES ('p1', 'Project One', '2026-01-01'), ('p2', 'Project Two', '2026-01-01')"
    );
  }
  db.run(
    "INSERT INTO entities (id, type, title, content, created_at, updated_at) VALUES ('e1', 'doc', 'One', 'knowledge one', '2026-01-01', '2026-01-01'), ('e2', 'doc', 'Two', 'knowledge two', '2026-01-01', '2026-01-01'), ('e3', 'doc', 'Unassigned', 'knowledge three', '2026-01-01', '2026-01-01')"
  );
  if (includeProjects) {
    db.run(
      "INSERT INTO entity_projects VALUES ('e1', 'p1', '2026-01-01'), ('e1', 'p2', '2026-01-01'), ('e2', 'p1', '2026-01-01')"
    );
  }
  db.run("INSERT INTO tags (id, name, created_at) VALUES ('t1', 'important', '2026-01-01')");
  db.run("INSERT INTO entity_tags VALUES ('e1', 't1')");
  db.run("INSERT INTO links VALUES ('l1', 'e1', 'e2', 'references', '2026-01-01')");
  db.run("INSERT INTO entity_versions VALUES ('v1', 'e1', 1, '{}', 'create', NULL, '2026-01-01')");
  db.run(
    "INSERT INTO terms (id, canonical_name, kind, created_at, updated_at) VALUES ('term1', 'knowledge', 'concept', '2026-01-01', '2026-01-01')"
  );
  db.run(
    "INSERT INTO term_names VALUES ('term1', 'concept', 'knowledge', 'Knowledge', 'canonical', '2026-01-01')"
  );
  db.run(
    "INSERT INTO migration_journal (id, operation, kind, from_name, to_name, term_id, affected_entity_ids, affected_count, applied_at) VALUES ('j1', 'create', 'concept', 'knowledge', NULL, 'term1', '[]', 0, '2026-01-01')"
  );
};

const projectSchema = (db: Database) => ({
  table: db
    .query<TableInfoRow, []>("PRAGMA table_info(projects)")
    .all()
    .map(({ name, type, notnull, pk }) => ({ name, type, notnull, pk })),
  membershipTable: db
    .query<TableInfoRow, []>("PRAGMA table_info(entity_projects)")
    .all()
    .map(({ name, type, notnull, pk }) => ({ name, type, notnull, pk })),
  foreignKeys: db
    .query<ForeignKeyRow, []>("PRAGMA foreign_key_list(entity_projects)")
    .all()
    .sort((a, b) => a.seq - b.seq),
  index: db
    .query<IndexRow, []>("PRAGMA index_list(entity_projects)")
    .all()
    .map(({ name, unique, origin, partial }) => ({ name, unique, origin, partial })),
  indexColumns: db
    .query<IndexColumnRow, []>("PRAGMA index_info(idx_entity_projects_project)")
    .all(),
  checks: [
    ...(
      required(
        db
          .query<SqliteMasterRow, []>(
            "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'projects'"
          )
          .get()
      ).sql ?? ""
    ).matchAll(/check\s*\((length\([^)]*\)\s*>\s*0)\)/gi),
  ]
    .map(
      (match) =>
        match[1]?.replaceAll('"', "").replaceAll("`", "").replace(/\s+/g, "").toLowerCase() ?? ""
    )
    .sort(),
});

const assertBehavior = (db: Database): void => {
  db.run("PRAGMA foreign_keys = ON");
  assert.equal(count(db, "entity_projects"), 3); // A valid entity may have zero, one, or many project memberships.
  assert.throws(() => db.run("INSERT INTO entity_projects VALUES ('e1', 'p1', 'x')"));
  assert.throws(() => db.run("INSERT INTO entity_projects VALUES ('e1', 'missing', 'x')"));
  assert.throws(() => db.run("INSERT INTO entity_projects VALUES ('missing', 'p1', 'x')"));
  assert.throws(() => db.run("INSERT INTO projects VALUES ('', 'bad', 'x')"));
  assert.throws(() => db.run("INSERT INTO projects VALUES ('p3', '', 'x')"));

  db.run("DELETE FROM entity_projects WHERE entity_id = 'e1' AND project_id = 'p2'");
  assert.equal(count(db, "entities"), 3); // Detaching changes only membership, not the knowledge entity.
  assert.equal(count(db, "links"), 1);
  assert.equal(count(db, "entity_versions"), 1);
  db.run("DELETE FROM entities WHERE id = 'e1'");
  assert.equal(count(db, "entity_projects"), 1);
  assert.equal(count(db, "entity_tags"), 0);
  assert.equal(count(db, "links"), 0);
  assert.throws(() => db.run("DELETE FROM projects WHERE id = 'p1'"));
  db.run("DELETE FROM entities WHERE id = 'e2'");
  db.run("DELETE FROM projects WHERE id = 'p1'");
  assert.equal(count(db, "projects"), 1);
  assert.equal(count(db, "entities_fts"), 1);
  const search = db
    .query<CountRow, []>(
      "SELECT count(*) AS count FROM entities_fts WHERE entities_fts MATCH 'knowledge'"
    )
    .get();
  assert.equal(required(search).count, 1);
};

const authoritativeRows = (
  db: Database
): Record<string, ReadonlyArray<Record<string, SqliteBinding>>> =>
  Object.fromEntries(
    [
      "projects",
      "entities",
      "entity_projects",
      "tags",
      "entity_tags",
      "links",
      "entity_versions",
      "terms",
      "term_names",
      "migration_journal",
    ].map((table) => [
      table,
      db.query<Record<string, SqliteBinding>, []>(`SELECT * FROM ${table} ORDER BY 1, 2`).all(),
    ])
  );

const upgrade = (path: string) =>
  Effect.scoped(DatabaseClientTag.pipe(Effect.provide(DatabaseClientLive(path)), Effect.asVoid));

const run = async (): Promise<void> => {
  const root = mkdtempSync(join(tmpdir(), "aerograph-project-schema-"));
  const runtimePath = join(root, "runtime-v6.db");
  try {
    const fresh = new Database(":memory:");
    fresh.run("PRAGMA foreign_keys = ON");
    fresh.run(CREATE_TABLES_SQL);
    fresh.run("INSERT INTO schema_meta VALUES ('version', '7')");
    seed(fresh);

    const runtimeBase = new Database(runtimePath, { create: true });
    runtimeBase.run("PRAGMA foreign_keys = ON");
    migrate(drizzle({ client: runtimeBase }), { migrationsFolder: temporaryMigrations });
    seed(runtimeBase, false);
    runtimeBase.run("INSERT INTO schema_meta (key, value) VALUES ('version', '6')");
    runtimeBase.close();
    await Effect.runPromise(upgrade(runtimePath));
    const runtime = new Database(runtimePath);
    assert.equal(count(runtime, "projects"), 0);
    assert.equal(count(runtime, "entity_projects"), 0);
    runtime.run(
      "INSERT INTO projects VALUES ('p1', 'Project One', '2026-01-01'), ('p2', 'Project Two', '2026-01-01')"
    );
    runtime.run(
      "INSERT INTO entity_projects VALUES ('e1', 'p1', '2026-01-01'), ('e1', 'p2', '2026-01-01'), ('e2', 'p1', '2026-01-01')"
    );

    const drizzleDb = new Database(":memory:");
    drizzleDb.run("PRAGMA foreign_keys = ON");
    migrate(drizzle({ client: drizzleDb }), { migrationsFolder: migrationsPath });
    seed(drizzleDb);

    const expectedSchema = projectSchema(fresh);
    assert.deepEqual(expectedSchema.checks, ["length(id)>0", "length(name)>0"]);
    assert.deepEqual(projectSchema(runtime), expectedSchema);
    assert.deepEqual(projectSchema(drizzleDb), expectedSchema);
    assert.equal(
      required(
        runtime.query<SchemaRow, []>("SELECT value FROM schema_meta WHERE key = 'version'").get()
      ).value,
      "7"
    );
    assert.equal(
      required(
        fresh.query<SchemaRow, []>("SELECT value FROM schema_meta WHERE key = 'version'").get()
      ).value,
      "7"
    );
    assert.equal(
      drizzleDb.query<SchemaRow, []>("SELECT value FROM schema_meta WHERE key = 'version'").get(),
      null
    );
    assert.deepEqual(authoritativeRows(runtime), authoritativeRows(fresh));
    assert.deepEqual(authoritativeRows(drizzleDb), authoritativeRows(fresh));
    for (const db of [fresh, runtime, drizzleDb]) assertBehavior(db);

    fresh.close();
    runtime.close();
    drizzleDb.close();

    const failedPath = join(root, "failed-v6.db");
    const failed = new Database(failedPath, { create: true });
    try {
      migrate(drizzle({ client: failed }), { migrationsFolder: temporaryMigrations });
      failed.run("INSERT INTO schema_meta VALUES ('version', '6')");
      seed(failed, false);
      failed.run(`CREATE TRIGGER reject_version_seven BEFORE INSERT ON schema_meta
        WHEN NEW.key = 'version' AND NEW.value = '7'
        BEGIN SELECT RAISE(IGNORE); END`);
      const result = await Effect.runPromise(Effect.exit(upgrade(failedPath)));
      assert.ok(Exit.isFailure(result));
      assert.equal(
        required(
          failed.query<SchemaRow, []>("SELECT value FROM schema_meta WHERE key = 'version'").get()
        ).value,
        "6"
      );
      assert.equal(
        required(
          failed
            .query<CountRow, []>(
              "SELECT count(*) AS count FROM sqlite_master WHERE name IN ('projects', 'entity_projects')"
            )
            .get()
        ).count,
        0
      );
      assert.equal(count(failed, "entities"), 3);
      assert.equal(count(failed, "entity_versions"), 1);
      failed.run("DROP TRIGGER reject_version_seven");
      await Effect.runPromise(upgrade(failedPath));
      assert.equal(count(failed, "projects"), 0);
      assert.equal(count(failed, "entity_projects"), 0);
    } finally {
      failed.close();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(temporaryMigrations, { recursive: true, force: true });
  }
};

await run();
