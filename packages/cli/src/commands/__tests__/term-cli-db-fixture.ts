import { Database } from "bun:sqlite";

const root = process.argv[2];
const operation = process.argv[3];
if (!root || !operation) throw new Error("Workspace path and operation are required");

const database = new Database(
  `${root}/.aerograph/aerograph.db`,
  operation === "state" ? { readonly: true } : undefined
);
try {
  if (operation === "state") {
    const state = {
      terms: database.query("SELECT * FROM terms ORDER BY id").all(),
      term_names: database.query("SELECT * FROM term_names ORDER BY term_id, name").all(),
      tags: database.query("SELECT * FROM tags ORDER BY id").all(),
      entity_tags: database.query("SELECT * FROM entity_tags ORDER BY entity_id, tag_id").all(),
      migration_journal: database.query("SELECT * FROM migration_journal ORDER BY id").all(),
    };
    console.log(JSON.stringify(state));
  } else if (operation === "insert-unrelated-journal") {
    database.run(
      "INSERT INTO migration_journal (id, operation, kind, from_name, to_name, term_id, related_term_id, affected_entity_ids, affected_count, reason, applied_at, applied_by, dry_run) VALUES (?, 'rename', 'api', ?, ?, ?, NULL, '[]', 0, ?, ?, ?, 0)",
      [
        "unrelated-rename",
        "New API",
        "New API",
        "term-new-api",
        "fixture",
        "2026-01-01T00:00:00.000Z",
        "fixture",
      ]
    );
  } else {
    throw new Error(`Unsupported operation: ${operation}`);
  }
} finally {
  database.close();
}
