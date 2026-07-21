/**
 * Migration Service live implementation
 */
import { Effect, Layer } from "effect";
import type { Entity } from "../domain/entity.js";
import type { Tag } from "../domain/tag.js";
import {
  type CreateTermNameInput,
  type JournalEntryId,
  normalizeTermName,
  type Term,
  type TermId,
  type TermKind,
  type TermName,
} from "../domain/term.js";
import {
  AmbiguousTermNameError,
  type RepositoryError,
  TermAlreadyExistsError,
  TermMigrationError,
  ValidationError,
} from "../errors.js";
import { EntityRepositoryTag } from "../repository/entity-repository.js";
import { MigrationJournalRepositoryTag } from "../repository/migration-journal-repository.js";
import type { TagRepository } from "../repository/tag-repository.js";
import { TagRepositoryTag } from "../repository/tag-repository.js";
import type { ResolvedTermName, TermRepository } from "../repository/term-repository.js";
import { TermRepositoryTag } from "../repository/term-repository.js";
import type { TransactionRepositories } from "../repository/transaction-engine.js";
import { TransactionEngineTag } from "../repository/transaction-engine.js";
import {
  type MigrationService,
  MigrationServiceTag,
  type RenameMigrationPlan,
  type RenameTermInput,
} from "./migration-service.js";

interface NormalizedRenameInput extends RenameTermInput {
  readonly normalizedFromName: string;
  readonly normalizedToName: string;
}

const termIdFor = (kind: TermKind, normalizedName: string): TermId =>
  `term-${kind}-${normalizedName}` as TermId;

const journalEntryIdFor = (input: NormalizedRenameInput): JournalEntryId =>
  `journal-rename-${input.kind}-${input.normalizedFromName}-${input.normalizedToName}-${Date.now()}` as JournalEntryId;

const candidateLabel = ({ term, termName }: ResolvedTermName): string =>
  `${term.kind}:${term.canonicalName} (${termName.nameKind})`;

const validateRenameInput = (input: RenameTermInput) =>
  Effect.gen(function* () {
    const fromName = input.fromName.trim();
    const toName = input.toName.trim();

    if (!fromName) {
      return yield* new ValidationError({
        field: "fromName",
        message: "Migration source name must not be empty.",
      });
    }

    if (!toName) {
      return yield* new ValidationError({
        field: "toName",
        message: "Migration destination name must not be empty.",
      });
    }

    const normalizedFromName = normalizeTermName(fromName);
    const normalizedToName = normalizeTermName(toName);

    if (normalizedFromName === normalizedToName) {
      return yield* new ValidationError({
        field: "toName",
        message: "Migration source and destination names must be different.",
      });
    }

    return {
      ...input,
      fromName,
      toName,
      normalizedFromName,
      normalizedToName,
    } satisfies NormalizedRenameInput;
  });

const findSingleNameMatch = (repo: TermRepository, name: string, kind: TermKind) =>
  Effect.gen(function* () {
    const matches = yield* repo.findByName(name, kind);

    if (matches.length > 1) {
      return yield* new AmbiguousTermNameError({
        name,
        candidates: matches.map(candidateLabel),
        message: `Term name '${name}' is ambiguous for kind '${kind}'.`,
      });
    }

    return matches[0];
  });

const selectRenameTerm = (repo: TermRepository, input: NormalizedRenameInput) =>
  Effect.gen(function* () {
    const source = yield* findSingleNameMatch(repo, input.fromName, input.kind);
    const destination = yield* findSingleNameMatch(repo, input.toName, input.kind);

    if (source && destination && source.term.id !== destination.term.id) {
      return yield* new TermMigrationError({
        operation: "rename",
        message: `Cannot rename '${input.fromName}' to '${input.toName}' because both names already belong to different terms.`,
      });
    }

    return destination?.term ?? source?.term;
  });

const tagMatchesName = (tag: Tag, normalizedName: string): boolean => {
  const names = [tag.id, tag.name, ...(tag.aliases ?? [])];
  return names.some((name) => normalizeTermName(name) === normalizedName);
};

const collectAffectedEntities = (
  getByTag: (tagId: string) => Effect.Effect<ReadonlyArray<Entity>, RepositoryError>,
  tags: ReadonlyArray<Tag>
) =>
  Effect.gen(function* () {
    const entitiesById = new Map<string, Entity>();

    for (const tag of tags) {
      const entities = yield* getByTag(tag.id);
      for (const entity of entities) {
        entitiesById.set(entity.id, entity);
      }
    }

    return Array.from(entitiesById.values());
  });

const notesForPlan = (
  input: NormalizedRenameInput,
  term: Term | undefined,
  affectedTags: ReadonlyArray<Tag>
): ReadonlyArray<string> => {
  const notes: string[] = [];

  notes.push(
    term
      ? `Will use existing ${input.kind} term '${term.canonicalName}'.`
      : `Will create ${input.kind} term '${input.toName}'.`
  );

  if (affectedTags.length === 0) {
    notes.push(`No tags currently match '${input.fromName}'.`);
  }

  return notes;
};

const sameRegisteredName = (left: TermName, right: CreateTermNameInput): boolean =>
  left.displayName === right.displayName && left.nameKind === right.nameKind;

const ensureTermName = (repo: TermRepository, input: CreateTermNameInput) =>
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

