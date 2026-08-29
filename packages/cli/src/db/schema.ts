import { sql } from "drizzle-orm";
import {
  type AnySQLiteColumn,
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const TERM_KIND_VALUES = [
  "brand",
  "project",
  "feature",
  "api",
  "concept",
  "package",
  "other",
] as const;

export const TERM_STATUS_VALUES = ["active", "deprecated", "merged"] as const;

export const TERM_NAME_KIND_VALUES = ["canonical", "alias", "deprecated"] as const;

export const MIGRATION_OPERATION_VALUES = ["rename", "merge", "deprecate", "create"] as const;

export const sqlStringList = (values: readonly string[]): string =>
  values.map((value) => `'${value}'`).join(", ");

export const TERM_NAME_NORMALIZED_CHECK =
  "name = lower(name) AND name = trim(name) AND instr(name, ' ') = 0 AND instr(name, '_') = 0 AND instr(name, ',') = 0";
export const TERM_CANONICAL_NAME_CHECK = "instr(canonical_name, ',') = 0";
export const TERM_DISPLAY_NAME_CHECK = "instr(display_name, ',') = 0";

const TERM_KIND_CHECK_VALUES = sqlStringList(TERM_KIND_VALUES);
const TERM_STATUS_CHECK_VALUES = sqlStringList(TERM_STATUS_VALUES);
const TERM_NAME_KIND_CHECK_VALUES = sqlStringList(TERM_NAME_KIND_VALUES);
const MIGRATION_OPERATION_CHECK_VALUES = sqlStringList(MIGRATION_OPERATION_VALUES);

/*
 * TODO: Currently there is a gap in sync between domain objects and db objects
 * as part of a broader refactor we need to tie Effect schema generation to drizzle schemas
 * this way our models are synced to the database. You can see an example of this drift in the
 * link definitions in /packages/cli/src/db/link-repository.ts
 * packages/core/src/domain/link.ts, and here, where the shape of a link is defined 3 times.
 */

export const entities = sqliteTable(
  "entities",
  {
    id: text("id").primaryKey(),
    type: text("type", { enum: ["doc", "code_ref", "story", "diagram"] }).notNull(),
    title: text("title").notNull(),
    content: text("content"),
    metadata: text("metadata"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    version: integer("version").notNull().default(1),
  },
  (table) => [index("idx_entities_type").on(table.type)]
);

export const terms = sqliteTable(
  "terms",
  {
    id: text("id").primaryKey(),
    canonicalName: text("canonical_name").notNull(),
    kind: text("kind", { enum: TERM_KIND_VALUES }).notNull(),
    description: text("description"),
    status: text("status", { enum: TERM_STATUS_VALUES }).notNull().default("active"),
    mergedIntoId: text("merged_into_id").references((): AnySQLiteColumn => terms.id),
    replacementTermId: text("replacement_term_id").references((): AnySQLiteColumn => terms.id),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_terms_kind_canonical_name").on(table.kind, table.canonicalName),
    index("idx_terms_status").on(table.status),
    index("idx_terms_merged_into_id").on(table.mergedIntoId),
    check("terms_kind_check", sql`${table.kind} in (${sql.raw(TERM_KIND_CHECK_VALUES)})`),
    check("terms_status_check", sql`${table.status} in (${sql.raw(TERM_STATUS_CHECK_VALUES)})`),
    check(
      "terms_lifecycle_shape_check",
      sql`(${table.status} = 'active' AND ${table.mergedIntoId} IS NULL AND ${table.replacementTermId} IS NULL) OR (${table.status} = 'deprecated' AND ${table.mergedIntoId} IS NULL) OR (${table.status} = 'merged' AND ${table.mergedIntoId} IS NOT NULL AND ${table.replacementTermId} IS NULL)`
    ),
    check("terms_canonical_name_check", sql`instr(${table.canonicalName}, ',') = 0`),
  ]
);

export const termNames = sqliteTable(
  "term_names",
  {
    termId: text("term_id")
      .notNull()
      .references(() => terms.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: TERM_KIND_VALUES }).notNull(),
    name: text("name").notNull(),
    displayName: text("display_name").notNull(),
    nameKind: text("name_kind", { enum: TERM_NAME_KIND_VALUES }).notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.termId, table.name] }),
    uniqueIndex("idx_term_names_kind_name").on(table.kind, table.name),
    uniqueIndex("idx_term_names_one_canonical")
      .on(table.termId)
      .where(sql`${table.nameKind} = 'canonical'`),
    index("idx_term_names_name").on(table.name),
    check("term_names_kind_check", sql`${table.kind} in (${sql.raw(TERM_KIND_CHECK_VALUES)})`),
    check(
      "term_names_name_normalized_check",
      sql`${table.name} = lower(${table.name}) AND ${table.name} = trim(${table.name}) AND instr(${table.name}, ' ') = 0 AND instr(${table.name}, '_') = 0 AND instr(${table.name}, ',') = 0`
    ),
    check(
      "term_names_name_kind_check",
      sql`${table.nameKind} in (${sql.raw(TERM_NAME_KIND_CHECK_VALUES)})`
    ),
    check("term_names_display_name_check", sql`instr(${table.displayName}, ',') = 0`),
  ]
);

