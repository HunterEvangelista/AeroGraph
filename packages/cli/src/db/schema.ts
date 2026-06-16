import {
  type AnySQLiteColumn,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

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

export const tags = sqliteTable(
  "tags",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    parentId: text("parent_id").references((): AnySQLiteColumn => tags.id),
    aliases: text("aliases"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("idx_tags_parent").on(table.parentId)]
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
// or in plain terms kioku next <id> [--related, --traverse]
// we could also expose an index: `kioku next --index 1`
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

export const SCHEMA_VERSION = 2;

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

-- Tags table
CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  parent_id TEXT REFERENCES tags(id),
  aliases TEXT,
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
CREATE TABLE IF NOT EXISTS schema_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

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
  INSERT INTO entities_fts(id, title, content) VALUES (new.id, new.title, new.content);
END;

CREATE TRIGGER IF NOT EXISTS entities_ad AFTER DELETE ON entities BEGIN
  INSERT INTO entities_fts(entities_fts, id, title, content) VALUES('delete', old.id, old.title, old.content);
END;

CREATE TRIGGER IF NOT EXISTS entities_au AFTER UPDATE ON entities BEGIN
  INSERT INTO entities_fts(entities_fts, id, title, content) VALUES('delete', old.id, old.title, old.content);
  INSERT INTO entities_fts(id, title, content) VALUES (new.id, new.title, new.content);
END;
`;

export const INSERT_SCHEMA_VERSION_SQL = `
INSERT OR REPLACE INTO schema_meta (key, value) VALUES ('version', ?);
`;

export const GET_SCHEMA_VERSION_SQL = `
SELECT value FROM schema_meta WHERE key = 'version';
`;
