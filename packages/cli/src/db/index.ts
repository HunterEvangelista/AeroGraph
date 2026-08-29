/**
 * Database module exports
 */

export type { DatabaseClient } from "./client";
export { DatabaseClientLive, DatabaseClientTag, makeDatabaseClient } from "./client";
export {
  DEFAULT_ENTITY_ID_PREFIX_SCOPE,
  EntityPrefixIndexLive,
  EntityPrefixIndexTag,
  formatEntityIdWithBoldPrefix,
  rebuildEntityIdPrefixes,
} from "./entity-prefix-index";
export { SqliteEntityRepositoryLive } from "./entity-repository";
export { CliCoreLive, CliServicesLive, SqliteRepositoriesLive } from "./layers";
export { SqliteLinkRepositoryLive } from "./link-repository";
export { SqliteMigrationJournalRepositoryLive } from "./migration-journal-repository";
export { SqliteNextRepositoryLive } from "./next-repository";
export { CREATE_TABLES_SQL, SCHEMA_VERSION } from "./schema";
export type { DatabaseExecutor, DatabaseSession } from "./session";
export {
  DatabaseSessionTag,
  makeRootDatabaseSession,
  makeTransactionDatabaseSession,
  RootDatabaseSessionLive,
} from "./session";
export { SqliteTagRepositoryLive } from "./tag-repository";
export { SqliteTermRepositoryLive } from "./term-repository";
export { TransactionEngineLive } from "./transaction-engine";
export { SqliteVersionRepositoryLive } from "./version-repository";
