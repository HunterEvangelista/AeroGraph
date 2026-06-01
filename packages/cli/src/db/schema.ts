/**
 * SQLite Schema
 * Database DDL for the knowledge graph
 */

export const SCHEMA_VERSION = 1;

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
