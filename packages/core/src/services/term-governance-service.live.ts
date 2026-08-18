import { Effect, Layer } from "effect";
import { MigrationJournalRepositoryTag } from "../repository/migration-journal-repository";
import { type TermGovernanceService, TermGovernanceServiceTag } from "./term-governance-service";
import { isTermSelectorObject } from "./term-resolution";
import { type TermSelector, TermServiceTag } from "./term-service";

const selectorLabel = (selector: TermSelector): string =>
  isTermSelectorObject(selector) ? ("id" in selector ? selector.id : selector.name) : selector;

const TermGovernanceServiceImplementation = Layer.effect(
  TermGovernanceServiceTag,
  Effect.gen(function* () {
    const terms = yield* TermServiceTag;
    const journal = yield* MigrationJournalRepositoryTag;

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
      list: (kind) => terms.listDetails(kind),
      show: (selector) => terms.show(selector),
      addAlias: (input) => terms.addAlias(input.term, input.alias, input.displayName),
      audit,
    } satisfies TermGovernanceService;
  })
);

/** Requires a TermService and journal repository; no hidden duplicate service layer. */
export const TermGovernanceServiceLive = TermGovernanceServiceImplementation;
