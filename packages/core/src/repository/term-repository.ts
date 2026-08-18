/**
 * Term Repository Interface
 * Storage-agnostic interface for governed terminology operations.
 */
import { Context, type Effect } from "effect";
import type {
  CreateTermInput,
  CreateTermNameInput,
  Term,
  TermId,
  TermKind,
  TermName,
  UpdateTermInput,
  UpdateTermNameInput,
} from "../domain/term";
import type {
  RepositoryError,
  TermAlreadyExistsError,
  TermNotFoundError,
  ValidationError,
} from "../errors";

export interface ResolvedTermName {
  readonly term: Term;
  readonly termName: TermName;
}

// ============================================================================
// Term Repository Interface
// ============================================================================

export interface TermRepository {
  /**
   * Create a governed term.
   */
  readonly create: (
    input: CreateTermInput
  ) => Effect.Effect<Term, TermAlreadyExistsError | ValidationError | RepositoryError>;

  /**
   * Get a term by stable ID.
   */
  readonly getById: (id: TermId) => Effect.Effect<Term, TermNotFoundError | RepositoryError>;

  /**
   * Get a term by exact canonical name within a kind.
   */
  readonly getByCanonicalName: (
    kind: TermKind,
    canonicalName: string
  ) => Effect.Effect<Term, TermNotFoundError | RepositoryError>;

  /**
   * Resolve a normalized name. If kind is omitted, all matching kinds are returned
   * so the service layer can decide whether to surface ambiguity.
   */
  readonly findByName: (
    name: string,
    kind?: TermKind
  ) => Effect.Effect<ReadonlyArray<ResolvedTermName>, RepositoryError>;

  /**
   * List governed terms, optionally filtered by kind.
   */
  readonly list: (kind?: TermKind) => Effect.Effect<ReadonlyArray<Term>, RepositoryError>;

  /**
   * Add an alias or deprecated name for a term.
   */
  readonly addName: (
    input: CreateTermNameInput
  ) => Effect.Effect<
    TermName,
    TermAlreadyExistsError | TermNotFoundError | ValidationError | RepositoryError
  >;

  /**
   * List all registered names for a term.
   */
  readonly listNames: (
    termId: TermId
  ) => Effect.Effect<ReadonlyArray<TermName>, TermNotFoundError | RepositoryError>;

  /**
   * Update a non-canonical registered term name's display text or kind.
   */
  readonly updateName: (
    termId: TermId,
    name: string,
    updates: UpdateTermNameInput
  ) => Effect.Effect<TermName, TermNotFoundError | ValidationError | RepositoryError>;

  /**
   * Update mutable non-canonical term fields.
   */
  readonly update: (
    id: TermId,
    updates: UpdateTermInput
  ) => Effect.Effect<Term, TermNotFoundError | ValidationError | RepositoryError>;

  /**
   * Atomically replace the canonical display name and registered canonical row.
   */
  readonly renameCanonical: (
    id: TermId,
    canonicalName: string
  ) => Effect.Effect<
    Term,
    TermAlreadyExistsError | TermNotFoundError | ValidationError | RepositoryError
  >;
}

// ============================================================================
// Term Repository Tag (for Effect DI)
// ============================================================================

export class TermRepositoryTag extends Context.Service<TermRepositoryTag, TermRepository>()(
  "TermRepository"
) {}
