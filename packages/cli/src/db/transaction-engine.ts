import {
  EntityRepositoryTag,
  LinkRepositoryTag,
  MigrationJournalRepositoryTag,
  NextRepositoryTag,
  RepositoryError,
  TagRepositoryTag,
  TermRepositoryTag,
  type TransactionEngine,
  TransactionEngineTag,
  type TransactionRepositories,
  VersionRepositoryTag,
} from "@kioku/core";
import { type Cause, Effect, Exit, Layer } from "effect";
import { type DatabaseClient, DatabaseClientTag } from "./client";
import { SqliteEntityRepositorySessionLive } from "./entity-repository";
import { SqliteLinkRepositorySessionLive } from "./link-repository";
import { SqliteMigrationJournalRepositorySessionLive } from "./migration-journal-repository";
import { SqliteNextRepositorySessionLive } from "./next-repository";
import {
  type DatabaseSession,
  DatabaseSessionTag,
  makeTransactionDatabaseSession,
} from "./session";
import { withSqliteWriteRetry } from "./sqlite-retry";
import { SqliteTagRepositorySessionLive } from "./tag-repository";
import { SqliteTermRepositorySessionLive } from "./term-repository";
import { SqliteVersionRepositorySessionLive } from "./version-repository";

const transactionRepositoriesLive = (session: DatabaseSession) =>
  Layer.mergeAll(
    SqliteEntityRepositorySessionLive,
    SqliteLinkRepositorySessionLive,
    SqliteMigrationJournalRepositorySessionLive,
    SqliteNextRepositorySessionLive,
    SqliteTagRepositorySessionLive,
    SqliteTermRepositorySessionLive,
    SqliteVersionRepositorySessionLive
  ).pipe(Layer.provide(Layer.succeed(DatabaseSessionTag, session)));

const repositoryError = (action: string, error: unknown) =>
  new RepositoryError({
    message: `Failed to ${action} database transaction: ${error instanceof Error ? error.message : String(error)}`,
    cause: error,
  });

const runWithRepositories = <A, E>(
  session: DatabaseSession,
  operation: (repositories: TransactionRepositories) => Effect.Effect<A, E>
) =>
  Effect.gen(function* () {
    const repositories: TransactionRepositories = {
      entities: yield* EntityRepositoryTag,
      links: yield* LinkRepositoryTag,
      migrationJournal: yield* MigrationJournalRepositoryTag,
      next: yield* NextRepositoryTag,
      tags: yield* TagRepositoryTag,
      terms: yield* TermRepositoryTag,
      versions: yield* VersionRepositoryTag,
    };

    return yield* operation(repositories);
  }).pipe(Effect.provide(transactionRepositoriesLive(session)));

const runTransaction = <A, E>(
  client: DatabaseClient,
  state: { active: boolean },
  operation: (repositories: TransactionRepositories) => Effect.Effect<A, E>
): Effect.Effect<A, E | RepositoryError> =>
  Effect.suspend<A, E | RepositoryError, never>(() => {
    if (state.active) {
      return Effect.fail(
        repositoryError(
          "start nested",
          new Error("Nested transaction engine calls are not supported")
        )
      );
    }

    const rollbackSignal = {};
    let operationCause: Cause.Cause<E> | undefined;
    state.active = true;

    try {
      const value = withSqliteWriteRetry(() =>
        client.drizzle.transaction(
          (tx) => {
            const operationExit = Effect.runSyncExit(
              runWithRepositories(makeTransactionDatabaseSession(client, tx), operation)
            );

            if (Exit.isFailure(operationExit)) {
              operationCause = operationExit.cause;
              throw rollbackSignal;
            }

            return operationExit.value;
          },
          { behavior: "immediate" }
        )
      );

      return Effect.succeed(value);
    } catch (error) {
      if (error === rollbackSignal && operationCause) {
        return Effect.failCause(operationCause);
      }

      return Effect.fail(repositoryError("run", error));
    } finally {
      state.active = false;
    }
  });

export const TransactionEngineLive = Layer.effect(
  TransactionEngineTag,
  Effect.gen(function* () {
    const client = yield* DatabaseClientTag;
    const state = { active: false };
    const run: TransactionEngine["run"] = (operation) => runTransaction(client, state, operation);

    return { run } satisfies TransactionEngine;
  })
);