export const migrationJournal = sqliteTable(
  "migration_journal",
  {
    id: text("id").primaryKey(),
    operation: text("operation", { enum: MIGRATION_OPERATION_VALUES }).notNull(),
    kind: text("kind", { enum: TERM_KIND_VALUES }),
    fromName: text("from_name").notNull(),
    toName: text("to_name"),
    termId: text("term_id")
      .notNull()
      .references(() => terms.id),
    relatedTermId: text("related_term_id").references(() => terms.id),
    affectedEntityIds: text("affected_entity_ids").notNull(),
    affectedCount: integer("affected_count").notNull(),
    reason: text("reason"),
    appliedAt: text("applied_at").notNull(),
    appliedBy: text("applied_by"),
    dryRun: integer("dry_run", { mode: "boolean" }).notNull().default(false),
  },
  (table) => [
    index("idx_journal_term").on(table.termId),
    index("idx_journal_related_term").on(table.relatedTermId),
    index("idx_journal_applied_at").on(table.appliedAt),
    check(
      "migration_journal_operation_check",
      sql`${table.operation} in (${sql.raw(MIGRATION_OPERATION_CHECK_VALUES)})`
    ),
    check(
      "migration_journal_kind_check",
      sql`${table.kind} is null OR ${table.kind} in (${sql.raw(TERM_KIND_CHECK_VALUES)})`
    ),
    check(
      "migration_journal_semantics_check",
      sql`(${table.operation} = 'create' AND (${table.toName} IS NULL OR length(trim(${table.toName})) > 0) AND ${table.relatedTermId} IS NULL) OR (${table.operation} = 'rename' AND ${table.toName} IS NOT NULL AND length(trim(${table.toName})) > 0 AND ${table.relatedTermId} IS NULL) OR (${table.operation} = 'merge' AND ${table.toName} IS NOT NULL AND length(trim(${table.toName})) > 0 AND ${table.relatedTermId} IS NOT NULL) OR (${table.operation} = 'deprecate' AND ((${table.toName} IS NULL AND ${table.relatedTermId} IS NULL) OR (${table.toName} IS NOT NULL AND length(trim(${table.toName})) > 0 AND ${table.relatedTermId} IS NOT NULL)))`
    ),
  ]
);

export const tags = sqliteTable(
  "tags",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    parentId: text("parent_id").references((): AnySQLiteColumn => tags.id),
    aliases: text("aliases"),
    termId: text("term_id"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("idx_tags_parent").on(table.parentId), index("idx_tags_term").on(table.termId)]
);

