/**
 * Migration Journal Repository Interface
 * Storage-agnostic interface for term migration audit records.
 */
import { Context, type Effect } from "effect";
import type {
  JournalEntryId,
  MigrationJournalEntry,
  RecordJournalEntryInput,
  TermId,
} from "../domain/term.js";
import type {
  MigrationJournalEntryNotFoundError,
  RepositoryError,
  ValidationError,
} from "../errors.js";

// ============================================================================
// Migration Journal Repository Interface
// ============================================================================

export interface MigrationJournalRepository {
  /**
   * Record an audit entry for a migration operation.
   */
  readonly record: (
    input: RecordJournalEntryInput
  ) => Effect.Effect<MigrationJournalEntry, ValidationError | RepositoryError>;

  /**
   * Get a journal entry by ID.
   */
  readonly getById: (
    id: JournalEntryId
  ) => Effect.Effect<MigrationJournalEntry, MigrationJournalEntryNotFoundError | RepositoryError>;

  /**
   * List journal entries involving a term as either primary or related term,
   * newest first. This keeps merge/deprecate audit attribution complete
   * without duplicating journal rows.
   */
  readonly listByTerm: (
    termId: TermId
  ) => Effect.Effect<ReadonlyArray<MigrationJournalEntry>, RepositoryError>;

  /**
   * List recent journal entries, newest first.
   */
  readonly listRecent: (
    limit?: number
  ) => Effect.Effect<ReadonlyArray<MigrationJournalEntry>, RepositoryError>;
}

// ============================================================================
// Migration Journal Repository Tag (for Effect DI)
// ============================================================================

export class MigrationJournalRepositoryTag extends Context.Service<
  MigrationJournalRepositoryTag,
  MigrationJournalRepository
>()("MigrationJournalRepository") {}
