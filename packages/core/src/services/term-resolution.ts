import { Effect } from "effect";
import type { Term, TermId, TermName } from "../domain/term.js";
import { TermIdSchema } from "../domain/term.js";
import {
  AmbiguousTermNameError,
  type RepositoryError,
  TermMigrationError,
  TermNotFoundError,
} from "../errors.js";
import type { ResolvedTermName, TermRepository } from "../repository/term-repository.js";
import { validateTermLocalLifecycle } from "./term-lifecycle.js";
import type { TermResolution, TermSelector } from "./term-service.js";

const candidateLabel = ({ term, termName }: ResolvedTermName): string =>
  `${term.kind}:${term.canonicalName} (${termName.nameKind})`;

const resolutionNotes = (term: Term, matchedName: TermName): ReadonlyArray<string> => {
  const notes: string[] = [];
  if (matchedName.nameKind === "alias") {
    notes.push(`Resolved alias '${matchedName.displayName}' to '${term.canonicalName}'.`);
  }
  if (matchedName.nameKind === "deprecated") {
    notes.push(`Resolved deprecated name '${matchedName.displayName}' to '${term.canonicalName}'.`);
  }
  if (term.status === "deprecated") {
    notes.push(`Term '${term.canonicalName}' is deprecated.`);
  }
  return notes;
};

const canonicalName = (names: ReadonlyArray<TermName>): TermName | undefined =>
  names.find(({ nameKind }) => nameKind === "canonical") ?? names[0];

const corruption = (message: string, cause?: unknown) =>
  Effect.fail(
    new TermMigrationError({ operation: "resolve", message, ...(cause ? { cause } : {}) })
  );

interface ResolutionContext {
  readonly matchedBy: "id" | "name";
  readonly selector: string;
  readonly originalMatchedName: TermName;
  readonly selectedTermId: TermId;
  readonly redirectPath: ReadonlyArray<TermId>;
}

const resolveMatch = (
  repo: TermRepository,
  match: ResolvedTermName,
  context: ResolutionContext,
  seen: ReadonlySet<TermId> = new Set()
): Effect.Effect<
  TermResolution,
  TermNotFoundError | AmbiguousTermNameError | RepositoryError | TermMigrationError
> =>
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: resolution validates and preserves metadata for every redirect hop.
  Effect.gen(function* () {
    if (seen.has(match.term.id)) {
      return yield* corruption("Term merge chain contains a cycle.");
    }

    const nextSeen = new Set(seen).add(match.term.id);
    const names = yield* repo.listNames(match.term.id);
    const notes = [...resolutionNotes(match.term, match.termName)];
    yield* validateTermLocalLifecycle(match.term, "resolve");

    if (match.term.status === "merged") {
      if (!match.term.mergedIntoId) {
        return yield* corruption(`Merged term '${match.term.canonicalName}' has no destination.`);
      }
      if (match.term.replacementTermId) {
        return yield* corruption(
          `Merged term '${match.term.canonicalName}' has a replacement as well as a merge destination.`
        );
      }
      const mergedInto = yield* repo
        .getById(match.term.mergedIntoId)
        .pipe(
          Effect.catchTag("TermNotFoundError", (cause) =>
            corruption(
              `Merged term '${match.term.canonicalName}' points to missing destination '${match.term.mergedIntoId}'.`,
              cause
            )
          )
        );
      if (mergedInto.kind !== match.term.kind) {
        return yield* corruption(
          `Merged term '${match.term.canonicalName}' points to a different-kind destination.`
        );
      }
      const destinationName = canonicalName(yield* repo.listNames(mergedInto.id));
      if (!destinationName) {
        return yield* corruption(
          `Merged destination '${mergedInto.canonicalName}' has no canonical name.`
        );
      }
      notes.push(
        `Term '${match.term.canonicalName}' has been merged into '${mergedInto.canonicalName}'.`
      );
      const destinationResolution = yield* resolveMatch(
        repo,
        { term: mergedInto, termName: destinationName },
        {
          ...context,
          redirectPath: [...context.redirectPath, mergedInto.id],
        },
        nextSeen
      );
      if (
        destinationResolution.term.status !== "active" ||
        destinationResolution.term.mergedIntoId ||
        destinationResolution.term.replacementTermId
      ) {
        return yield* corruption(
          `Merge chain for '${match.term.canonicalName}' must terminate at a clean active term; terminal target '${destinationResolution.term.canonicalName}' is not active.`
        );
      }
      return {
        ...destinationResolution,
        // These fields describe the original selector match, not the final term.
        matchedName: context.originalMatchedName,
        resolutionNotes: [...notes, ...destinationResolution.resolutionNotes],
        resolutionMetadata: {
          ...destinationResolution.resolutionMetadata,
          matchedBy: context.matchedBy,
          selector: context.selector,
          matchedNameKind: context.originalMatchedName.nameKind,
          selectedTermId: context.selectedTermId,
          redirectPath: destinationResolution.resolutionMetadata.redirectPath,
          redirectedFromTermId: context.selectedTermId,
        },
      } satisfies TermResolution;
    }

    const replacementId = match.term.replacementTermId;
    if (replacementId) {
      const replacement = yield* repo
        .getById(replacementId)
        .pipe(
          Effect.catchTag("TermNotFoundError", (cause) =>
            corruption(
              `Deprecated term '${match.term.canonicalName}' points to missing replacement '${replacementId}'.`,
              cause
            )
          )
        );
      if (
        replacement.kind !== match.term.kind ||
        replacement.status !== "active" ||
        replacement.mergedIntoId ||
        replacement.replacementTermId
      ) {
        return yield* corruption(
          `Deprecated term '${match.term.canonicalName}' does not point to a clean active same-kind replacement.`
        );
      }
      notes.push(`Recommended replacement: '${replacement.canonicalName}'.`);
    }

    return {
      term: match.term,
      matchedName: context.originalMatchedName,
      names,
      resolutionNotes: notes,
      resolutionMetadata: {
        matchedBy: context.matchedBy,
        selector: context.selector,
        matchedNameKind: context.originalMatchedName.nameKind,
        selectedTermId: context.selectedTermId,
        redirectPath: context.redirectPath,
        ...(context.redirectPath.length > 1
          ? { redirectedFromTermId: context.selectedTermId }
          : {}),
        ...(replacementId ? { recommendedReplacementTermId: replacementId } : {}),
      },
    } satisfies TermResolution;
  });

