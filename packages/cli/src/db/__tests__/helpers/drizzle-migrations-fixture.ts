import { Database } from "bun:sqlite";
import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";

const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../drizzle");
const legacyFolder = mkdtempSync(resolve(tmpdir(), "kioku-drizzle-v2-"));
mkdirSync(resolve(legacyFolder, "meta"));
const journal = JSON.parse(
  readFileSync(resolve(migrationsFolder, "meta/_journal.json"), "utf8")
) as { entries: Array<{ tag: string }> };
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
    "INSERT INTO terms (id, canonical_name, kind, status, created_at, updated_at) VALUES ('term-brand-kioku', 'Kioku', 'brand', 'active', '2026-01-01', '2026-01-01')"
  );
  sqlite.run(
    "INSERT INTO term_names (term_id, kind, name, display_name, name_kind, created_at) VALUES ('term-brand-kioku', 'brand', 'kioku', 'Kioku', 'canonical', '2026-01-01')"
  );
  sqlite.run(
    "INSERT INTO migration_journal (id, operation, kind, from_name, to_name, term_id, affected_entity_ids, affected_count, applied_at, dry_run) VALUES ('journal-1', 'rename', 'brand', 'Legacy', 'Kioku', 'term-brand-kioku', '[]', 0, '2026-01-01', 0)"
  );

  migrate(database, { migrationsFolder });
  migrate(database, { migrationsFolder });

  const applied = sqlite.query("SELECT count(*) AS count FROM __drizzle_migrations").get() as {
    count: number;
  };
  assert.equal(applied.count, 4);
  assert.equal(
    (sqlite.query("SELECT count(*) AS count FROM term_names").get() as { count: number }).count,
    1
  );
  assert.equal(
    (sqlite.query("SELECT count(*) AS count FROM migration_journal").get() as { count: number })
      .count,
    1
  );
  assert.throws(() =>
    sqlite.run("UPDATE terms SET canonical_name = 'Foo, Inc.' WHERE id = 'term-brand-kioku'")
  );
  assert.deepEqual(sqlite.query("PRAGMA foreign_key_check").all(), []);
} finally {
  sqlite.close();
  rmSync(legacyFolder, { recursive: true, force: true });
}
