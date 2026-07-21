/**
 * Term Service live implementation
 */
import { Effect, Layer } from "effect";
import type { CreateTermNameInput, Term, TermKind, TermName } from "../domain/term.js";
import { AmbiguousTermNameError, TermAlreadyExistsError, TermNotFoundError } from "../errors.js";
import type { ResolvedTermName } from "../repository/term-repository.js";
import { TermRepositoryTag } from "../repository/term-repository.js";
import { type TermResolution, type TermService, TermServiceTag } from "./term-service.js";

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

const sameRegisteredName = (left: TermName, right: CreateTermNameInput): boolean =>
  left.displayName === right.displayName && left.nameKind === right.nameKind;

export const TermServiceLive = Layer.effect(
  TermServiceTag,
  Effect.gen(function* () {
    const repo = yield* TermRepositoryTag;

    const resolveName = (name: string, kind?: TermKind) =>
      Effect.gen(function* () {
        const matches = yield* repo.findByName(name, kind);

        if (matches.length === 0) {
          return yield* new TermNotFoundError({ name });
        }

        if (!kind && matches.length > 1) {
          return yield* new AmbiguousTermNameError({
            name,
            candidates: matches.map(candidateLabel),
            message: `Term name '${name}' is ambiguous; pass a kind to disambiguate.`,
          });
        }

        const match = matches[0];
        if (!match) {
          return yield* new TermNotFoundError({ name });
        }

        if (match.term.status === "merged" && match.term.mergedIntoId) {
          const mergedInto = yield* repo.getById(match.term.mergedIntoId);
          const names = yield* repo.listNames(mergedInto.id);
          const notes = [
            ...resolutionNotes(match.term, match.termName),
            `Term '${match.term.canonicalName}' has been merged into '${mergedInto.canonicalName}'.`,
          ];

          return {
            term: mergedInto,
            matchedName: match.termName,
            names,
            resolutionNotes: notes,
          } satisfies TermResolution;
        }

        const names = yield* repo.listNames(match.term.id);

        return {
          term: match.term,
          matchedName: match.termName,
          names,
          resolutionNotes: resolutionNotes(match.term, match.termName),
        } satisfies TermResolution;
      });

    const ensureName = (input: CreateTermNameInput) =>
      Effect.gen(function* () {
        const matches = yield* repo.findByName(input.name, input.kind);
        const conflict = matches.find(({ term }) => term.id !== input.termId);
        if (conflict) {
          return yield* new TermAlreadyExistsError({
            name: input.name,
            message: `Term name '${input.name}' already belongs to '${conflict.term.canonicalName}'.`,
          });
        }

        const existing = matches.find(({ term }) => term.id === input.termId)?.termName;
        if (existing) {
          if (sameRegisteredName(existing, input)) {
            return existing;
          }

          return yield* repo.updateName(input.termId, input.name, {
            displayName: input.displayName,
            nameKind: input.nameKind,
          });
        }

        return yield* repo.addName(input);
      });

    return {
      create: (input) => repo.create(input),
      getById: (id) => repo.getById(id),
      list: (kind) => repo.list(kind),
      listNames: (termId) => repo.listNames(termId),
      addName: (input) => repo.addName(input),
      ensureName,
      resolveName,
    } satisfies TermService;
  })
);
