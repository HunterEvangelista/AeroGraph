/**
 * Database module exports
 */

export type { DatabaseClient } from "./client.js";
export { DatabaseClientLive, DatabaseClientTag, makeDatabaseClient } from "./client.js";
export {
  DEFAULT_ENTITY_ID_PREFIX_SCOPE,
  EntityPrefixIndexLive,
  EntityPrefixIndexTag,
  formatEntityIdWithBoldPrefix,
  rebuildEntityIdPrefixes,
} from "./entity-prefix-index.js";
export { SqliteEntityRepositoryLive } from "./entity-repository.js";
export { CliCoreLive, CliServicesLive, SqliteRepositoriesLive } from "./layers.js";
export { SqliteLinkRepositoryLive } from "./link-repository.js";
export { SqliteMigrationJournalRepositoryLive } from "./migration-journal-repository.js";
export { SqliteNextRepositoryLive } from "./next-repository.js";
export { CREATE_TABLES_SQL, SCHEMA_VERSION } from "./schema.js";
export { SqliteTagRepositoryLive } from "./tag-repository.js";
export { SqliteTermRepositoryLive } from "./term-repository.js";
export { SqliteVersionRepositoryLive } from "./version-repository.js";