export const entityTags = sqliteTable(
  "entity_tags",
  {
    entityId: text("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.entityId, table.tagId] }),
    index("idx_entity_tags_tag").on(table.tagId),
  ]
);

export const links = sqliteTable(
  "links",
  {
    id: text("id").primaryKey(),
    sourceId: text("source_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    targetId: text("target_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    type: text("type", {
      enum: ["references", "parent_of", "child_of", "blocks", "blocked_by", "related_to"],
    }).notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_links_source").on(table.sourceId),
    index("idx_links_target").on(table.targetId),
  ]
);

export const entityVersions = sqliteTable(
  "entity_versions",
  {
    id: text("id").primaryKey(),
    entityId: text("entity_id").notNull(),
    version: integer("version").notNull(),
    data: text("data").notNull(),
    changeType: text("change_type", { enum: ["create", "update", "delete"] }).notNull(),
    changedFields: text("changed_fields"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("entity_versions_entity_id_version_unique").on(table.entityId, table.version),
    index("idx_entity_versions_entity").on(table.entityId),
  ]
);

export const entityIdPrefixes = sqliteTable(
  "entity_id_prefixes",
  {
    scope: text("scope").notNull(),
    entityId: text("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    prefix: text("prefix").notNull(),
    prefixLength: integer("prefix_length").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.scope, table.entityId] }),
    uniqueIndex("idx_entity_id_prefixes_scope_prefix").on(table.scope, table.prefix),
    index("idx_entity_id_prefixes_entity").on(table.entityId),
  ]
);

// NOTE: if this is still here in the PR flag to delete comments before merging.
// next commands are related to an entity
// if you're shown entity `39` then you get a next --related-to
// or a next --traverse
// I think now it may be better to do something like next 39 --related
// or in plain terms aerograph next <id> [--related, --traverse]
// we could also expose an index: `aerograph next --index 1`
export const nextCommands = sqliteTable(
  "next_commands",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    entityId: text("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    prefix: text("prefix").notNull(),
    commandType: text("command_type", { enum: ["traverse", "related_to"] }).notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_next_commands_entity").on(table.entityId),
    index("idx_next_commands_command_type").on(table.commandType),
  ]
);

export const schemaMeta = sqliteTable("schema_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const SCHEMA_VERSION = 6;

export const CREATE_SCHEMA_META_SQL = `
CREATE TABLE IF NOT EXISTS schema_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

export const CREATE_TABLES_SQL = `
-- Entities table (stores current state)
CREATE TABLE IF NOT EXISTS entities (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('doc', 'code_ref', 'story', 'diagram')),
  title TEXT NOT NULL,
  content TEXT,
  metadata TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);

-- Terms registry (governed canonical identity for tags)
CREATE TABLE IF NOT EXISTS terms (
  id TEXT PRIMARY KEY,
  canonical_name TEXT NOT NULL CHECK(${TERM_CANONICAL_NAME_CHECK}),
  kind TEXT NOT NULL CHECK(kind IN (${TERM_KIND_CHECK_VALUES})),
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN (${TERM_STATUS_CHECK_VALUES})),
  merged_into_id TEXT REFERENCES terms(id),
  replacement_term_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (replacement_term_id) REFERENCES terms(id),
  CONSTRAINT terms_lifecycle_shape_check CHECK((status = 'active' AND merged_into_id IS NULL AND replacement_term_id IS NULL) OR (status = 'deprecated' AND merged_into_id IS NULL) OR (status = 'merged' AND merged_into_id IS NOT NULL AND replacement_term_id IS NULL))
);

-- Term names (maps canonical, alias, and deprecated names to a term)
CREATE INDEX IF NOT EXISTS idx_terms_merged_into_id ON terms(merged_into_id);

CREATE TABLE IF NOT EXISTS term_names (
  term_id TEXT NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN (${TERM_KIND_CHECK_VALUES})),
  name TEXT NOT NULL CHECK(${TERM_NAME_NORMALIZED_CHECK}),
  display_name TEXT NOT NULL CHECK(${TERM_DISPLAY_NAME_CHECK}),
  name_kind TEXT NOT NULL CHECK(name_kind IN (${TERM_NAME_KIND_CHECK_VALUES})),
  created_at TEXT NOT NULL,
  PRIMARY KEY (term_id, name)
);

-- Migration journal (audit log of rename/merge/deprecate operations)
CREATE TABLE IF NOT EXISTS migration_journal (
  id TEXT PRIMARY KEY,
  operation TEXT NOT NULL CHECK(operation IN (${MIGRATION_OPERATION_CHECK_VALUES})),
  kind TEXT CHECK(kind IN (${TERM_KIND_CHECK_VALUES})),
  from_name TEXT NOT NULL,
  to_name TEXT,
  term_id TEXT NOT NULL REFERENCES terms(id),
  related_term_id TEXT,
  affected_entity_ids TEXT NOT NULL,
  affected_count INTEGER NOT NULL,
  reason TEXT,
  applied_at TEXT NOT NULL,
  applied_by TEXT,
  dry_run INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (related_term_id) REFERENCES terms(id),
  CONSTRAINT migration_journal_semantics_check CHECK((operation = 'create' AND (to_name IS NULL OR length(trim(to_name)) > 0) AND related_term_id IS NULL) OR (operation = 'rename' AND to_name IS NOT NULL AND length(trim(to_name)) > 0 AND related_term_id IS NULL) OR (operation = 'merge' AND to_name IS NOT NULL AND length(trim(to_name)) > 0 AND related_term_id IS NOT NULL) OR (operation = 'deprecate' AND ((to_name IS NULL AND related_term_id IS NULL) OR (to_name IS NOT NULL AND length(trim(to_name)) > 0 AND related_term_id IS NOT NULL))))
);

-- Tags table
CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  parent_id TEXT REFERENCES tags(id),
  aliases TEXT,
  term_id TEXT,
  created_at TEXT NOT NULL
);

