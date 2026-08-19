import { Database } from "bun:sqlite";

const root = process.argv[2];
if (!root) throw new Error("Workspace path is required");

const database = new Database(`${root}/.aerograph/aerograph.db`, { readonly: true });
try {
  console.log(
    JSON.stringify({
      entities: database.query("SELECT * FROM entities ORDER BY id").all(),
      entityTags: database.query("SELECT * FROM entity_tags ORDER BY entity_id, tag_id").all(),
      links: database.query("SELECT * FROM links ORDER BY id").all(),
      tags: database.query("SELECT * FROM tags ORDER BY id").all(),
      terms: database.query("SELECT * FROM terms ORDER BY id").all(),
      termNames: database.query("SELECT * FROM term_names ORDER BY term_id, name").all(),
      migrationJournal: database.query("SELECT * FROM migration_journal ORDER BY id").all(),
    })
  );
} finally {
  database.close();
}
