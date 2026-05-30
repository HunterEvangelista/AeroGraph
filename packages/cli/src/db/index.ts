/**
 * Database module exports
 */

export type { DatabaseClient } from "./client.js";
export { DatabaseClientLive, DatabaseClientTag, makeDatabaseClient } from "./client.js";
export { SqliteEntityRepositoryLive } from "./entity-repository.js";
export { CliCoreLive, CliServicesLive, SqliteRepositoriesLive } from "./layers.js";
export { SqliteLinkRepositoryLive } from "./link-repository.js";
export { CREATE_TABLES_SQL, SCHEMA_VERSION } from "./schema.js";
export { SqliteTagRepositoryLive } from "./tag-repository.js";
export { SqliteVersionRepositoryLive } from "./version-repository.js";
