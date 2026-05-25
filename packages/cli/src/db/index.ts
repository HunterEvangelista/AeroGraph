/**
 * Database module exports
 */

export { DatabaseClientLive, DatabaseClientTag, makeDatabaseClient } from "./client.js"
export type { DatabaseClient } from "./client.js"

export { CREATE_TABLES_SQL, SCHEMA_VERSION } from "./schema.js"

export { SqliteEntityRepositoryLive } from "./entity-repository.js"
export { SqliteLinkRepositoryLive } from "./link-repository.js"
export { SqliteTagRepositoryLive } from "./tag-repository.js"
export { SqliteVersionRepositoryLive } from "./version-repository.js"
export { CliCoreLive, SqliteRepositoriesLive } from "./layers.js"
