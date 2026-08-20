import { Database } from "bun:sqlite";
import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";

type CountRow = { count: number };
type MigrationJournalRow = { to_name: string; related_term_id: string | null };

const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../drizzle");
const legacyFolder = mkdtempSync(resolve(tmpdir(), "aerograph-drizzle-v2-"));
mkdirSync(resolve(legacyFolder, "meta"));
const journal = JSON.parse(readFileSync(resolve(migrationsFolder, "meta/_journal.json"), "utf8"));
const legacyJournal = { ...journal, entries: journal.entries.slice(0, 3) };
writeFileSync(resolve(legacyFolder, "meta/_journal.json"), JSON.stringify(legacyJournal));
for (const { tag } of legacyJournal.entries) {
  copyFileSync(resolve(migrationsFolder, `${tag}.sql`), resolve(legacyFolder, `${tag}.sql`));
}

const sqlite = new Database(":memory:");
try {
  sqlite.run("PRAGMA foreign_keys = ON;");
  const database = drizzle({ client: sqlite });
  migrate(database, { migrationsFolder: legacyFolder });
  sqlite.run(
    "CREATE TRIGGER custom_entities_trigger AFTER UPDATE ON entities BEGIN SELECT 1; END;"
  );
  sqlite.run("CREATE TRIGGER custom_terms_trigger AFTER UPDATE ON terms BEGIN SELECT 1; END;");
  sqlite.run(
    "CREATE TRIGGER custom_term_names_trigger AFTER UPDATE ON term_names BEGIN SELECT 1; END;"
  );
  sqlite.run(
    "INSERT INTO terms (id, canonical_name, kind, status, created_at, updated_at) VALUES ('term-brand-kioku', 'Kioku', 'brand', 'active', '2026-01-01', '2026-01-01'), ('term-brand-target', 'Current', 'brand', 'active', '2026-01-01', '2026-01-01')"
  );
  // The target deliberately has no term_names row: canonical terms are valid
  // recovery candidates even when their registry rows are absent.
  sqlite.run(
    "INSERT INTO term_names (term_id, kind, name, display_name, name_kind, created_at) VALUES ('term-brand-kioku', 'brand', 'kioku', 'Kioku', 'canonical', '2026-01-01')"
  );
  sqlite.run(
    "INSERT INTO migration_journal (id, operation, kind, from_name, to_name, term_id, affected_entity_ids, affected_count, applied_at, dry_run) VALUES ('journal-1', 'rename', 'brand', 'Legacy', 'Kioku', 'term-brand-kioku', '[]', 0, '2026-01-01', 0), ('journal-2', 'deprecate', 'brand', 'Legacy', 'Current', 'term-brand-kioku', '[]', 0, '2026-01-01', 0), ('journal-create-v4', 'create', 'brand', 'Legacy', '  Legacy Create  ', 'term-brand-kioku', '[]', 0, '2026-01-01', 0)"
  );

  migrate(database, { migrationsFolder });
  migrate(database, { migrationsFolder });

  const applied = sqlite
    .query<CountRow, []>("SELECT count(*) AS count FROM __drizzle_migrations")
    .get();
  assert.ok(applied);
  assert.equal(applied.count, 6);
  const termNamesCount = sqlite
    .query<CountRow, []>("SELECT count(*) AS count FROM term_names")
    .get();
  assert.ok(termNamesCount);
  assert.equal(termNamesCount.count, 1);
  const journalCount = sqlite
    .query<CountRow, []>("SELECT count(*) AS count FROM migration_journal")
    .get();
  assert.ok(journalCount);
  assert.equal(journalCount.count, 3);
  assert.deepEqual(
    sqlite
      .query<MigrationJournalRow, []>(
        "SELECT to_name, related_term_id FROM migration_journal WHERE id = 'journal-2'"
      )
      .get(),
    { to_name: "Current", related_term_id: "term-brand-target" }
  );
  assert.deepEqual(
    sqlite
      .query<MigrationJournalRow, []>(
        "SELECT to_name, related_term_id FROM migration_journal WHERE id = 'journal-create-v4'"
      )
      .get(),
    { to_name: "  Legacy Create  ", related_term_id: null }
  );
  sqlite.run(
    "INSERT INTO migration_journal (id, operation, kind, from_name, to_name, term_id, related_term_id, affected_entity_ids, affected_count, applied_at) VALUES ('journal-create-null', 'create', 'brand', 'New', NULL, 'term-brand-kioku', NULL, '[]', 0, '2026-01-01'), ('journal-create-name', 'create', 'brand', 'New', 'New Create', 'term-brand-kioku', NULL, '[]', 0, '2026-01-01')"
  );
  assert.throws(() =>
    sqlite.run(
      "INSERT INTO migration_journal (id, operation, kind, from_name, to_name, term_id, related_term_id, affected_entity_ids, affected_count, applied_at) VALUES ('journal-create-empty', 'create', 'brand', 'New', '   ', 'term-brand-kioku', NULL, '[]', 0, '2026-01-01')"
    )
  );
  assert.throws(() =>
    sqlite.run(
      "INSERT INTO migration_journal (id, operation, kind, from_name, to_name, term_id, related_term_id, affected_entity_ids, affected_count, applied_at) VALUES ('journal-create-related', 'create', 'brand', 'New', NULL, 'term-brand-kioku', 'term-brand-target', '[]', 0, '2026-01-01')"
    )
  );
  assert.throws(() =>
    sqlite.run("UPDATE terms SET canonical_name = 'Foo, Inc.' WHERE id = 'term-brand-kioku'")
  );
  assert.throws(() =>
    sqlite.run(
      "UPDATE terms SET status = 'merged', merged_into_id = NULL WHERE id = 'term-brand-kioku'"
    )
  );
  assert.throws(() =>
    sqlite.run(
      "INSERT INTO terms (id, canonical_name, kind, status, created_at, updated_at, replacement_term_id) VALUES ('bad', 'Bad', 'brand', 'deprecated', '2026-01-01', '2026-01-01', 'missing')"
    )
  );
  for (const triggerName of ["custom_entities_trigger", "custom_terms_trigger"]) {
    assert.equal(
      sqlite
        .query<CountRow, []>(
          `SELECT count(*) AS count FROM sqlite_master WHERE type = 'trigger' AND name = '${triggerName}'`
        )
        .get()?.count,
      1,
      triggerName
    );
  }
  assert.equal(
    sqlite
      .query<CountRow, []>(
        "SELECT count(*) AS count FROM sqlite_master WHERE type = 'trigger' AND name IN ('terms_canonical_name_insert_check', 'terms_canonical_name_update_check')"
      )
      .get()?.count,
    0
  );
  assert.deepEqual(sqlite.query("PRAGMA foreign_key_check").all(), []);
} finally {
  sqlite.close();
  rmSync(legacyFolder, { recursive: true, force: true });
}
