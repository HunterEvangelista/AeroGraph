/**
 * Migration Service live implementation
 */
import { Effect, Layer } from "effect";
import type { Entity } from "../domain/entity";
import type { Tag } from "../domain/tag";
import {
  type JournalEntryId,
  JournalEntryIdSchema,
  normalizeTermName,
  type RecordJournalEntryInput,
  type Term,
} from "../domain/term";
import { type RepositoryError, TermMigrationError, ValidationError } from "../errors";
import { EntityRepositoryTag } from "../repository/entity-repository";
import { MigrationJournalRepositoryTag } from "../repository/migration-journal-repository";
import type { TagRepository } from "../repository/tag-repository";
import { TagRepositoryTag } from "../repository/tag-repository";
import type { TermRepository } from "../repository/term-repository";
import { TermRepositoryTag } from "../repository/term-repository";
import type { TransactionRepositories } from "../repository/transaction-engine";
import { TransactionEngineTag } from "../repository/transaction-engine";
import {
  type DeprecateMigrationPlan,
  type DeprecateMigrationResult,
  type DeprecateTermInput,
  type MergeMigrationPlan,
  type MergeMigrationResult,
  type MergeTermInput,
  type MigrationService,
  MigrationServiceTag,
  type RenameMigrationPlan,
  type RenameTermInput,
} from "./migration-service";
import {
  validateDeprecationSource,
  validateMergeTerms,
  validateReplacementChain,
  validateTermLifecycle,
} from "./term-lifecycle";
import { selectedTermForSelector } from "./term-resolution";

interface NormalizedRenameInput extends RenameTermInput {
  readonly normalizedFromName: string;
  readonly normalizedToName: string;
}

const randomJournalSuffix = (): string => {
  // SAFETY: Web Crypto is the platform API used by this service; only its optional randomUUID member is accessed.
  const webCrypto = (
    globalThis as {
      readonly crypto?: { readonly randomUUID?: () => string };
    }
  ).crypto;
  if (!webCrypto?.randomUUID) {
    throw new Error("Web Crypto randomUUID is required to generate journal entry IDs.");
  }
  return webCrypto.randomUUID();
};

const journalEntryIdFor = (input: NormalizedRenameInput): JournalEntryId =>
  JournalEntryIdSchema.make(
    `journal-rename-${input.kind}-${input.normalizedFromName}-${input.normalizedToName}-${randomJournalSuffix()}`
  );

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

    yield* validateTermLifecycle(repositories.terms, source.term, "rename");
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

    const tags = yield* repositories.tags.getAll;
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

const affectedFor = (repositories: RenameRepositories, term: Term) =>
  Effect.gen(function* () {
    const tags = (yield* repositories.tags.getAll).filter((tag) => tag.termId === term.id);
    const entities = yield* collectAffectedEntities(repositories.entities.getByTag, tags);
    return {
      affectedTags: tags,
      affectedEntities: entities,
      affectedEntityIds: entities.map(({ id }) => id),
    };
  });

const journalIdFor = (
  operation: "deprecate" | "merge",
  source: Term,
  target?: Term
): JournalEntryId =>
  JournalEntryIdSchema.make(
    `journal-${operation}-${source.id}-${target?.id ?? "none"}-${randomJournalSuffix()}`
  );

const deprecationPlan = (
  source: Term,
  replacement: Term | undefined,
  affected: ReturnType<typeof affectedFor> extends Effect.Effect<infer A, infer _E, infer _R>
    ? A
    : never
): DeprecateMigrationPlan => {
  let plan: DeprecateMigrationPlan = {
    operation: "deprecate",
    term: source,
    ...affected,
    affectedCount: affected.affectedEntityIds.length,
    notes: [
      `Will deprecate ${source.kind} term '${source.canonicalName}'.`,
      ...(replacement
        ? [`Recommend active replacement '${replacement.canonicalName}'.`]
        : ["No replacement is recommended."]),
    ],
  };
  if (replacement) plan = { ...plan, replacement };
  return plan;
};

