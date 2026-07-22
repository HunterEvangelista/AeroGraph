/**
 * Migration Service live implementation
 */
import { Effect, Layer } from "effect";
import type { Entity } from "../domain/entity.js";
import type { Tag } from "../domain/tag.js";
import { type JournalEntryId, normalizeTermName, type Term } from "../domain/term.js";
import { type RepositoryError, TermMigrationError, ValidationError } from "../errors.js";
import { EntityRepositoryTag } from "../repository/entity-repository.js";
import { MigrationJournalRepositoryTag } from "../repository/migration-journal-repository.js";
import type { TagRepository } from "../repository/tag-repository.js";
import { TagRepositoryTag } from "../repository/tag-repository.js";
import type { TermRepository } from "../repository/term-repository.js";
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

const journalEntryIdFor = (input: NormalizedRenameInput): JournalEntryId =>
  `journal-rename-${input.kind}-${input.normalizedFromName}-${input.normalizedToName}-${Date.now()}` as JournalEntryId;

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

    if (fromName.includes(",") || toName.includes(",")) {
      return yield* new ValidationError({
        field: fromName.includes(",") ? "fromName" : "toName",
        message: "Term names cannot contain commas because commas separate CLI selectors.",
      });
    }

    const normalizedFromName = normalizeTermName(fromName);
    const normalizedToName = normalizeTermName(toName);

    if (fromName === toName) {
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
  term: Term,
  affectedTags: ReadonlyArray<Tag>
): ReadonlyArray<string> => {
  const notes = [`Will rename existing ${input.kind} term '${term.canonicalName}'.`];

  if (affectedTags.length === 0) {
    notes.push(`No tags are currently governed by '${input.fromName}'.`);
  }

  return notes;
};

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

const validateRenameTerm = (term: Term) =>
  term.status === "merged"
    ? Effect.fail(
        new TermMigrationError({
          operation: "rename",
          message: `Cannot rename merged term '${term.canonicalName}'.`,
        })
      )
    : Effect.void;

const ensureRenameTerm = (repo: TermRepository, input: NormalizedRenameInput, term: Term) =>
  Effect.gen(function* () {
    yield* validateRenameTerm(term);

    if (term.canonicalName === input.toName) {
      return term;
    }

    return yield* repo.renameCanonical(term.id, input.toName);
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

const validateDestinationTags = (
  tags: ReadonlyArray<Tag>,
  sourceTerm: Term,
  input: NormalizedRenameInput
) => {
  const conflictingTags = tags.filter(
    (tag) => tagMatchesName(tag, input.normalizedToName) && tag.termId !== sourceTerm.id
  );
  if (conflictingTags.length === 0) return Effect.void;

  return Effect.fail(
    new ValidationError({
      field: "toName",
      message: `Destination tags must be governed by the source term or merged before migration: ${conflictingTags.map(({ id }) => `#${id}`).join(", ")}.`,
    })
  );
};

const planRenameWith = (repositories: RenameRepositories, input: RenameTermInput) =>
  Effect.gen(function* () {
    const normalized = yield* validateRenameInput(input);
    const source = (yield* repositories.terms.findByName(normalized.fromName, normalized.kind))[0];
    if (!source) {
      return yield* new ValidationError({
        field: "fromName",
        message: `No governed ${normalized.kind} term matches '${normalized.fromName}'. Govern existing tags before migrating them.`,
      });
    }

    yield* validateRenameTerm(source.term);

    const destinationConflict = (yield* repositories.terms.findByName(normalized.toName)).find(
      ({ term }) => term.id !== source.term.id
    );
    if (destinationConflict) {
      return yield* new ValidationError({
        field: "toName",
        message: `Cannot rename '${normalized.fromName}' to '${normalized.toName}' because the destination belongs to a different ${destinationConflict.term.kind} term. Merge the terms instead.`,
      });
    }

    if (source.term.canonicalName === normalized.toName) {
      return yield* new ValidationError({
        field: "toName",
        message: `'${normalized.toName}' is already the canonical name for this term.`,
      });
    }

    if (normalizeTermName(source.term.canonicalName) !== normalized.normalizedFromName) {
      return yield* new ValidationError({
        field: "fromName",
        message: `'${normalized.fromName}' is not the canonical name for this term. Rename from '${source.term.canonicalName}' instead.`,
      });
    }

    const tags = yield* repositories.tags.getAll();
    yield* validateDestinationTags(tags, source.term, normalized);

    const matchingTags = tags.filter((tag) => tagMatchesName(tag, normalized.normalizedFromName));
    const ungovernedTags = matchingTags.filter((tag) => !tag.termId);
    if (ungovernedTags.length > 0) {
      return yield* new ValidationError({
        field: "fromName",
        message: `Matching tags must be governed before migration: ${ungovernedTags.map(({ id }) => `#${id}`).join(", ")}.`,
      });
    }

    const conflictingTags = matchingTags.filter((tag) => tag.termId !== source.term.id);
    if (conflictingTags.length > 0) {
      return yield* new ValidationError({
        field: "fromName",
        message: `Matching tags belong to a different governed term: ${conflictingTags.map(({ id }) => `#${id}`).join(", ")}.`,
      });
    }

    const term = source.term;
    const affectedTags = tags.filter((tag) => tag.termId === term.id);

    const affectedEntities = yield* collectAffectedEntities(
      repositories.entities.getByTag,
      affectedTags
    );
    const affectedEntityIds = affectedEntities.map(({ id }) => id);

    return {
      operation: "rename",
      kind: normalized.kind,
      fromName: source.term.canonicalName,
      toName: normalized.toName,
      normalizedFromName: normalized.normalizedFromName,
      normalizedToName: normalized.normalizedToName,
      term,
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
          const appliedInput = { ...normalized, fromName: plan.fromName };
          const term = yield* ensureRenameTerm(
            transactionRepositories.terms,
            appliedInput,
            plan.term
          );
          const updatedTags = yield* updateAffectedTags(
            transactionRepositories.tags,
            appliedInput,
            term,
            plan.affectedTags
          );

          const journalEntry = yield* transactionRepositories.migrationJournal.record({
            id: normalized.journalEntryId ?? journalEntryIdFor(normalized),
            operation: "rename",
            kind: normalized.kind,
            fromName: plan.fromName,
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
