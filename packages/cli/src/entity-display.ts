import { Effect } from "effect";
import { EntityPrefixIndexTag, formatEntityIdWithBoldPrefix } from "./db/entity-prefix-index.js";

export const loadFormattedEntityIds = (entityIds: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const prefixIndex = yield* EntityPrefixIndexTag;
    const prefixes = yield* prefixIndex.getDisplayPrefixes(entityIds);
    return new Map(
      entityIds.map((id) => [id, formatEntityIdWithBoldPrefix(id, prefixes.get(id) ?? null)])
    );
  });

export const formattedEntityId = (ids: ReadonlyMap<string, string>, entityId: string): string =>
  ids.get(entityId) ?? entityId;
