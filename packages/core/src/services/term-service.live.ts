/** Term service live implementation. */
import { Effect, Layer } from "effect";
import type { CreateTermNameInput, Term, TermId, TermKind, TermName } from "../domain/term";
import { TermAlreadyExistsError, TermMigrationError } from "../errors";
import { TermRepositoryTag } from "../repository/term-repository";
import { validateTermLifecycle } from "./term-lifecycle";
import { resolveTermName, resolveTermSelector } from "./term-resolution";
import {
  type TermInspection,
  type TermResolution,
  type TermSelector,
  type TermService,
  TermServiceTag,
} from "./term-service";

const sameRegisteredName = (left: TermName, right: CreateTermNameInput): boolean =>
  left.displayName === right.displayName && left.nameKind === right.nameKind;

const inspectionFor = (
  term: Term,
  names: ReadonlyArray<TermName>,
  resolution?: TermResolution,
  relatedTerms: ReadonlyMap<TermId, Term> = new Map()
): TermInspection => {
  const mergedInto = term.mergedIntoId ? relatedTerms.get(term.mergedIntoId) : undefined;
  const replacement = term.replacementTermId ? relatedTerms.get(term.replacementTermId) : undefined;
  return {
    term,
    canonicalName: term.canonicalName,
    aliases: names.filter(({ nameKind }) => nameKind === "alias"),
    deprecatedNames: names.filter(({ nameKind }) => nameKind === "deprecated"),
    names,
    ...(mergedInto ? { mergedInto } : {}),
    ...(replacement ? { replacement } : {}),
    resolutionNotes: resolution?.resolutionNotes ?? [],
    ...(resolution?.resolutionMetadata
      ? { resolutionMetadata: resolution.resolutionMetadata }
      : {}),
  };
};

export const TermServiceLive = Layer.effect(
  TermServiceTag,
  Effect.gen(function* () {
    const repo = yield* TermRepositoryTag;

    const resolveName = (name: string, kind?: TermKind) => resolveTermName(repo, name, kind);
    const resolve = (selector: TermSelector) => resolveTermSelector(repo, selector);

    const ensureName = (input: CreateTermNameInput) =>
      Effect.gen(function* () {
        const owner = yield* repo.getById(input.termId);
        yield* validateTermLifecycle(repo, owner, "rename");
        if (owner.status === "merged") {
          return yield* new TermMigrationError({
            operation: "merge",
            message:
              "Cannot add a name to a merged term; add it to the active destination instead.",
          });
        }
        const matches = yield* repo.findByName(input.name, input.kind);
        const conflict = matches.find(({ term }) => term.id !== input.termId);
        if (conflict) {
          return yield* new TermAlreadyExistsError({
            name: input.name,
            message: `Term name '${input.name}' already belongs to '${conflict.term.canonicalName}' in kind '${conflict.term.kind}'.`,
          });
        }
        const existing = matches.find(({ term }) => term.id === input.termId)?.termName;
        if (existing) {
          if (sameRegisteredName(existing, input)) return existing;
          return yield* repo.updateName(input.termId, input.name, {
            displayName: input.displayName,
            nameKind: input.nameKind,
          });
        }
        return yield* repo.addName(input);
      });

    const listDetails = (kind?: TermKind) =>
      Effect.gen(function* () {
        const terms = yield* repo.list(kind);
        for (const term of terms) {
          yield* validateTermLifecycle(repo, term, "rename").pipe(
            Effect.catchTags({
              ValidationError: (cause) =>
                Effect.fail(
                  new TermMigrationError({
                    operation: "inspect",
                    message: cause.message,
                    cause,
                  })
                ),
              TermNotFoundError: (cause) =>
                Effect.fail(
                  new TermMigrationError({
                    operation: "inspect",
                    message: `Term '${term.canonicalName}' has a missing lifecycle target.`,
                    cause,
                  })
                ),
            })
          );
        }
        const relatedIds = terms.flatMap(({ mergedIntoId, replacementTermId }) =>
          [mergedIntoId, replacementTermId].filter((id): id is TermId => id !== undefined)
        );
        const allIds = [...new Set([...terms.map(({ id }) => id), ...relatedIds])];
        const [names, relatedTerms] = yield* Effect.all([
          repo.listNamesByTermIds(allIds),
          repo.getByIds(allIds),
        ]);
        const namesByTerm = new Map<TermId, TermName[]>();
        for (const name of names) {
          const current = namesByTerm.get(name.termId) ?? [];
          current.push(name);
          namesByTerm.set(name.termId, current);
        }
        const termsById = new Map(relatedTerms.map((term) => [term.id, term]));
        for (const id of relatedIds) {
          if (!termsById.has(id)) {
            return yield* new TermMigrationError({
              operation: "inspect",
              message: `Term lifecycle target '${id}' is missing; the term registry is corrupt.`,
            });
          }
        }
        return terms.map((term) =>
          inspectionFor(term, namesByTerm.get(term.id) ?? [], undefined, termsById)
        );
      });

    const show = (selector: TermSelector) =>
      Effect.gen(function* () {
        const resolution = yield* resolve(selector);
        const selectedId = resolution.resolutionMetadata.selectedTermId;
        const selectedTerm = yield* repo.getById(selectedId);
        const names =
          selectedId === resolution.term.id ? resolution.names : yield* repo.listNames(selectedId);
        const relatedIds = [selectedTerm.mergedIntoId, selectedTerm.replacementTermId].filter(
          (id): id is TermId => id !== undefined
        );
        const related = yield* repo.getByIds(relatedIds);
        const relatedById = new Map(related.map((term) => [term.id, term]));
        for (const id of relatedIds) {
          if (!relatedById.has(id)) {
            return yield* new TermMigrationError({
              operation: "inspect",
              message: `Term lifecycle target '${id}' is missing; the term registry is corrupt.`,
            });
          }
        }
        return inspectionFor(selectedTerm, names, resolution, relatedById);
      });

    const addAlias = (selector: TermSelector, alias: string, displayName = alias) =>
      Effect.gen(function* () {
        const resolution = yield* resolve(selector);
        if (
          resolution.resolutionMetadata.selectedTermId !== resolution.term.id ||
          resolution.term.status === "merged"
        ) {
          return yield* new TermMigrationError({
            operation: "merge",
            message:
              "Cannot add an alias to a merged term; add it to the active destination instead.",
          });
        }
        return yield* ensureName({
          termId: resolution.term.id,
          kind: resolution.term.kind,
          name: alias,
          displayName,
          nameKind: "alias",
        });
      });

    return {
      create: (input) => repo.create(input),
      getById: (id) => repo.getById(id),
      list: (kind) => repo.list(kind),
      listNames: (termId) => repo.listNames(termId),
      addName: ensureName,
      ensureName,
      resolveName,
      resolve,
      listDetails,
      show,
      addAlias,
    } satisfies TermService;
  })
);
