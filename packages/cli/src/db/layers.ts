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
import { RootDatabaseSessionLive } from "./session.js";
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
  EntityPrefixIndexLive
);

const SqliteInfrastructureLive = (dbPath: string) => {
  const database = DatabaseClientLive(dbPath);
  return Layer.mergeAll(RootDatabaseSessionLive, TransactionEngineLive).pipe(
    Layer.provideMerge(database)
  );
};

const sqliteRepositoriesWith = (infrastructure: ReturnType<typeof SqliteInfrastructureLive>) =>
  SqliteRepositoryImplementationsLive.pipe(Layer.provideMerge(infrastructure));

export const SqliteRepositoriesLive = (dbPath: string) => {
  const infrastructure = SqliteInfrastructureLive(dbPath);
  return sqliteRepositoriesWith(infrastructure);
};

export const CliCoreLive = (dbPath: string) => {
  const infrastructure = SqliteInfrastructureLive(dbPath);
  const repositories = sqliteRepositoriesWith(infrastructure);
  return CoreServicesLive.pipe(Layer.provide(repositories));
};

export const CliServicesLive = (dbPath: string) => {
  const infrastructure = SqliteInfrastructureLive(dbPath);
  const repositories = sqliteRepositoriesWith(infrastructure);
  const core = CoreServicesLive.pipe(Layer.provide(repositories));
  return Layer.merge(core, repositories);
};