export const resolveTermName = (
  repo: TermRepository,
  name: string,
  kind?: TermResolution["term"]["kind"],
  preferId = true
) =>
  Effect.gen(function* () {
    // String selectors retain stable-ID precedence. Explicit name selectors
    // never change meaning because a term happens to have the same text as ID.
    let byId: { readonly term: Term } | null = null;
    if (preferId) {
      byId = yield* repo.getById(TermIdSchema.make(name)).pipe(
        Effect.map((term) => ({ term })),
        Effect.catchTag("TermNotFoundError", () => Effect.succeed(null))
      );
    }
    if (byId) {
      const names = yield* repo.listNames(byId.term.id);
      const matchedName = canonicalName(names);
      if (!matchedName) {
        return yield* new TermNotFoundError({ name, message: "Term has no registered names." });
      }
      return yield* resolveMatch(
        repo,
        { term: byId.term, termName: matchedName },
        {
          matchedBy: "id",
          selector: name,
          originalMatchedName: matchedName,
          selectedTermId: byId.term.id,
          redirectPath: [byId.term.id],
        }
      );
    }

    const matches = yield* repo.findByName(name, kind);
    if (matches.length === 0) return yield* new TermNotFoundError({ name });
    if (!kind && matches.length > 1) {
      return yield* new AmbiguousTermNameError({
        name,
        candidates: matches.map(candidateLabel),
        candidateMetadata: matches.map(({ term, termName }) => ({
          id: term.id,
          kind: term.kind,
          canonicalName: term.canonicalName,
          matchedName: termName.displayName,
          nameKind: termName.nameKind,
        })),
        message: `Term name '${name}' is ambiguous; pass a kind to disambiguate.`,
      });
    }
    const match = matches[0];
    if (!match) return yield* new TermNotFoundError({ name });
    return yield* resolveMatch(repo, match, {
      matchedBy: "name",
      selector: name,
      originalMatchedName: match.termName,
      selectedTermId: match.term.id,
      redirectPath: [match.term.id],
    });
  });

/** Resolve a selector using only the supplied repository. */
export const resolveTermSelector = (repo: TermRepository, selector: TermSelector) => {
  if (typeof selector === "string") return resolveTermName(repo, selector);
  if (selector.id !== undefined) {
    return Effect.gen(function* () {
      const term = yield* repo.getById(selector.id);
      const matchedName = canonicalName(yield* repo.listNames(term.id));
      if (!matchedName) {
        return yield* new TermNotFoundError({
          name: term.id,
          message: "Term has no registered names.",
        });
      }
      return yield* resolveMatch(
        repo,
        { term, termName: matchedName },
        {
          matchedBy: "id",
          selector: selector.id,
          originalMatchedName: matchedName,
          selectedTermId: term.id,
          redirectPath: [term.id],
        }
      );
    });
  }
  return resolveTermName(repo, selector.name, selector.kind, false);
};

/** Return the registry record selected by a selector, before merge redirection. */
export const selectedTermForSelector = (repo: TermRepository, selector: TermSelector) =>
  Effect.gen(function* () {
    const resolution = yield* resolveTermSelector(repo, selector);
    return yield* repo.getById(resolution.resolutionMetadata.selectedTermId);
  });
