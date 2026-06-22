/**
 * SQLite Database Client
 * Manages database connection and initialization
 */
import { Database } from "bun:sqlite";
import { DatabaseError, MigrationError } from "@kioku/core";
import { type BunSQLiteDatabase, drizzle } from "drizzle-orm/bun-sqlite";
import { Context, Effect, Layer } from "effect";
import { rebuildEntityIdPrefixes } from "./entity-prefix-index.js";
import * as schema from "./schema.js";
import {
  CREATE_SCHEMA_META_SQL,
  CREATE_TABLES_SQL,
  GET_SCHEMA_VERSION_SQL,
  INSERT_SCHEMA_VERSION_SQL,
  SCHEMA_VERSION,
} from "./schema.js";

// ============================================================================
// Database Client Interface
// ============================================================================

export interface DatabaseClient {
  readonly db: Database;
  readonly drizzle: BunSQLiteDatabase<typeof schema>;
  readonly close: () => Effect.Effect<void, DatabaseError>;
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
    // v3 -> v4: term names became kind-scoped and normalized. This guards
    // local databases created while the v3 shape was still in flight.
    addColumnIfMissing(db, "term_names", "kind", "TEXT");
    db.run(
      "UPDATE term_names SET kind = COALESCE((SELECT kind FROM terms WHERE terms.id = term_names.term_id), 'other') WHERE kind IS NULL;"
    );
    db.run("DROP INDEX IF EXISTS idx_term_names_name;");
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
        db.run(CREATE_TABLES_SQL);
        db.run(INSERT_SCHEMA_VERSION_SQL, [String(SCHEMA_VERSION)]);
      } else {
        const currentVersion = Number.parseInt(versionResult.value, 10);
        if (currentVersion < SCHEMA_VERSION) {
          // Run column migrations before CREATE_TABLES_SQL so indexes can
          // reference newly added columns.
          runMigrations(db, currentVersion);
          db.run(CREATE_TABLES_SQL);
          db.run(INSERT_SCHEMA_VERSION_SQL, [String(SCHEMA_VERSION)]);
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
      close: () =>
        Effect.try({
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
    Effect.acquireRelease(makeDatabaseClient(dbPath), (client) => client.close().pipe(Effect.orDie))
  );
