import type { Database } from "bun:sqlite";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import type { SQLiteBunTransaction } from "drizzle-orm/bun-sqlite/session";
import type { ExtractTablesWithRelations } from "drizzle-orm/relations";
import { Context, Effect, Layer } from "effect";
import { type DatabaseClient, DatabaseClientTag } from "./client";
import type * as schema from "./schema";
import { withSqliteWriteRetry } from "./sqlite-retry";

type DatabaseTransaction = SQLiteBunTransaction<
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

export type DatabaseExecutor = BunSQLiteDatabase<typeof schema> | DatabaseTransaction;

export interface DatabaseSession {
  readonly db: Database;
  readonly drizzle: DatabaseExecutor;
  readonly write: <A>(operation: () => A) => A;
  readonly transaction: <A>(operation: (executor: DatabaseExecutor) => A) => A;
}

export class DatabaseSessionTag extends Context.Service<DatabaseSessionTag, DatabaseSession>()(
  "DatabaseSession"
) {}

export const makeRootDatabaseSession = (client: DatabaseClient): DatabaseSession => ({
  db: client.db,
  drizzle: client.drizzle,
  write: (operation) => withSqliteWriteRetry(operation),
  transaction: (operation) => withSqliteWriteRetry(() => client.drizzle.transaction(operation)),
});

export const makeTransactionDatabaseSession = (
  client: DatabaseClient,
  executor: DatabaseTransaction
): DatabaseSession => ({
  db: client.db,
  drizzle: executor,
  write: (operation) => operation(),
  transaction: (operation) => executor.transaction(operation),
});

export const RootDatabaseSessionLive = Layer.effect(
  DatabaseSessionTag,
  Effect.map(DatabaseClientTag, makeRootDatabaseSession)
);
