/**
 * SQLite repository and application layer bundles
 */
import { CoreServicesLive } from "@kioku/core";
import { Layer } from "effect";
import { DatabaseClientLive } from "./client";
import { EntityPrefixIndexLive } from "./entity-prefix-index";
import { SqliteEntityRepositoryLive } from "./entity-repository";
import { SqliteLinkRepositoryLive } from "./link-repository";
import { SqliteMigrationJournalRepositoryLive } from "./migration-journal-repository";
import { SqliteNextRepositoryLive } from "./next-repository";
import { SqliteTagRepositoryLive } from "./tag-repository";
import { SqliteTermRepositoryLive } from "./term-repository";
import { TransactionEngineLive } from "./transaction-engine";
import { SqliteVersionRepositoryLive } from "./version-repository";

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
