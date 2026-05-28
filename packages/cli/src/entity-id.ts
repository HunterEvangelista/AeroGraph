import { type Entity, EntityNotFoundError, EntityServiceTag } from "@kioku/core";
import { Data, Effect } from "effect";

export interface EntityIdMatch {
  readonly id: string;
  readonly title: string;
  readonly type: Entity["_tag"];
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
    const exact = yield* Effect.either(
      entityService.getById(value as Parameters<typeof entityService.getById>[0])
    );

    if (exact._tag === "Right") {
      return exact.right.id;
    }

    const entities = yield* entityService.getAll();
    const matches = entities.filter((entity) => entity.id.startsWith(value));

    if (matches.length === 1) {
      return matches[0]?.id ?? value;
    }

    if (matches.length > 1) {
      return yield* new AmbiguousEntityIdError({
          value,
          matches: matches.map((entity) => ({
              id: entity.id,
              title: entity.title,
              type: entity._tag,
          })),
      });
    }

    return yield* new EntityNotFoundError({ entityId: value });
  });
