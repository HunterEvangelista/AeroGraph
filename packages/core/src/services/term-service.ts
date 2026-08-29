/**
 * Term Service
 * Business logic for governed term creation and name resolution.
 */
import { Context, type Effect } from "effect";
import type {
  CreateTermInput,
  CreateTermNameInput,
  Term,
  TermId,
  TermKind,
  TermName,
} from "../domain/term";
import type {
  AmbiguousTermNameError,
  RepositoryError,
  TermAlreadyExistsError,
  TermMigrationError,
  TermNotFoundError,
  ValidationError,
} from "../errors";

export type TermSelectorObject =
  | {
      readonly id: TermId;
      readonly name?: never;
      readonly kind?: never;
    }
  | {
      readonly name: string;
      readonly kind?: TermKind;
      readonly id?: never;
    };

export type TermSelector = string | TermSelectorObject;

export interface TermResolutionMetadata {
  readonly matchedBy: "id" | "name";
  readonly selector: string;
  readonly matchedNameKind?: TermName["nameKind"];
  readonly redirectedFromTermId?: TermId;
  readonly recommendedReplacementTermId?: TermId;
  /** Registry record selected before any merge redirection. */
  readonly selectedTermId: TermId;
  /** Inclusive path from the selected record to the final resolved record. */
  readonly redirectPath: ReadonlyArray<TermId>;
}

export interface TermResolution {
  readonly term: Term;
  readonly matchedName: TermName;
  readonly names: ReadonlyArray<TermName>;
  readonly resolutionNotes: ReadonlyArray<string>;
  readonly resolutionMetadata: TermResolutionMetadata;
}

// ============================================================================
// Term Service Interface
// ============================================================================

export interface TermInspection {
  readonly term: Term;
  readonly canonicalName: string;
  readonly aliases: ReadonlyArray<TermName>;
  readonly deprecatedNames: ReadonlyArray<TermName>;
  readonly names: ReadonlyArray<TermName>;
  readonly mergedInto?: Term;
  readonly replacement?: Term;
  readonly resolutionNotes: ReadonlyArray<string>;
  readonly resolutionMetadata?: TermResolutionMetadata;
}

export interface TermService {
  readonly create: (
    input: CreateTermInput
  ) => Effect.Effect<Term, TermAlreadyExistsError | ValidationError | RepositoryError>;

  readonly getById: (id: TermId) => Effect.Effect<Term, TermNotFoundError | RepositoryError>;

  readonly list: (kind?: TermKind) => Effect.Effect<ReadonlyArray<Term>, RepositoryError>;

  readonly listNames: (
    termId: TermId
  ) => Effect.Effect<ReadonlyArray<TermName>, TermNotFoundError | RepositoryError>;

  readonly addName: (
    input: CreateTermNameInput
  ) => Effect.Effect<
    TermName,
    | TermAlreadyExistsError
    | TermMigrationError
    | TermNotFoundError
    | ValidationError
    | RepositoryError
  >;

  readonly ensureName: (
    input: CreateTermNameInput
  ) => Effect.Effect<
    TermName,
    | TermAlreadyExistsError
    | TermMigrationError
    | TermNotFoundError
    | ValidationError
    | RepositoryError
  >;

  readonly resolveName: (
    name: string,
    kind?: TermKind
  ) => Effect.Effect<
    TermResolution,
    AmbiguousTermNameError | TermMigrationError | TermNotFoundError | RepositoryError
  >;

  /** Resolve either a stable ID or a name. Stable IDs take precedence. */
  readonly resolve: (
    selector: TermSelector
  ) => Effect.Effect<
    TermResolution,
    AmbiguousTermNameError | TermMigrationError | TermNotFoundError | RepositoryError
  >;

  /** Rich, interface-neutral views used by list/show callers. */
  readonly listDetails: (
    kind?: TermKind
  ) => Effect.Effect<
    ReadonlyArray<TermInspection>,
    RepositoryError | TermMigrationError | TermNotFoundError
  >;
  readonly show: (
    selector: TermSelector
  ) => Effect.Effect<
    TermInspection,
    AmbiguousTermNameError | TermMigrationError | TermNotFoundError | RepositoryError
  >;
  readonly addAlias: (
    selector: TermSelector,
    alias: string,
    displayName?: string
  ) => Effect.Effect<
    TermName,
    | AmbiguousTermNameError
    | TermAlreadyExistsError
    | TermMigrationError
    | TermNotFoundError
    | ValidationError
    | RepositoryError
  >;
}

// ============================================================================
// Term Service Tag
// ============================================================================

export class TermServiceTag extends Context.Service<TermServiceTag, TermService>()("TermService") {}
