import { BrandedId, type EntityId, EntityNotFoundError, EntityServiceTag } from "@kioku/core";
import { Data, Effect, Option, Result, Schema } from "effect";
import { EntityPrefixIndexTag } from "./db/entity-prefix-index.js";

export interface EntityIdMatch {
  readonly id: EntityId;
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
    const entityId = Option.getOrUndefined(Schema.decodeUnknownOption(BrandedId)(value));
    if (!entityId) {
      return yield* new EntityNotFoundError({ entityId: value });
    }

    const entityService = yield* EntityServiceTag;
    const prefixIndex = yield* EntityPrefixIndexTag;
    const exact = yield* Effect.result(entityService.getById(entityId));

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

    if (matches.length > 1) {
      return yield* new AmbiguousEntityIdError({
        value,
        matches,
      });
    }

    const [match] = matches;
    if (match) {
      return match.id;
    }

    return yield* new EntityNotFoundError({ entityId: value });
  });
