import { Context, Effect, Layer } from "effect";
import { type DatabaseClient, DatabaseClientTag } from "./client";
import {
  type DatabaseExecutor,
  type DatabaseTransaction,
  runDatabaseTransaction,
} from "./executor";
import type { SqliteDatabase } from "./sqlite-driver";
import { withSqliteWriteRetry } from "./sqlite-retry";

export type { DatabaseExecutor } from "./executor";

export interface DatabaseSession {
  readonly db: SqliteDatabase;
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
  transaction: (operation) =>
    withSqliteWriteRetry(() => runDatabaseTransaction(client.drizzle, operation)),
});

export const runImmediateDatabaseTransaction = <A>(
  client: DatabaseClient,
  operation: (transaction: DatabaseTransaction) => A
): A => runDatabaseTransaction(client.drizzle, operation, { behavior: "immediate" });

export const RootDatabaseSessionLive = Layer.effect(
  DatabaseSessionTag,
  Effect.map(DatabaseClientTag, makeRootDatabaseSession)
);
