/**
 * SQLite Database Client
 * Manages database connection and initialization
 */
import { Database } from "bun:sqlite";
import { DatabaseError, MigrationError, normalizeTermName } from "@kioku/core";
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
  const columns = db.query(`PRAGMA table_info(${table})`).all() as { name: string }[];
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

const validateLegacyTerms = (db: Database): void => {
  const terms = db
    .query("SELECT id, canonical_name AS canonicalName FROM terms")
    .all() as LegacyTermRow[];
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
};

const normalizeLegacyTermName = (row: LegacyTermNameRow): string => {
  if (
    !row.termKind ||
    !TERM_KIND_VALUES.includes(row.termKind as (typeof TERM_KIND_VALUES)[number])
  ) {
    throw new Error(`Cannot migrate term name '${row.name}': invalid or missing term kind.`);
  }
  if (!TERM_NAME_KIND_VALUES.includes(row.nameKind as (typeof TERM_NAME_KIND_VALUES)[number])) {
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

const rebuildTermNamesV4 = (db: Database): void => {
  const rows = db
    .query(
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
    .all() as LegacyTermNameRow[];

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
};

const initializeDatabase = (db: Database): Effect.Effect<void, MigrationError> =>
  Effect.try({
    try: () => {
      // TODO: This is in a transitional state and requires drizzle running on start up
      // before we can migrate away.
      db.run(CREATE_SCHEMA_META_SQL);

      // Check/set schema version
      const versionResult = db.query(GET_SCHEMA_VERSION_SQL).get() as { value: string } | undefined;

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
