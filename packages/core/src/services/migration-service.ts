/**
 * Migration Service
 * Business logic for governed terminology migrations.
 */
import { Context, type Effect } from "effect";
import type { Entity } from "../domain/entity.js";
import type { Tag } from "../domain/tag.js";
import type {
  JournalEntryId,
  MigrationJournalEntry,
  Term,
  TermId,
  TermKind,
} from "../domain/term.js";
import type {
  AmbiguousTermNameError,
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
  readonly termId?: TermId;
  readonly journalEntryId?: JournalEntryId;
}

export interface RenameMigrationPlan {
  readonly operation: "rename";
  readonly kind: TermKind;
  readonly fromName: string;
  readonly toName: string;
  readonly normalizedFromName: string;
  readonly normalizedToName: string;
  readonly term: Term | undefined;
  readonly willCreateTerm: boolean;
  readonly affectedTags: ReadonlyArray<Tag>;
  readonly affectedEntities: ReadonlyArray<Entity>;
  readonly affectedEntityIds: ReadonlyArray<string>;
  readonly affectedCount: number;
  readonly notes: ReadonlyArray<string>;
}

export interface RenameMigrationResult extends RenameMigrationPlan {
  readonly term: Term;
  readonly updatedTags: ReadonlyArray<Tag>;
  readonly journalEntry: MigrationJournalEntry;
}

// ============================================================================
// Migration Service Interface
// ============================================================================

export interface MigrationService {
  readonly planRename: (
    input: RenameTermInput
  ) => Effect.Effect<
    RenameMigrationPlan,
    AmbiguousTermNameError | RepositoryError | TermMigrationError | ValidationError
  >;

  readonly applyRename: (
    input: RenameTermInput
  ) => Effect.Effect<
    RenameMigrationResult,
    | AmbiguousTermNameError
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
