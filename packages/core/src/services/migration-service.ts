/**
 * Migration Service
 * Business logic for governed terminology migrations.
 */
import { Context, type Effect } from "effect";
import type { Entity } from "../domain/entity.js";
import type { Tag } from "../domain/tag.js";
import type { JournalEntryId, MigrationJournalEntry, Term, TermKind } from "../domain/term.js";
import type {
  RepositoryError,
  TagNotFoundError,
  TermAlreadyExistsError,
  TermMigrationError,
  TermNotFoundError,
  ValidationError,
} from "../errors.js";

export interface RenameTermInput {
  readonly kind: TermKind;
  readonly fromName: string;
  readonly toName: string;
  readonly reason?: string;
  readonly appliedBy?: string;
  readonly journalEntryId?: JournalEntryId;
}

export interface RenameMigrationPlan {
  readonly operation: "rename";
  readonly kind: TermKind;
  readonly fromName: string;
  readonly toName: string;
  readonly normalizedFromName: string;
  readonly normalizedToName: string;
  readonly term: Term;
  readonly affectedTags: ReadonlyArray<Tag>;
  readonly affectedEntities: ReadonlyArray<Entity>;
  readonly affectedEntityIds: ReadonlyArray<string>;
  readonly affectedCount: number;
  readonly notes: ReadonlyArray<string>;
}

export interface RenameMigrationResult extends RenameMigrationPlan {
  readonly updatedTags: ReadonlyArray<Tag>;
  readonly journalEntry: MigrationJournalEntry;
}

// ============================================================================
// Migration Service Interface
// ============================================================================

export interface MigrationService {
  readonly planRename: (
    input: RenameTermInput
  ) => Effect.Effect<RenameMigrationPlan, RepositoryError | TermMigrationError | ValidationError>;

  readonly applyRename: (
    input: RenameTermInput
  ) => Effect.Effect<
    RenameMigrationResult,
    | RepositoryError
    | TagNotFoundError
    | TermAlreadyExistsError
    | TermMigrationError
    | TermNotFoundError
    | ValidationError
  >;
}

// ============================================================================
// Migration Service Tag
// ============================================================================

export class MigrationServiceTag extends Context.Service<MigrationServiceTag, MigrationService>()(
  "MigrationService"
) {}
