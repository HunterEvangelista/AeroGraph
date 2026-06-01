/**
 * SQLite Database Client
 * Manages database connection and initialization
 */
import { Database } from "bun:sqlite";
import { DatabaseError, MigrationError } from "@kioku/core";
import { Context, Effect, Layer } from "effect";
import {
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

const initializeDatabase = (db: Database): Effect.Effect<void, MigrationError> =>
  Effect.try({
    try: () => {
      // Enable foreign keys
      db.run("PRAGMA foreign_keys = ON;");

      // Create tables
      db.run(CREATE_TABLES_SQL);

      // Check/set schema version
      const versionResult = db.query(GET_SCHEMA_VERSION_SQL).get() as { value: string } | undefined;

      if (!versionResult) {
        // First time setup
        db.run(INSERT_SCHEMA_VERSION_SQL, [String(SCHEMA_VERSION)]);
      } else {
        const currentVersion = Number.parseInt(versionResult.value, 10);
        if (currentVersion !== SCHEMA_VERSION) {
          // Future: run migrations here
          throw new Error(
            `Schema version mismatch: expected ${SCHEMA_VERSION}, got ${currentVersion}`
          );
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

    yield* initializeDatabase(db);

    return {
      db,
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
