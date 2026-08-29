import { Effect } from "effect";
import type { Term, TermId } from "../domain/term";
import {
  type RepositoryError,
  TermMigrationError,
  type TermNotFoundError,
  ValidationError,
} from "../errors";
import type { TermRepository } from "../repository/term-repository";

const invalid = (field: string, message: string) =>
  Effect.fail(new ValidationError({ field, message }));

const lifecycleError = (operation: string, message: string, cause?: unknown) => {
  if (cause) return Effect.fail(new TermMigrationError({ operation, message, cause }));
  return Effect.fail(new TermMigrationError({ operation, message }));
};

const getLifecycleTarget = (repo: TermRepository, id: TermId, operation: string, pointer: string) =>
  repo
    .getById(id)
    .pipe(
      Effect.catchTag("TermNotFoundError", (cause) =>
        lifecycleError(
          operation,
          `Lifecycle ${pointer} target '${id}' is missing; the term registry is corrupt.`,
          cause
        )
      )
    );

const validateCleanActive = (
  term: Term,
  operation: string,
  pointer: string
): Effect.Effect<void, TermMigrationError> => {
  if (term.status !== "active" || term.mergedIntoId || term.replacementTermId) {
    return lifecycleError(
      operation,
      `Lifecycle ${pointer} target '${term.canonicalName}' must be a clean active term.`
    );
  }
  return Effect.void;
};

/** Validate lifecycle pointers that are invalid on the term itself. */
export const validateTermLocalLifecycle = (
  term: Term,
  operation: string
): Effect.Effect<void, TermMigrationError> => {
  if (term.status === "active" && (term.mergedIntoId || term.replacementTermId)) {
    return lifecycleError(
      operation,
      `Active term '${term.canonicalName}' must not have lifecycle pointers.`
    );
  }
  if (term.status === "deprecated" && term.mergedIntoId) {
    return lifecycleError(
      operation,
      `Deprecated term '${term.canonicalName}' must not have a merge destination.`
    );
  }
  return Effect.void;
};

const validateMergedLifecycle = (
  repo: TermRepository,
  term: Term,
  operation: "deprecate" | "merge" | "rename"
) =>
  Effect.gen(function* () {
    const visited = new Set<TermId>();
    let current = term;

    while (current.status === "merged") {
      if (visited.has(current.id)) {
        return yield* lifecycleError(operation, "Term merge chain contains a cycle.");
      }
      visited.add(current.id);
      if (!current.mergedIntoId) {
        return yield* lifecycleError(
          operation,
          `Merged term '${current.canonicalName}' has no destination.`
        );
      }
      if (current.replacementTermId) {
        return yield* lifecycleError(
          operation,
          `Merged term '${current.canonicalName}' has a replacement as well as a merge destination.`
        );
      }

      const next = yield* getLifecycleTarget(repo, current.mergedIntoId, operation, "merge");
      if (next.kind !== term.kind) {
        return yield* lifecycleError(
          operation,
          `Merged lifecycle targets must have the same kind (${term.kind}).`
        );
      }
      current = next;
    }

    yield* validateCleanActive(current, operation, "merge");
  });

const validateReplacementTarget = (
  source: Term,
  replacement: Term,
  field: string,
  stored: boolean
): Effect.Effect<void, ValidationError | TermMigrationError> => {
  if (replacement.id === source.id) {
    return stored
      ? lifecycleError(
          "lifecycle",
          `Term '${source.canonicalName}' cannot point to itself as a replacement.`
        )
      : invalid(field, "A term cannot replace itself.");
  }
  if (replacement.kind !== source.kind) {
    return stored
      ? lifecycleError(
          "lifecycle",
          `Replacement target '${replacement.canonicalName}' has a different kind.`
        )
      : invalid(field, `Replacement must be the same kind (${source.kind}).`);
  }
  if (
    replacement.status !== "active" ||
    replacement.mergedIntoId ||
    replacement.replacementTermId
  ) {
    return stored
      ? lifecycleError(
          "lifecycle",
          `Replacement target '${replacement.canonicalName}' must be a clean active term.`
        )
      : invalid(field, "Replacement must be a clean active term.");
  }
  return Effect.void;
};

/** Validate a replacement pointer. Proposed pointers produce validation errors;
 * pointers already stored on a term are registry corruption. */
export const validateReplacementChain = (
  repo: TermRepository,
  source: Term,
  replacementId: TermId,
  field = "replacement",
  stored = false
): Effect.Effect<
  void,
  RepositoryError | ValidationError | TermMigrationError | TermNotFoundError
> =>
  Effect.gen(function* () {
    const replacement = stored
      ? yield* getLifecycleTarget(repo, replacementId, "lifecycle", "replacement")
      : yield* repo.getById(replacementId);
    yield* validateReplacementTarget(source, replacement, field, stored);
  });

/** Validate all lifecycle pointers reachable from an existing registry record. */
export const validateTermLifecycle = (
  repo: TermRepository,
  term: Term,
  operation: "deprecate" | "merge" | "rename"
): Effect.Effect<
  void,
  RepositoryError | ValidationError | TermMigrationError | TermNotFoundError
> =>
  Effect.gen(function* () {
    yield* validateTermLocalLifecycle(term, operation);

    if (term.status === "active") return;

    if (term.status === "deprecated") {
      if (term.replacementTermId) {
        yield* validateReplacementChain(repo, term, term.replacementTermId, "replacement", true);
      }
      return;
    }

    yield* validateMergedLifecycle(repo, term, operation);
  });

export const validateDeprecationSource = (term: Term) =>
  term.status === "merged"
    ? lifecycleError("deprecate", `Cannot deprecate merged term '${term.canonicalName}'.`)
    : Effect.void;

export const validateMergeTerms = (source: Term, destination: Term) => {
  if (source.id === destination.id) {
    return invalid("destination", "Merge source and destination must be distinct.");
  }
  if (source.kind !== destination.kind) {
    return invalid("destination", "Merge source and destination must have the same kind.");
  }
  if (source.status === "merged") {
    return lifecycleError(
      "merge",
      `Cannot merge source '${source.canonicalName}' because it is already merged.`
    );
  }
  if (destination.status !== "active") {
    return lifecycleError(
      "merge",
      `Merge destination '${destination.canonicalName}' must be active.`
    );
  }
  return Effect.void;
};
