/**
 * SQLite repository and application layer bundles
 */
import { CoreServicesLive } from "@kioku/core";
import { Layer } from "effect";
import { DatabaseClientLive } from "./client.js";
import { SqliteEntityRepositoryLive } from "./entity-repository.js";
import { SqliteLinkRepositoryLive } from "./link-repository.js";
import { SqliteTagRepositoryLive } from "./tag-repository.js";
import { SqliteVersionRepositoryLive } from "./version-repository.js";

export const SqliteRepositoriesLive = (dbPath: string) =>
  Layer.mergeAll(
    SqliteEntityRepositoryLive,
    SqliteTagRepositoryLive,
    SqliteLinkRepositoryLive,
    SqliteVersionRepositoryLive
  ).pipe(Layer.provide(DatabaseClientLive(dbPath)));

export const CliCoreLive = (dbPath: string) =>
  CoreServicesLive.pipe(Layer.provide(SqliteRepositoriesLive(dbPath)));

export const CliServicesLive = (dbPath: string) =>
  Layer.merge(CliCoreLive(dbPath), SqliteRepositoriesLive(dbPath));
