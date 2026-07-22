/**
 * SQLite repository and application layer bundles
 */
import { CoreServicesLive } from "@kioku/core";
import { Layer } from "effect";
import { DatabaseClientLive } from "./client.js";
import { EntityPrefixIndexLive } from "./entity-prefix-index.js";
import { SqliteEntityRepositoryLive } from "./entity-repository.js";
import { SqliteLinkRepositoryLive } from "./link-repository.js";
import { SqliteMigrationJournalRepositoryLive } from "./migration-journal-repository.js";
import { SqliteNextRepositoryLive } from "./next-repository.js";
import { SqliteTagRepositoryLive } from "./tag-repository.js";
import { SqliteTermRepositoryLive } from "./term-repository.js";
import { TransactionEngineLive } from "./transaction-engine.js";
import { SqliteVersionRepositoryLive } from "./version-repository.js";

const SqliteRepositoryImplementationsLive = Layer.mergeAll(
  SqliteEntityRepositoryLive,
  SqliteTagRepositoryLive,
  SqliteLinkRepositoryLive,
  SqliteVersionRepositoryLive,
  SqliteNextRepositoryLive,
  SqliteTermRepositoryLive,
  SqliteMigrationJournalRepositoryLive,
  EntityPrefixIndexLive,
  TransactionEngineLive
);

const sqliteRepositoriesWith = (database: ReturnType<typeof DatabaseClientLive>) =>
  SqliteRepositoryImplementationsLive.pipe(Layer.provide(database));

export const SqliteRepositoriesLive = (dbPath: string) => {
  const database = DatabaseClientLive(dbPath);
  return sqliteRepositoriesWith(database);
};

export const CliCoreLive = (dbPath: string) => {
  const database = DatabaseClientLive(dbPath);
  const repositories = sqliteRepositoriesWith(database);
  return CoreServicesLive.pipe(Layer.provide(repositories));
};

export const CliServicesLive = (dbPath: string) => {
  const database = DatabaseClientLive(dbPath);
  const repositories = sqliteRepositoriesWith(database);
  const core = CoreServicesLive.pipe(Layer.provide(repositories));
  return Layer.merge(core, repositories);
};
