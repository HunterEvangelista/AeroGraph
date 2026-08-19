/**
 * SQLite Database Client
 * Manages database connection and initialization
 */
import { Database, type SQLQueryBindings } from "bun:sqlite";
import { DatabaseError, MigrationError, normalizeTermName } from "@aerograph/core";
import { type BunSQLiteDatabase, drizzle } from "drizzle-orm/bun-sqlite";
import { Context, Effect, Layer } from "effect";
import { rebuildEntityIdPrefixes } from "./entity-prefix-index";
import * as schema from "./schema";
import {
  CREATE_SCHEMA_META_SQL,
  CREATE_TABLES_SQL,
  GET_SCHEMA_VERSION_SQL,
  INSERT_SCHEMA_VERSION_SQL,
  SCHEMA_VERSION,
  sqlStringList,
  TERM_CANONICAL_NAME_CHECK,
  TERM_DISPLAY_NAME_CHECK,
  TERM_KIND_VALUES,
  TERM_NAME_KIND_VALUES,
  TERM_NAME_NORMALIZED_CHECK,
  TERM_STATUS_VALUES,
} from "./schema";

// ============================================================================
// Database Client Interface
// ============================================================================

export interface DatabaseClient {
  readonly db: Database;
  readonly drizzle: BunSQLiteDatabase<typeof schema>;
  readonly close: Effect.Effect<void, DatabaseError>;
}

// ============================================================================
// Database Client Tag
// ============================================================================

export class DatabaseClientTag extends Context.Service<DatabaseClientTag, DatabaseClient>()(
  "DatabaseClient"
) {}

// ============================================================================
// Database Client Implementation
// ============================================================================

const configureDatabaseConnection = (
  db: Database,
  dbPath: string
): Effect.Effect<void, MigrationError> =>
  Effect.try({
    try: () => {
      db.run("PRAGMA busy_timeout = 5000;");

      if (dbPath !== ":memory:") {
        db.run("PRAGMA journal_mode = WAL;");
        db.run("PRAGMA synchronous = NORMAL;");
      }

      db.run("PRAGMA foreign_keys = ON;");
    },
    catch: (error) =>
      new MigrationError({
        message: `Failed to configure database connection: ${error instanceof Error ? error.message : String(error)}`,
        cause: error,
      }),
  });