const MigrationServiceImplementation = Layer.effect(
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

    const lifecycleTerms = (repo: TermRepository, input: DeprecateTermInput) =>
      Effect.gen(function* () {
        const source = yield* selectedTermForSelector(repo, input.term);
        const replacement = input.replacement
          ? yield* selectedTermForSelector(repo, input.replacement)
          : undefined;
        return { source, replacement };
      });

    const planDeprecate = (input: DeprecateTermInput) =>
      Effect.gen(function* () {
        const { source, replacement } = yield* lifecycleTerms(termRepo, input);
        yield* validateDeprecationSource(source);
        yield* validateTermLifecycle(termRepo, source, "deprecate");
        const mergedTerms = yield* termRepo.listMergedInto(source.id);
        if (mergedTerms.length > 0) {
          return yield* new ValidationError({
            field: "term",
            message: `Cannot deprecate '${source.canonicalName}' while merged terms point to it; merge the destination into another active term so merge chains end active.`,
          });
        }
        if (replacement) yield* validateReplacementChain(termRepo, source, replacement.id);
        if (
          source.status === "deprecated" &&
          (source.replacementTermId ?? undefined) === (replacement?.id ?? undefined)
        ) {
          return yield* new ValidationError({
            field: "replacement",
            message: `Term '${source.canonicalName}' is already deprecated with the requested replacement; choose a different replacement or clear it.`,
          });
        }
        const affected = yield* affectedFor(repositories, source);
        return deprecationPlan(source, replacement, affected);
      });

    const applyDeprecate = (input: DeprecateTermInput) =>
      transactionEngine.run((transactionRepositories) =>
        // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: transactional validation and journaling are intentionally kept together.
        Effect.gen(function* () {
          // Every selector read in this callback is transaction-scoped.
          const { source, replacement } = yield* lifecycleTerms(
            transactionRepositories.terms,
            input
          );
          yield* validateDeprecationSource(source);
          yield* validateTermLifecycle(transactionRepositories.terms, source, "deprecate");
          const mergedTerms = yield* transactionRepositories.terms.listMergedInto(source.id);
          if (mergedTerms.length > 0) {
            return yield* new ValidationError({
              field: "term",
              message: `Cannot deprecate '${source.canonicalName}' while merged terms point to it; merge the destination into another active term so merge chains end active.`,
            });
          }
          if (replacement) {
            yield* validateReplacementChain(transactionRepositories.terms, source, replacement.id);
          }
          if (
            source.status === "deprecated" &&
            (source.replacementTermId ?? undefined) === (replacement?.id ?? undefined)
          ) {
            return yield* new ValidationError({
              field: "replacement",
              message: `Term '${source.canonicalName}' is already deprecated with the requested replacement; choose a different replacement or clear it.`,
            });
          }
          const txRepositories: RenameRepositories = transactionRepositories;
          const affected = yield* affectedFor(txRepositories, source);
          const term = yield* transactionRepositories.terms.update(source.id, {
            status: "deprecated",
            replacementTermId: replacement?.id ?? null,
          });
          let journalInput: RecordJournalEntryInput = {
            id: input.journalEntryId ?? journalIdFor("deprecate", source, replacement),
            operation: "deprecate",
            kind: source.kind,
            fromName: source.canonicalName,
            termId: source.id,
            affectedEntityIds: affected.affectedEntityIds,
            dryRun: false,
          };
          if (replacement) {
            journalInput = {
              ...journalInput,
              toName: replacement.canonicalName,
              relatedTermId: replacement.id,
            };
          }
          if (input.reason) journalInput = { ...journalInput, reason: input.reason };
          if (input.appliedBy) journalInput = { ...journalInput, appliedBy: input.appliedBy };
          const journalEntry = yield* transactionRepositories.migrationJournal.record(journalInput);
          const plan = deprecationPlan(source, replacement, affected);
          return { plan, term, journalEntry } satisfies DeprecateMigrationResult;
        })
      );

    const mergeTerms = (repo: TermRepository, input: MergeTermInput) =>
      Effect.gen(function* () {
        const source = yield* selectedTermForSelector(repo, input.source);
        const destination = yield* selectedTermForSelector(repo, input.destination);
        return { source, destination };
      });

    const planMerge = (input: MergeTermInput) =>
      Effect.gen(function* () {
        const { source, destination } = yield* mergeTerms(termRepo, input);
        yield* validateMergeTerms(source, destination);
        yield* validateTermLifecycle(termRepo, source, "merge");
        yield* validateTermLifecycle(termRepo, destination, "merge");
        const affected = yield* affectedFor(repositories, source);
        return {
          operation: "merge",
          source,
          destination,
          ...affected,
          affectedCount: affected.affectedEntityIds.length,
          notes: [
            `Will merge '${source.canonicalName}' into active term '${destination.canonicalName}'.`,
          ],
        } satisfies MergeMigrationPlan;
      });

    const applyMerge = (input: MergeTermInput) =>
      transactionEngine.run((transactionRepositories) =>
        Effect.gen(function* () {
          // Do not resolve through the outer repository or service: this is a
          // transaction-scoped re-read that closes the TOCTOU window.
          const { source, destination } = yield* mergeTerms(transactionRepositories.terms, input);
          yield* validateMergeTerms(source, destination);
          yield* validateTermLifecycle(transactionRepositories.terms, source, "merge");
          yield* validateTermLifecycle(transactionRepositories.terms, destination, "merge");
          const txRepositories: RenameRepositories = transactionRepositories;
          const affected = yield* affectedFor(txRepositories, source);
          const updatedSource = yield* transactionRepositories.terms.update(source.id, {
            status: "merged",
            mergedIntoId: destination.id,
            replacementTermId: null,
          });
          const updatedTags: Tag[] = [];
          for (const tag of affected.affectedTags) {
            updatedTags.push(
              yield* transactionRepositories.tags.update(tag.id, { termId: destination.id })
            );
          }
          let journalInput: RecordJournalEntryInput = {
            id: input.journalEntryId ?? journalIdFor("merge", source, destination),
            operation: "merge",
            kind: source.kind,
            fromName: source.canonicalName,
            toName: destination.canonicalName,
            relatedTermId: destination.id,
            termId: source.id,
            affectedEntityIds: affected.affectedEntityIds,
            dryRun: false,
          };
          if (input.reason) journalInput = { ...journalInput, reason: input.reason };
          if (input.appliedBy) journalInput = { ...journalInput, appliedBy: input.appliedBy };
          const journalEntry = yield* transactionRepositories.migrationJournal.record(journalInput);
          const plan = {
            operation: "merge",
            source,
            destination,
            ...affected,
            affectedCount: affected.affectedEntityIds.length,
            notes: [
              `Will merge '${source.canonicalName}' into active term '${destination.canonicalName}'.`,
            ],
          } satisfies MergeMigrationPlan;
          return {
            plan,
            source: updatedSource,
            destination,
            updatedTags,
            journalEntry,
          } satisfies MergeMigrationResult;
        })
      );

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
          let journalInput: RecordJournalEntryInput = {
            id: normalized.journalEntryId ?? journalEntryIdFor(normalized),
            operation: "rename",
            kind: normalized.kind,
            fromName: plan.fromName,
            toName: normalized.toName,
            termId: term.id,
            affectedEntityIds: plan.affectedEntityIds,
            dryRun: false,
          };
          if (normalized.reason) journalInput = { ...journalInput, reason: normalized.reason };
          if (normalized.appliedBy)
            journalInput = { ...journalInput, appliedBy: normalized.appliedBy };
          const journalEntry = yield* transactionRepositories.migrationJournal.record(journalInput);
          return { ...plan, term, updatedTags, journalEntry };
        })
      );

    return {
      planRename,
      applyRename,
      planDeprecate,
      applyDeprecate,
      planMerge,
      applyMerge,
    } satisfies MigrationService;
  })
);

/** Repositories are the only dependencies of the standalone migration layer. */
export const MigrationServiceLive = MigrationServiceImplementation;