const aliasesForRenamedTag = (tag: Tag, input: NormalizedRenameInput): ReadonlyArray<string> => {
  const aliases: string[] = [];
  const seen = new Set<string>();

  for (const alias of [tag.name, input.fromName, ...(tag.aliases ?? [])]) {
    const trimmed = alias.trim();
    const normalized = normalizeTermName(trimmed);
    if (!trimmed || normalized === input.normalizedToName || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    aliases.push(trimmed);
  }

  return aliases;
};

const ensureRenameTerm = (
  repo: TermRepository,
  input: NormalizedRenameInput,
  term: Term | undefined
) =>
  Effect.gen(function* () {
    if (term?.status === "merged") {
      return yield* new TermMigrationError({
        operation: "rename",
        message: `Cannot rename merged term '${term.canonicalName}'.`,
      });
    }

    if (!term) {
      return yield* repo.create({
        id: input.termId ?? termIdFor(input.kind, input.normalizedToName),
        canonicalName: input.toName,
        kind: input.kind,
      });
    }

    if (term.canonicalName === input.toName && term.status === "active") {
      return term;
    }

    return yield* repo.update(term.id, {
      canonicalName: input.toName,
      status: "active",
    });
  });

const ensureRenameNames = (repo: TermRepository, input: NormalizedRenameInput, term: Term) =>
  Effect.gen(function* () {
    yield* ensureTermName(repo, {
      termId: term.id,
      kind: input.kind,
      name: input.toName,
      displayName: input.toName,
      nameKind: "canonical",
    });

    yield* ensureTermName(repo, {
      termId: term.id,
      kind: input.kind,
      name: input.fromName,
      displayName: input.fromName,
      nameKind: "deprecated",
    });
  });

const updateAffectedTags = (
  repo: TagRepository,
  input: NormalizedRenameInput,
  term: Term,
  tags: ReadonlyArray<Tag>
) =>
  Effect.gen(function* () {
    const updatedTags: Tag[] = [];
    for (const tag of tags) {
      const updated = yield* repo.update(tag.id, {
        name: input.toName,
        aliases: aliasesForRenamedTag(tag, input),
        termId: term.id,
      });
      updatedTags.push(updated);
    }
    return updatedTags;
  });

interface RenameRepositories {
  readonly entities: TransactionRepositories["entities"];
  readonly migrationJournal: TransactionRepositories["migrationJournal"];
  readonly tags: TransactionRepositories["tags"];
  readonly terms: TransactionRepositories["terms"];
}

const planRenameWith = (repositories: RenameRepositories, input: RenameTermInput) =>
  Effect.gen(function* () {
    const normalized = yield* validateRenameInput(input);
    const term = yield* selectRenameTerm(repositories.terms, normalized);
    const tags = yield* repositories.tags.getAll();
    const affectedTags = tags.filter((tag) => tagMatchesName(tag, normalized.normalizedFromName));
    const affectedEntities = yield* collectAffectedEntities(
      repositories.entities.getByTag,
      affectedTags
    );
    const affectedEntityIds = affectedEntities.map(({ id }) => id);

    return {
      operation: "rename",
      kind: normalized.kind,
      fromName: normalized.fromName,
      toName: normalized.toName,
      normalizedFromName: normalized.normalizedFromName,
      normalizedToName: normalized.normalizedToName,
      term,
      willCreateTerm: !term,
      affectedTags,
      affectedEntities,
      affectedEntityIds,
      affectedCount: affectedEntityIds.length,
      notes: notesForPlan(normalized, term, affectedTags),
    } satisfies RenameMigrationPlan;
  });

export const MigrationServiceLive = Layer.effect(
  MigrationServiceTag,
  Effect.gen(function* () {
    const termRepo = yield* TermRepositoryTag;
    const tagRepo = yield* TagRepositoryTag;
    const entityRepo = yield* EntityRepositoryTag;
    const journalRepo = yield* MigrationJournalRepositoryTag;
    const transactionEngine = yield* TransactionEngineTag;

    const repositories: RenameRepositories = {
      entities: entityRepo,
      migrationJournal: journalRepo,
      tags: tagRepo,
      terms: termRepo,
    };

    const planRename = (input: RenameTermInput) => planRenameWith(repositories, input);

    const applyRename = (input: RenameTermInput) =>
      transactionEngine.run((transactionRepositories) =>
        Effect.gen(function* () {
          const normalized = yield* validateRenameInput(input);
          const transactionRenameRepositories: RenameRepositories = transactionRepositories;
          const plan = yield* planRenameWith(transactionRenameRepositories, normalized);
          const term = yield* ensureRenameTerm(
            transactionRepositories.terms,
            normalized,
            plan.term
          );
          yield* ensureRenameNames(transactionRepositories.terms, normalized, term);
          const updatedTags = yield* updateAffectedTags(
            transactionRepositories.tags,
            normalized,
            term,
            plan.affectedTags
          );

          const journalEntry = yield* transactionRepositories.migrationJournal.record({
            id: normalized.journalEntryId ?? journalEntryIdFor(normalized),
            operation: "rename",
            kind: normalized.kind,
            fromName: normalized.fromName,
            toName: normalized.toName,
            termId: term.id,
            affectedEntityIds: plan.affectedEntityIds,
            ...(normalized.reason ? { reason: normalized.reason } : {}),
            ...(normalized.appliedBy ? { appliedBy: normalized.appliedBy } : {}),
            dryRun: false,
          });

          return {
            ...plan,
            term,
            willCreateTerm: plan.willCreateTerm,
            updatedTags,
            journalEntry,
          };
        })
      );

    return {
      planRename,
      applyRename,
    } satisfies MigrationService;
  })
);
