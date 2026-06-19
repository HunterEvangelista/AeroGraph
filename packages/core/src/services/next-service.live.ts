import { Effect, Layer } from "effect";
import type { CreateNextCommandInput, NextCommandType } from "../domain/next-command.js";
import { NextRepositoryTag } from "../repository/next-repository.js";
import { type NextService, NextServiceTag } from "./next-service.js";

const defaultCommandTypes = [
  "related_to",
  "traverse",
] as const satisfies ReadonlyArray<NextCommandType>;

export const NextServiceLive = Layer.effect(
  NextServiceTag,
  Effect.gen(function* () {
    const repo = yield* NextRepositoryTag;

    const recordDisplayedEntities: NextService["recordDisplayedEntities"] = (entities) => {
      const commands: CreateNextCommandInput[] = [];

      for (const entity of entities) {
        for (const commandType of defaultCommandTypes) {
          commands.push({
            entityId: entity.entityId,
            prefix: entity.prefix,
            commandType,
          });
        }
      }

      return repo.replaceAll(commands);
    };

    const find: NextService["find"] = (entityId, commandType) =>
      Effect.gen(function* () {
        const commands = yield* repo.list(entityId);
        return commands.find((command) => command.commandType === commandType);
      });

    return {
      recordDisplayedEntities,
      list: (entityId) => repo.list(entityId),
      clear: (entityId) => repo.clear(entityId),
      find,
    } satisfies NextService;
  })
);
