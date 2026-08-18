import { Effect, Layer } from "effect";
import { ValidationError } from "../errors";
import { MigrationJournalRepositoryTag } from "../repository/migration-journal-repository";
import { TagRepositoryTag } from "../repository/tag-repository";
import { TransactionEngineTag } from "../repository/transaction-engine";
import {
  type CreateGovernedTermInput,
  type TermGovernanceService,
  TermGovernanceServiceTag,
} from "./term-governance-service";
import { isTermSelectorObject, resolveTermSelector } from "./term-resolution";
import { type TermResolution, type TermSelector, TermServiceTag } from "./term-service";

const selectorLabel = (selector: TermSelector): string =>
  isTermSelectorObject(selector) ? ("id" in selector ? selector.id : selector.name) : selector;

const generatedTermId = (): string => {
  // SAFETY: The runtime contract requires Web Crypto; the narrow type keeps this package portable across TypeScript library targets.
  const cryptoApi = (globalThis as typeof globalThis & { crypto?: { randomUUID: () => string } })
    .crypto;
  if (!cryptoApi) throw new Error("Web Crypto randomUUID is required to generate term IDs.");
  return `term-${cryptoApi.randomUUID()}`;
};

const validateGovernance = (
  tagName: string,
  replace: TermSelector | undefined,
  current: TermResolution | undefined,
  target: TermResolution,
  expected: TermResolution | undefined
) => {
  if (!replace && current && current.term.id !== target.term.id)
    return Effect.fail(
      new ValidationError({
        field: "term",
        message: `Tag '${tagName}' is already governed by '${current.term.canonicalName}'. Pass replace with the current term selector to replace it safely.`,
      })
    );
  if (replace && !current)
    return Effect.fail(
      new ValidationError({
        field: "replace",
        message:
          "Cannot replace governance on an ungoverned tag; omit replace for an ungoverned tag.",
      })
    );
  if (replace && current && expected && expected.term.id !== current.term.id)
    return Effect.fail(
      new ValidationError({
        field: "replace",
        message: `Expected current term '${expected?.term.canonicalName}' does not match the tag's current term '${current.term.canonicalName}'.`,
      })
    );
  if (current && current.term.kind !== target.term.kind)
    return Effect.fail(
      new ValidationError({
        field: "term",
        message: `Cannot govern tag with kind '${target.term.kind}': current term kind is '${current.term.kind}'. Replacement terms must have the same kind.`,
      })
    );
  return Effect.void;
};

const TermGovernanceServiceImplementation = Layer.effect(
  TermGovernanceServiceTag,
  Effect.gen(function* () {
    const terms = yield* TermServiceTag;
    const journal = yield* MigrationJournalRepositoryTag;
    const tags = yield* TagRepositoryTag;
    const transactionEngine = yield* TransactionEngineTag;

    const inspectTag = (tagId: Parameters<typeof tags.getById>[0]) =>
      Effect.gen(function* () {
        const tag = yield* tags.getById(tagId);
        const term = tag.termId ? yield* terms.show({ id: tag.termId }) : undefined;
        return term ? { tag, term } : { tag };
      });

    const listTags = (governance?: "governed" | "ungoverned") =>
      Effect.gen(function* () {
        const allTags = yield* tags.getAll;
        const selected = allTags
          .filter((tag) =>
            governance === "governed"
              ? tag.termId !== undefined
              : governance === "ungoverned"
                ? tag.termId === undefined
                : true
          )
          .sort((left, right) => left.id.localeCompare(right.id));
        return yield* Effect.forEach(selected, (tag) =>
          tag.termId
            ? terms.show({ id: tag.termId }).pipe(Effect.map((term) => ({ tag, term })))
            : Effect.succeed({ tag })
        );
      });

    const create = (input: CreateGovernedTermInput) =>
      Effect.gen(function* () {
        const term = yield* terms.create({
          ...input,
          id: input.id ?? generatedTermId(),
        });
        return yield* terms.show({ id: term.id });
      });

    const governTag = (input: Parameters<TermGovernanceService["governTag"]>[0]) =>
      transactionEngine
        .run((repositories) =>
          Effect.gen(function* () {
            const tag = yield* repositories.tags.getById(input.tagId);
            const target = yield* resolveTermSelector(repositories.terms, input.term);
            const current = tag.termId
              ? yield* resolveTermSelector(repositories.terms, { id: tag.termId })
              : undefined;

            const expected = input.replace
              ? yield* resolveTermSelector(repositories.terms, input.replace)
              : undefined;
            yield* validateGovernance(tag.name, input.replace, current, target, expected);
            const updated = yield* repositories.tags.update(tag.id, { termId: target.term.id });
            return { tag: updated, termId: target.term.id };
          })
        )
        .pipe(
          Effect.flatMap(({ tag, termId }) =>
            terms.show({ id: termId }).pipe(Effect.map((term) => ({ tag, term })))
          )
        );

    const audit = (selector: TermSelector) =>
      Effect.gen(function* () {
        const inspection = yield* terms.show(selector);
        // show() preserves the selected registry record for merged selectors.
        // listByTerm already includes primary and related attribution, so one
        // call is both complete and intentionally non-overinclusive.
        const entries = yield* journal.listByTerm(inspection.term.id);
        return {
          selector: selectorLabel(selector),
          inspection,
          entries: [...entries].sort(
            (left, right) =>
              right.appliedAt.getTime() - left.appliedAt.getTime() ||
              right.id.localeCompare(left.id)
          ),
        };
      });

    return {
      create,
      inspectTag,
      listTags,
      governTag,
      list: (kind) => terms.listDetails(kind),
      show: (selector) => terms.show(selector),
      addAlias: (input) => terms.addAlias(input.term, input.alias, input.displayName),
      audit,
    } satisfies TermGovernanceService;
  })
);

/** Requires a TermService and journal repository; no hidden duplicate service layer. */
export const TermGovernanceServiceLive = TermGovernanceServiceImplementation;
