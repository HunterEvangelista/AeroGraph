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
import { SqliteVersionRepositoryLive } from "./version-repository.js";

export const SqliteRepositoriesLive = (dbPath: string) =>
  Layer.mergeAll(
    SqliteEntityRepositoryLive,
    SqliteTagRepositoryLive,
    SqliteLinkRepositoryLive,
    SqliteVersionRepositoryLive,
    SqliteNextRepositoryLive,
    SqliteTermRepositoryLive,
    SqliteMigrationJournalRepositoryLive,
    EntityPrefixIndexLive
  ).pipe(Layer.provide(DatabaseClientLive(dbPath)));

export const CliCoreLive = (dbPath: string) =>
  CoreServicesLive.pipe(Layer.provide(SqliteRepositoriesLive(dbPath)));

export const CliServicesLive = (dbPath: string) => {
  const repositories = SqliteRepositoriesLive(dbPath);
  const core = CoreServicesLive.pipe(Layer.provide(repositories));
  return Layer.merge(core, repositories);
};
