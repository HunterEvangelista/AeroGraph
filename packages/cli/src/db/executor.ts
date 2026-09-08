import type { SQLiteBunDatabase } from "drizzle-orm/bun-sqlite";
import type { SQLiteBunTransaction } from "drizzle-orm/bun-sqlite/session";
import type { NodeSQLiteDatabase } from "drizzle-orm/node-sqlite";
import type { NodeSQLiteTransaction } from "drizzle-orm/node-sqlite/session";
import type { EmptyRelations } from "drizzle-orm/relations";

export type DatabaseTransaction =
  | SQLiteBunTransaction<EmptyRelations>
  | NodeSQLiteTransaction<EmptyRelations>;

export type DatabaseExecutor = SQLiteBunDatabase | NodeSQLiteDatabase | DatabaseTransaction;

export interface TransactionOptions {
  readonly behavior?: "deferred" | "immediate" | "exclusive";
}

type TransactionRunner = <A>(
  operation: (executor: DatabaseTransaction) => A,
  options?: TransactionOptions
) => A;

export const runDatabaseTransaction = <A>(
  executor: DatabaseExecutor,
  operation: (transaction: DatabaseTransaction) => A,
  options?: TransactionOptions
): A => {
  // SAFETY: Both Drizzle SQLite drivers expose the same synchronous transaction
  // contract; their public generic adds only a compile-time Promise rejection.
  const transaction = executor.transaction.bind(executor) as TransactionRunner;
  return transaction(operation, ...(options === undefined ? [] : [options]));
};
