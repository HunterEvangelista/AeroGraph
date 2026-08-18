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
  TermNotFoundError,
  ValidationError,
} from "../errors";

export interface TermResolution {
  readonly term: Term;
  readonly matchedName: TermName;
  readonly names: ReadonlyArray<TermName>;
  readonly resolutionNotes: ReadonlyArray<string>;
}

// ============================================================================
// Term Service Interface
// ============================================================================

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
    TermAlreadyExistsError | TermNotFoundError | ValidationError | RepositoryError
  >;

  readonly ensureName: (
    input: CreateTermNameInput
  ) => Effect.Effect<
    TermName,
    TermAlreadyExistsError | TermNotFoundError | ValidationError | RepositoryError
  >;

  readonly resolveName: (
    name: string,
    kind?: TermKind
  ) => Effect.Effect<TermResolution, AmbiguousTermNameError | TermNotFoundError | RepositoryError>;
}

// ============================================================================
// Term Service Tag
// ============================================================================

export class TermServiceTag extends Context.Service<TermServiceTag, TermService>()("TermService") {}