const addColumnIfMissing = (
  db: Database,
  table: string,
  column: string,
  definition: string
): void => {
  const columns = db
    .query<{ name: string }, SQLQueryBindings[]>(`PRAGMA table_info(${table})`)
    .all();
  if (columns.length === 0) return;
  if (!columns.some((c) => c.name === column)) {
    db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`);
  }
};

const tableExists = (db: Database, table: string): boolean =>
  Boolean(db.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table));

interface LegacyTermNameRow {
  readonly termId: string;
  readonly name: string;
  readonly displayName: string;
  readonly nameKind: string;
  readonly createdAt: string;
  readonly termKind: string | null;
}

interface LegacyTermRow {
  readonly id: string;
  readonly canonicalName: string;
}

interface LegacyLifecycleRow {
  readonly id: string;
  readonly status: string;
  readonly mergedIntoId: string | null;
}

interface LegacyJournalRow {
  readonly id: string;
  readonly operation: string;
  readonly kind: string | null;
  readonly fromName: string;
  readonly toName: string;
  readonly termId: string;
  readonly affectedEntityIds: string;
  readonly affectedCount: number;
  readonly reason: string | null;
  readonly appliedAt: string;
  readonly appliedBy: string | null;
  readonly dryRun: number;
}

interface LegacyJournalResolution {
  readonly row: LegacyJournalRow;
  readonly relatedTermId: string | null;
}

const RETIRED_V4_CANONICAL_TRIGGERS = new Set([
  "terms_canonical_name_insert_check",
  "terms_canonical_name_update_check",
]);

const validateLegacyTerms = (db: Database): void => {
  const terms = db
    .query<LegacyTermRow, SQLQueryBindings[]>(
      "SELECT id, canonical_name AS canonicalName FROM terms"
    )
    .all();
  for (const term of terms) {
    if (!term.canonicalName.trim() || term.canonicalName.includes(",")) {
      throw new Error(`Cannot migrate term '${term.id}': invalid canonical name.`);
    }
  }
};

const rebuildTermsV4 = (db: Database): void => {
  validateLegacyTerms(db);
  db.run("DROP TABLE IF EXISTS terms_v4;");
  db.run(`
    CREATE TABLE terms_v4 (
      id TEXT PRIMARY KEY,
      canonical_name TEXT NOT NULL CHECK(${TERM_CANONICAL_NAME_CHECK}),
      kind TEXT NOT NULL CHECK(kind IN (${sqlStringList(TERM_KIND_VALUES)})),
      description TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN (${sqlStringList(TERM_STATUS_VALUES)})),
      merged_into_id TEXT REFERENCES terms(id),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  db.run(`
    INSERT INTO terms_v4 (
      id, canonical_name, kind, description, status, merged_into_id, created_at, updated_at
    )
    SELECT id, canonical_name, kind, description, status, merged_into_id, created_at, updated_at
    FROM terms;
  `);
  db.run("DROP TABLE terms;");
  db.run("ALTER TABLE terms_v4 RENAME TO terms;");
  db.run("CREATE UNIQUE INDEX idx_terms_kind_canonical_name ON terms(kind, canonical_name);");
  db.run("CREATE INDEX idx_terms_status ON terms(status);");
  db.run("CREATE INDEX idx_terms_merged_into_id ON terms(merged_into_id);");
};

const normalizeLegacyTermName = (row: LegacyTermNameRow): string => {
  if (!row.termKind || !new Set<string>(TERM_KIND_VALUES).has(row.termKind)) {
    throw new Error(`Cannot migrate term name '${row.name}': invalid or missing term kind.`);
  }
  if (!new Set<string>(TERM_NAME_KIND_VALUES).has(row.nameKind)) {
    throw new Error(`Cannot migrate term name '${row.name}': invalid name kind.`);
  }
  if (!row.displayName.trim() || row.displayName.includes(",")) {
    throw new Error(`Cannot migrate term name '${row.name}': invalid display name.`);
  }
  const normalizedName = normalizeTermName(row.name);
  if (!normalizedName || normalizedName.includes(",")) {
    throw new Error(`Cannot migrate term name '${row.name}': invalid normalized name.`);
  }
  return normalizedName;
};

const validateLegacyLifecycle = (db: Database): void => {
  const rows = db
    .query<LegacyLifecycleRow, SQLQueryBindings[]>(
      "SELECT id, status, merged_into_id AS mergedIntoId FROM terms ORDER BY id"
    )
    .all();

  for (const row of rows) {
    if (row.status === "active" && row.mergedIntoId !== null) {
      throw new Error(
        `Cannot migrate term '${row.id}': active terms cannot have a merge destination.`
      );
    }
    if (row.status === "deprecated" && row.mergedIntoId !== null) {
      throw new Error(
        `Cannot migrate term '${row.id}': deprecated terms cannot have a merge destination.`
      );
    }
    if (row.status === "merged" && row.mergedIntoId === null) {
      throw new Error(`Cannot migrate term '${row.id}': merged terms require a merge destination.`);
    }
    if (!["active", "deprecated", "merged"].includes(row.status)) {
      throw new Error(`Cannot migrate term '${row.id}': invalid lifecycle status '${row.status}'.`);
    }
  }
};

const rebuildTermsV5 = (db: Database): void => {
  validateLegacyLifecycle(db);
  db.run("DROP TABLE IF EXISTS terms_v5;");
  db.run(`
    CREATE TABLE terms_v5 (
      id TEXT PRIMARY KEY,
      canonical_name TEXT NOT NULL CHECK(${TERM_CANONICAL_NAME_CHECK}),
      kind TEXT NOT NULL CHECK(kind IN (${sqlStringList(TERM_KIND_VALUES)})),
      description TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN (${sqlStringList(TERM_STATUS_VALUES)})),
      merged_into_id TEXT REFERENCES terms(id),
      replacement_term_id TEXT REFERENCES terms(id),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      CONSTRAINT terms_lifecycle_shape_check CHECK((status = 'active' AND merged_into_id IS NULL AND replacement_term_id IS NULL) OR (status = 'deprecated' AND merged_into_id IS NULL) OR (status = 'merged' AND merged_into_id IS NOT NULL AND replacement_term_id IS NULL))
    );
  `);
  db.run(`
    INSERT INTO terms_v5 (
      id, canonical_name, kind, description, status, merged_into_id,
      replacement_term_id, created_at, updated_at
    )
    SELECT id, canonical_name, kind, description, status, merged_into_id,
      NULL, created_at, updated_at
    FROM terms;
  `);
  db.run("DROP TABLE terms;");
  db.run("ALTER TABLE terms_v5 RENAME TO terms;");
  db.run("CREATE UNIQUE INDEX idx_terms_kind_canonical_name ON terms(kind, canonical_name);");
  db.run("CREATE INDEX idx_terms_status ON terms(status);");
  db.run("CREATE INDEX idx_terms_merged_into_id ON terms(merged_into_id);");
};

const legacyJournalRows = (db: Database): LegacyJournalRow[] =>
  tableExists(db, "migration_journal")
    ? db
        .query<LegacyJournalRow, SQLQueryBindings[]>(`
      SELECT id, operation, kind, from_name AS fromName, to_name AS toName,
        term_id AS termId, affected_entity_ids AS affectedEntityIds,
        affected_count AS affectedCount, reason, applied_at AS appliedAt,
        applied_by AS appliedBy, dry_run AS dryRun
      FROM migration_journal ORDER BY rowid
    `)
        .all()
    : [];

/**
 * Resolve v4 audit relations before any table is rebuilt. The old canonical
 * name is not authoritative: a durable journal may point at a name that is
 * now an alias or deprecated name. Every matching registry row is considered,
 * and a relation is accepted only when it identifies exactly one term.
 */
const resolveLegacyJournalRelation = (db: Database, row: LegacyJournalRow): string | null => {
  if (row.operation !== "merge" && row.operation !== "deprecate") return null;
  const source = db
    .query<{ kind: string; mergedIntoId: string | null }, SQLQueryBindings[]>(
      "SELECT kind, merged_into_id AS mergedIntoId FROM terms WHERE id = ?"
    )
    .get(row.termId);
  if (!source) throw new Error(`Cannot migrate journal '${row.id}': source term is missing.`);

  const candidates = new Set<string>();
  if (row.operation === "merge" && source.mergedIntoId) {
    const directTarget = db
      .query<{ id: string }, SQLQueryBindings[]>("SELECT id FROM terms WHERE id = ? AND kind = ?")
      .get(source.mergedIntoId, source.kind);
    if (directTarget) candidates.add(directTarget.id);
  }

  const normalized = normalizeTermName(row.toName);
  const matchingTerms = db
    .query<{ id: string }, SQLQueryBindings[]>(`
      SELECT DISTINCT t.id AS id
      FROM terms t
      LEFT JOIN term_names n ON n.term_id = t.id AND n.kind = t.kind
      WHERE t.kind = ? AND (
        lower(trim(t.canonical_name)) = lower(trim(?))
        OR lower(trim(n.display_name)) = lower(trim(?))
        OR n.name = ?
      )
    `)
    .all(source.kind, row.toName, row.toName, normalized);
  for (const candidate of matchingTerms) candidates.add(candidate.id);

  if (candidates.size !== 1) {
    const outcome = candidates.size === 0 ? "missing" : "ambiguous";
    throw new Error(
      `Cannot migrate journal '${row.id}': ${outcome} ${row.operation} target '${row.toName}'.`
    );
  }
  return [...candidates][0] ?? null;
};

const captureUnmanagedTriggers = (db: Database): string[] =>
  db
    .query<{ name: string; sql: string }, SQLQueryBindings[]>(
      "SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND sql IS NOT NULL"
    )
    .all() // Keep custom triggers across rebuilt tables.
    .filter(({ name }) => !RETIRED_V4_CANONICAL_TRIGGERS.has(name))
    .map(({ sql }) => sql);

const restoreUnmanagedTriggers = (db: Database, triggerSql: ReadonlyArray<string>): void => {
  const existing = new Set(
    db
      .query<{ name: string }, SQLQueryBindings[]>(
        "SELECT name FROM sqlite_master WHERE type = 'trigger'"
      )
      .all()
      .map(({ name }) => name)
  );
  for (const sql of triggerSql) {
    const name = /^CREATE TRIGGER(?: IF NOT EXISTS)?\s+[`"]?([^`"\s]+)[`"]?/i.exec(sql)?.[1];
    if (name && !existing.has(name)) db.run(sql);
  }
};

const rebuildMigrationJournalV5 = (
  db: Database,
  resolutions: ReadonlyArray<LegacyJournalResolution>
): void => {
  db.run("DROP TABLE IF EXISTS migration_journal_v5;");
  db.run(`
    CREATE TABLE migration_journal_v5 (
      id TEXT PRIMARY KEY,
      operation TEXT NOT NULL CHECK(operation IN (${sqlStringList(["rename", "merge", "deprecate", "create"])})),
      kind TEXT CHECK(kind IS NULL OR kind IN (${sqlStringList(TERM_KIND_VALUES)})),
      from_name TEXT NOT NULL,
      to_name TEXT,
      term_id TEXT NOT NULL REFERENCES terms(id),
      related_term_id TEXT REFERENCES terms(id),
      affected_entity_ids TEXT NOT NULL,
      affected_count INTEGER NOT NULL,
      reason TEXT,
      applied_at TEXT NOT NULL,
      applied_by TEXT,
      dry_run INTEGER NOT NULL DEFAULT 0,
      CONSTRAINT migration_journal_semantics_check CHECK((operation = 'create' AND (to_name IS NULL OR length(trim(to_name)) > 0) AND related_term_id IS NULL) OR (operation = 'rename' AND to_name IS NOT NULL AND length(trim(to_name)) > 0 AND related_term_id IS NULL) OR (operation = 'merge' AND to_name IS NOT NULL AND length(trim(to_name)) > 0 AND related_term_id IS NOT NULL) OR (operation = 'deprecate' AND ((to_name IS NULL AND related_term_id IS NULL) OR (to_name IS NOT NULL AND length(trim(to_name)) > 0 AND related_term_id IS NOT NULL))))
    );
  `);
  const insert = db.prepare(`
    INSERT INTO migration_journal_v5 (
      id, operation, kind, from_name, to_name, term_id, related_term_id,
      affected_entity_ids, affected_count, reason, applied_at, applied_by, dry_run
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const { row, relatedTermId } of resolutions) {
    // Preserve the historical spelling verbatim. In particular, do not turn
    // an unrecoverable deprecation target into NULL: resolution was validated
    // before this table rebuild and an invalid row must abort the transaction.
    insert.run(
      row.id,
      row.operation,
      row.kind,
      row.fromName,
      row.toName,
      row.termId,
      relatedTermId,
      row.affectedEntityIds,
      row.affectedCount,
      row.reason,
      row.appliedAt,
      row.appliedBy,
      row.dryRun
    );
  }

  db.run("DROP TABLE migration_journal;");
  db.run("ALTER TABLE migration_journal_v5 RENAME TO migration_journal;");
  db.run("CREATE INDEX idx_journal_term ON migration_journal(term_id);");
  db.run("CREATE INDEX idx_journal_related_term ON migration_journal(related_term_id);");
  db.run("CREATE INDEX idx_journal_applied_at ON migration_journal(applied_at);");
};
const rebuildTermNamesV4 = (db: Database): void => {
  const rows = db
    .query<LegacyTermNameRow, SQLQueryBindings[]>(
      `SELECT
        term_names.term_id AS termId,
        term_names.name AS name,
        term_names.display_name AS displayName,
        term_names.name_kind AS nameKind,
        term_names.created_at AS createdAt,
        terms.kind AS termKind
      FROM term_names
      LEFT JOIN terms ON terms.id = term_names.term_id`
    )
    .all();

  db.run("DROP TABLE IF EXISTS term_names_v4;");
  db.run(`
    CREATE TABLE term_names_v4 (
      term_id TEXT NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK(kind IN (${sqlStringList(TERM_KIND_VALUES)})),
      name TEXT NOT NULL CHECK(${TERM_NAME_NORMALIZED_CHECK}),
      display_name TEXT NOT NULL CHECK(${TERM_DISPLAY_NAME_CHECK}),
      name_kind TEXT NOT NULL CHECK(name_kind IN (${sqlStringList(TERM_NAME_KIND_VALUES)})),
      created_at TEXT NOT NULL,
      PRIMARY KEY (term_id, name)
    );
  `);
  const insert = db.prepare(
    "INSERT INTO term_names_v4 (term_id, kind, name, display_name, name_kind, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  );

  for (const row of rows) {
    const normalizedName = normalizeLegacyTermName(row);
    insert.run(
      row.termId,
      row.termKind,
      normalizedName,
      row.displayName,
      row.nameKind,
      row.createdAt
    );
  }

  db.run("DROP TABLE term_names;");
  db.run("ALTER TABLE term_names_v4 RENAME TO term_names;");
  db.run("CREATE UNIQUE INDEX idx_term_names_kind_name ON term_names(kind, name);");
  db.run(
    "CREATE UNIQUE INDEX idx_term_names_one_canonical ON term_names(term_id) WHERE name_kind = 'canonical';"
  );
  db.run("CREATE INDEX idx_term_names_name ON term_names(name);");
};

const runMigrations = (db: Database, fromVersion: number): void => {
  if (fromVersion < 2) {
    // v1 -> v2: entity_id_prefixes table (created by CREATE_TABLES_SQL IF NOT EXISTS)
  }
  if (fromVersion < 3) {
    // v2 -> v3: governed term registry. New tables (terms, term_names,
    // migration_journal) are created by CREATE_TABLES_SQL. Only the tags.term_id
    // column requires an explicit ALTER because CREATE TABLE IF NOT EXISTS won't
    // modify an existing table. Must run before CREATE_TABLES_SQL so the index
    // idx_tags_term can reference the column.
    addColumnIfMissing(db, "tags", "term_id", "TEXT");
  }
  if (fromVersion < 4 && tableExists(db, "term_names")) {
    // v3 -> v4: rebuild so existing rows receive normalized names, kind scope,
    // and the same constraints as a newly created v4 database.
    rebuildTermsV4(db);
    rebuildTermNamesV4(db);
    db.run("DROP INDEX IF EXISTS idx_terms_canonical_name;");
  }
  if (fromVersion < 5 && tableExists(db, "terms")) {
    // v4 -> v5: validate every journal relation before the journal rebuild.
    // Runtime/user DB upgrades preserve triggers dynamically; this application
    // upgrader owns that behavior, while Drizzle migrations manage project schema.
    // This is deliberately transactional: an absent or ambiguous historical
    // target must leave the v4 schema, version, and audit data untouched.
    const triggerSql = captureUnmanagedTriggers(db);
    const hasJournal = tableExists(db, "migration_journal");
    const resolutions = legacyJournalRows(db).map((row) => ({
      row,
      relatedTermId: resolveLegacyJournalRelation(db, row),
    }));
    rebuildTermsV5(db);
    if (hasJournal) rebuildMigrationJournalV5(db, resolutions);
    // Retire only the two managed v4 triggers. The named CHECK is now the
    // canonical invariant; unrelated user triggers are restored unchanged.
    // (The static Drizzle journal rebuild has no arbitrary-trigger preservation.)
    restoreUnmanagedTriggers(db, triggerSql);
    db.run("DROP TRIGGER IF EXISTS terms_canonical_name_insert_check;");
    db.run("DROP TRIGGER IF EXISTS terms_canonical_name_update_check;");
  }
};

const initializeDatabase = (db: Database): Effect.Effect<void, MigrationError> =>
  Effect.try({
    try: () => {
      // TODO: This is in a transitional state and requires drizzle running on start up
      // before we can migrate away.
      db.run(CREATE_SCHEMA_META_SQL);

      // Check/set schema version
      const versionResult = db
        .query<{ value: string }, SQLQueryBindings[]>(GET_SCHEMA_VERSION_SQL)
        .get();

      if (!versionResult) {
        // First time setup — CREATE_TABLES_SQL creates everything fresh
        db.transaction(() => {
          db.run(CREATE_TABLES_SQL);
          db.run(INSERT_SCHEMA_VERSION_SQL, [String(SCHEMA_VERSION)]);
        })();
      } else {
        const currentVersion = Number(versionResult.value);
        if (!Number.isSafeInteger(currentVersion) || currentVersion < 1) {
          throw new Error(`Invalid schema version: ${versionResult.value}`);
        }
        if (currentVersion < SCHEMA_VERSION) {
          db.run("PRAGMA foreign_keys = OFF;");
          try {
            db.transaction(() => {
              // Run column migrations before CREATE_TABLES_SQL so indexes can
              // reference newly added columns.
              runMigrations(db, currentVersion);
              db.run(CREATE_TABLES_SQL);
              const foreignKeyErrors = db.query("PRAGMA foreign_key_check").all();
              if (foreignKeyErrors.length > 0) {
                throw new Error("Foreign key violations found after schema migration.");
              }
              db.run(INSERT_SCHEMA_VERSION_SQL, [String(SCHEMA_VERSION)]);
            })();
          } finally {
            db.run("PRAGMA foreign_keys = ON;");
          }
        } else if (currentVersion > SCHEMA_VERSION) {
          throw new Error(
            `Schema version mismatch: expected ${SCHEMA_VERSION}, got ${currentVersion}`
          );
        } else {
          db.run(CREATE_TABLES_SQL);
        }
      }
    },
    catch: (error) =>
      new MigrationError({
        message: `Failed to initialize database: ${error instanceof Error ? error.message : String(error)}`,
        cause: error,
      }),
  });

export const makeDatabaseClient = (
  dbPath: string
): Effect.Effect<DatabaseClient, DatabaseError | MigrationError> =>
  Effect.gen(function* () {
    const db = yield* Effect.try({
      try: () => new Database(dbPath, { create: true }),
      catch: (error) =>
        new DatabaseError({
          message: `Failed to open database at ${dbPath}: ${error instanceof Error ? error.message : String(error)}`,
          cause: error,
        }),
    });

    yield* configureDatabaseConnection(db, dbPath);
    yield* initializeDatabase(db);
    const drizzleDb = drizzle({ client: db, schema });
    rebuildEntityIdPrefixes(drizzleDb);

    return {
      db,
      drizzle: drizzleDb,
      close: Effect.try({
        try: () => db.close(),
        catch: (error) =>
          new DatabaseError({
            message: `Failed to close database: ${error instanceof Error ? error.message : String(error)}`,
            cause: error,
          }),
      }),
    } satisfies DatabaseClient;
  });

export const DatabaseClientLive = (dbPath: string) =>
  Layer.effect(
    DatabaseClientTag,
    Effect.acquireRelease(makeDatabaseClient(dbPath), (client) => client.close.pipe(Effect.orDie))
  );