-- Entity-Tag junction table
CREATE TABLE IF NOT EXISTS entity_tags (
  entity_id TEXT REFERENCES entities(id) ON DELETE CASCADE,
  tag_id TEXT REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (entity_id, tag_id)
);

-- Links table
CREATE TABLE IF NOT EXISTS links (
  id TEXT PRIMARY KEY,
  source_id TEXT REFERENCES entities(id) ON DELETE CASCADE,
  target_id TEXT REFERENCES entities(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK(type IN ('references', 'parent_of', 'child_of', 'blocks', 'blocked_by', 'related_to')),
  created_at TEXT NOT NULL
);

-- Version history table
CREATE TABLE IF NOT EXISTS entity_versions (
  id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  data TEXT NOT NULL,
  change_type TEXT NOT NULL CHECK(change_type IN ('create', 'update', 'delete')),
  changed_fields TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(entity_id, version)
);

-- Shortest runnable entity ID prefixes by scope
CREATE TABLE IF NOT EXISTS entity_id_prefixes (
  scope TEXT NOT NULL,
  entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  prefix TEXT NOT NULL,
  prefix_length INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (scope, entity_id),
  UNIQUE(scope, prefix)
);

-- Runnable follow-up actions for entities shown in CLI output
CREATE TABLE IF NOT EXISTS next_commands (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  prefix TEXT NOT NULL,
  command_type TEXT NOT NULL CHECK(command_type IN ('traverse', 'related_to')),
  created_at TEXT NOT NULL
);

-- Schema metadata table
${CREATE_SCHEMA_META_SQL}

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type);
CREATE INDEX IF NOT EXISTS idx_entity_tags_tag ON entity_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_links_source ON links(source_id);
CREATE INDEX IF NOT EXISTS idx_links_target ON links(target_id);
CREATE INDEX IF NOT EXISTS idx_entity_versions_entity ON entity_versions(entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_id_prefixes_entity ON entity_id_prefixes(entity_id);
CREATE INDEX IF NOT EXISTS idx_next_commands_entity ON next_commands(entity_id);
CREATE INDEX IF NOT EXISTS idx_next_commands_command_type ON next_commands(command_type);
CREATE INDEX IF NOT EXISTS idx_tags_parent ON tags(parent_id);
CREATE INDEX IF NOT EXISTS idx_tags_term ON tags(term_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_terms_kind_canonical_name ON terms(kind, canonical_name);
CREATE INDEX IF NOT EXISTS idx_terms_status ON terms(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_term_names_kind_name ON term_names(kind, name);
CREATE UNIQUE INDEX IF NOT EXISTS idx_term_names_one_canonical ON term_names(term_id) WHERE name_kind = 'canonical';
CREATE INDEX IF NOT EXISTS idx_term_names_name ON term_names(name);
CREATE INDEX IF NOT EXISTS idx_journal_term ON migration_journal(term_id);
CREATE INDEX IF NOT EXISTS idx_journal_related_term ON migration_journal(related_term_id);
CREATE INDEX IF NOT EXISTS idx_journal_applied_at ON migration_journal(applied_at);

-- Full-text search for entities
CREATE VIRTUAL TABLE IF NOT EXISTS entities_fts USING fts5(
  id,
  title,
  content,
  content='entities',
  content_rowid='rowid'
);

-- Triggers to keep FTS in sync
CREATE TRIGGER IF NOT EXISTS entities_ai AFTER INSERT ON entities BEGIN
  INSERT INTO entities_fts(rowid, id, title, content)
  VALUES (new.rowid, new.id, new.title, new.content);
END;

CREATE TRIGGER IF NOT EXISTS entities_ad AFTER DELETE ON entities BEGIN
  INSERT INTO entities_fts(entities_fts, rowid, id, title, content)
  VALUES('delete', old.rowid, old.id, old.title, old.content);
END;

CREATE TRIGGER IF NOT EXISTS entities_au AFTER UPDATE ON entities BEGIN
  INSERT INTO entities_fts(entities_fts, rowid, id, title, content)
  VALUES('delete', old.rowid, old.id, old.title, old.content);
  INSERT INTO entities_fts(rowid, id, title, content)
  VALUES(new.rowid, new.id, new.title, new.content);
END;
`;

export const INSERT_SCHEMA_VERSION_SQL = `
INSERT OR REPLACE INTO schema_meta (key, value) VALUES ('version', ?);
`;

export const GET_SCHEMA_VERSION_SQL = `
SELECT value FROM schema_meta WHERE key = 'version';
`;
