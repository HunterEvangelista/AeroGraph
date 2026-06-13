import { EntityNotFoundError, EntityServiceTag } from "@kioku/core";
import { Data, Effect, Result } from "effect";
import { EntityPrefixIndexTag } from "./db/entity-prefix-index.js";

export interface EntityIdMatch {
  readonly id: string;
  readonly title: string;
  readonly type: "doc" | "code_ref" | "story" | "diagram";
}

export class AmbiguousEntityIdError extends Data.TaggedError("AmbiguousEntityIdError")<{
  readonly value: string;
  readonly matches: ReadonlyArray<EntityIdMatch>;
}> {}

export const formatEntityIdMatches = (matches: ReadonlyArray<EntityIdMatch>): string =>
  matches.map((match) => `${match.id} [${match.type}] ${match.title}`).join(", ");

export const resolveEntityId = (value: string) =>
  Effect.gen(function* () {
    const entityService = yield* EntityServiceTag;
    const prefixIndex = yield* EntityPrefixIndexTag;
    const exact = yield* Effect.result(
      entityService.getById(value as Parameters<typeof entityService.getById>[0])
    );

    if (Result.isSuccess(exact)) {
      return exact.success.id;
    }

    if (exact.failure._tag !== "EntityNotFoundError") {
      return yield* exact.failure;
    }

    const indexedId = yield* prefixIndex.resolvePrefix(value);
    if (indexedId) {
      return indexedId;
    }

    const matches = yield* prefixIndex.findMatchesByPrefix(value);

    if (matches.length === 1) {
      return matches[0]?.id ?? value;
    }

    if (matches.length > 1) {
      return yield* new AmbiguousEntityIdError({
        value,
        matches,
      });
    }

    return yield* new EntityNotFoundError({ entityId: value });
  });
