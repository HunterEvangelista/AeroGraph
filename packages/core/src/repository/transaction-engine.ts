import { Context, type Effect } from "effect";
import type { RepositoryError } from "../errors.js";
import type { EntityRepository } from "./entity-repository.js";
import type { LinkRepository } from "./link-repository.js";
import type { MigrationJournalRepository } from "./migration-journal-repository.js";
import type { NextRepository } from "./next-repository.js";
import type { TagRepository } from "./tag-repository.js";
import type { TermRepository } from "./term-repository.js";
import type { VersionRepository } from "./version-repository.js";

export interface TransactionRepositories {
  readonly entities: EntityRepository;
  readonly links: LinkRepository;
  readonly migrationJournal: MigrationJournalRepository;
  readonly next: NextRepository;
  readonly tags: TagRepository;
  readonly terms: TermRepository;
  readonly versions: VersionRepository;
}

export interface TransactionEngine {
  /**
   * Run synchronous repository Effects in one database transaction. The
   * implementation commits on success and rolls back failures and defects.
   * The operation may be replayed when transaction acquisition encounters a
   * transient database lock. Nested engine calls are not supported.
   */
  readonly run: <A, E>(
    operation: (repositories: TransactionRepositories) => Effect.Effect<A, E>
  ) => Effect.Effect<A, E | RepositoryError>;
}

export class TransactionEngineTag extends Context.Service<
  TransactionEngineTag,
  TransactionEngine
>()("TransactionEngine") {}
