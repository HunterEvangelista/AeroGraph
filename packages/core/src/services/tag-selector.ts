import { Effect } from "effect";
import type { TagId } from "../domain/tag.js";
import type { TermId } from "../domain/term.js";
import type { AmbiguousTermNameError, RepositoryError, TermMigrationError } from "../errors.js";
import { TagRepositoryTag } from "../repository/tag-repository.js";
import { TermServiceTag } from "./term-service.js";

export interface ResolvedTagSelector {
  readonly selector: string;
  readonly tagIds: ReadonlyArray<TagId>;
  readonly termId?: TermId;
  readonly canonicalName?: string;
}

export const resolveTagSelectors = (
  selectors: ReadonlyArray<string>
): Effect.Effect<
  ReadonlyArray<ResolvedTagSelector>,
  AmbiguousTermNameError | RepositoryError | TermMigrationError,
  TagRepositoryTag | TermServiceTag
> =>
  Effect.gen(function* () {
    const tagRepository = yield* TagRepositoryTag;
    const termService = yield* TermServiceTag;
    const tags = yield* tagRepository.getAll;
    const resolvedSelectors: ResolvedTagSelector[] = [];
    const seen = new Set<string>();

    for (const selector of selectors) {
      const resolution = yield* termService.resolveName(selector).pipe(
        Effect.map((value) => ({ found: true as const, value })),
        Effect.catchTag("TermNotFoundError", () => Effect.succeed({ found: false as const }))
      );

      if (resolution.found) {
        const key = `term:${resolution.value.term.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        resolvedSelectors.push({
          selector,
          termId: resolution.value.term.id,
          canonicalName: resolution.value.term.canonicalName,
          tagIds: tags
            .filter((tag) => tag.termId === resolution.value.term.id)
            .map((tag) => tag.id),
        });
        continue;
      }

      const key = `tag:${selector}`;
      if (seen.has(key)) continue;
      seen.add(key);
      resolvedSelectors.push({ selector, tagIds: [selector as TagId] });
    }

    return resolvedSelectors;
  });
