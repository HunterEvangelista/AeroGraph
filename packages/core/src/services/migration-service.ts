/**
 * Migration Service
 * Business logic for governed terminology migrations.
 */
import { Context, type Effect } from "effect";
import type { Entity } from "../domain/entity";
import type { Tag } from "../domain/tag";
import type { JournalEntryId, MigrationJournalEntry, Term, TermKind } from "../domain/term";
import type {
  AmbiguousTermNameError,
  RepositoryError,
  TagNotFoundError,
  TermAlreadyExistsError,
  TermMigrationError,
  TermNotFoundError,
  ValidationError,
} from "../errors";
import type { TermSelector } from "./term-service";

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

export interface DeprecateTermInput {
  readonly term: TermSelector;
  /** Advisory replacement; it does not redirect resolution or writes. */
  readonly replacement?: TermSelector;
  readonly reason?: string;
  readonly appliedBy?: string;
  readonly journalEntryId?: JournalEntryId;
}

export interface DeprecateMigrationPlan {
  readonly operation: "deprecate";
  readonly term: Term;
  readonly replacement?: Term;
  readonly affectedTags: ReadonlyArray<Tag>;
  readonly affectedEntities: ReadonlyArray<Entity>;
  readonly affectedEntityIds: ReadonlyArray<string>;
  readonly affectedCount: number;
  readonly notes: ReadonlyArray<string>;
}

export interface DeprecateMigrationResult {
  readonly plan: DeprecateMigrationPlan;
  /** Current source state after the write. */
  readonly term: Term;
  readonly journalEntry: MigrationJournalEntry;
}

export interface MergeTermInput {
  readonly source: TermSelector;
  readonly destination: TermSelector;
  readonly reason?: string;
  readonly appliedBy?: string;
  readonly journalEntryId?: JournalEntryId;
}

export interface MergeMigrationPlan {
  readonly operation: "merge";
  readonly source: Term;
  readonly destination: Term;
  readonly affectedTags: ReadonlyArray<Tag>;
  readonly affectedEntities: ReadonlyArray<Entity>;
  readonly affectedEntityIds: ReadonlyArray<string>;
  readonly affectedCount: number;
  readonly notes: ReadonlyArray<string>;
}

export interface MergeMigrationResult {
  readonly plan: MergeMigrationPlan;
  /** Current source state after the write. */
  readonly source: Term;
  /** Current destination state used by reassigned tags. */
  readonly destination: Term;
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
    RepositoryError | TermMigrationError | TermNotFoundError | ValidationError
  >;

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

  readonly planDeprecate: (
    input: DeprecateTermInput
  ) => Effect.Effect<
    DeprecateMigrationPlan,
    | AmbiguousTermNameError
    | RepositoryError
    | TermMigrationError
    | TermNotFoundError
    | ValidationError
  >;
  readonly applyDeprecate: (
    input: DeprecateTermInput
  ) => Effect.Effect<
    DeprecateMigrationResult,
    | AmbiguousTermNameError
    | RepositoryError
    | TermMigrationError
    | TermNotFoundError
    | ValidationError
  >;
  readonly planMerge: (
    input: MergeTermInput
  ) => Effect.Effect<
    MergeMigrationPlan,
    | AmbiguousTermNameError
    | RepositoryError
    | TermMigrationError
    | TermNotFoundError
    | ValidationError
  >;
  readonly applyMerge: (
    input: MergeTermInput
  ) => Effect.Effect<
    MergeMigrationResult,
    | AmbiguousTermNameError
    | RepositoryError
    | TagNotFoundError
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
