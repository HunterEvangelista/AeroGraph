import {
  type Entity,
  type EntityId,
  EntityServiceTag,
  type Link,
  LinkRepositoryTag,
  type LinkType,
} from "@aerograph/core";
import { Console, Data, Effect, Option } from "effect";
/**
 * Link Commands
 * Create, remove, and inspect directed entity relationships.
 */
import { Argument, Command, Flag } from "effect/unstable/cli";
import { formattedEntityId, loadFormattedEntityIds } from "../entity-display";
import { formatEntityIdMatches, resolveEntityId } from "../entity-id";
import { withCliServices } from "./workspace";

const linkTypes = [
  "references",
  "parent_of",
  "child_of",
  "blocks",
  "blocked_by",
  "related_to",
] as const satisfies ReadonlyArray<LinkType>;

class InvalidLinkTypeError extends Data.TaggedError("InvalidLinkTypeError")<{
  readonly value: string;
}> {}

class InvalidLinkCommandError extends Data.TaggedError("InvalidLinkCommandError")<{
  readonly message: string;
}> {}

interface LinkCommandError {
  readonly _tag: string;
  readonly entityId?: string;
  readonly linkId?: string;
  readonly matches?: Parameters<typeof formatEntityIdMatches>[0];
  readonly message?: string;
  readonly value?: string;
}

const parseLinkType = (value: string) => {
  const linkType = linkTypes.find((candidate) => candidate === value);
  return linkType ? Effect.succeed(linkType) : Effect.fail(new InvalidLinkTypeError({ value }));
};

const entitySummary = (entity: Entity, displayIds: ReadonlyMap<string, string>): string =>
  `${formattedEntityId(displayIds, entity.id)}  [${entity._tag}] ${entity.title}`;

const directionLabel = (link: Link, entityId: string): string =>
  link.sourceId === entityId ? `--${link.type}-->` : `<--${link.type}--`;

const otherEntityId = (link: Link, entityId: EntityId): EntityId =>
  link.sourceId === entityId ? link.targetId : link.sourceId;

const printLinkGroup = (title: string, entityId: EntityId, links: ReadonlyArray<Link>) =>
  Effect.gen(function* () {
    yield* Console.log("");
    yield* Console.log(title);
    yield* Console.log("-".repeat(title.length));

    if (links.length === 0) {
      yield* Console.log("  No links found.");
      return;
    }

    const entityService = yield* EntityServiceTag;
    const others: Entity[] = [];
    for (const link of links) {
      const other = yield* entityService.getById(otherEntityId(link, entityId));
      others.push(other);
    }

    const displayIds = yield* loadFormattedEntityIds([
      entityId,
      ...others.map((entity) => entity.id),
    ]);
    for (const [index, link] of links.entries()) {
      const other = others[index];
      if (!other) continue;
      yield* Console.log(
        `  ${formattedEntityId(displayIds, entityId)} ${directionLabel(link, entityId)} ${entitySummary(other, displayIds)}`
      );
    }
  });

const catchLinkErrors = <A, R>(effect: Effect.Effect<A, LinkCommandError, R>) =>
  effect.pipe(
    Effect.catch((error) => {
      switch (error._tag) {
        case "InvalidLinkTypeError":
          return Console.error(
            `Error: Invalid link type "${error.value ?? ""}". Expected one of: ${linkTypes.join(", ")}.`
          ).pipe(Effect.andThen(Effect.fail(error)));
        case "AmbiguousEntityIdError":
          return Console.error(
            `Error: Entity id "${error.value ?? ""}" is ambiguous: ${formatEntityIdMatches(error.matches ?? [])}`
          ).pipe(Effect.andThen(Effect.fail(error)));
        case "InvalidLinkCommandError":
        case "WorkspaceNotFoundError":
        case "ConfigError":
          return Console.error(`Error: ${error.message ?? error._tag}`).pipe(
            Effect.andThen(Effect.fail(error))
          );
        case "RepositoryError":
          return Console.error(`Database error: ${error.message ?? error._tag}`).pipe(
            Effect.andThen(Effect.fail(error))
          );
        case "EntityNotFoundError":
          return Console.error(`Error: Entity not found: ${error.entityId ?? ""}`).pipe(
            Effect.andThen(Effect.fail(error))
          );
        case "LinkNotFoundError":
          return Console.error(`Error: Link not found: ${error.linkId ?? ""}`).pipe(
            Effect.andThen(Effect.fail(error))
          );
        default:
          return Effect.fail(error);
      }
    })
  );

const linkListCommand = Command.make(
  "list",
  {
    entityId: Argument.string("entityId"),
  },
  ({ entityId }) =>
    withCliServices(
      Effect.gen(function* () {
        const linkRepository = yield* LinkRepositoryTag;
        const resolvedEntityId = yield* resolveEntityId(entityId);
        const links = yield* linkRepository.getAllForEntity(resolvedEntityId);
        const outgoing = links.filter((link) => link.sourceId === resolvedEntityId);
        const incoming = links.filter((link) => link.targetId === resolvedEntityId);

        yield* Console.log("");
        yield* Console.log(`Links for ${resolvedEntityId}`);
        yield* Console.log("=".repeat(40));
        yield* printLinkGroup("Outgoing", resolvedEntityId, outgoing);
        yield* printLinkGroup("Incoming", resolvedEntityId, incoming);
        yield* Console.log("");
      })
    ).pipe(catchLinkErrors)
);

export const linkCommand = Command.make(
  "link",
  {
    sourceId: Argument.string("sourceId"),
    targetId: Argument.string("targetId"),
    type: Flag.string("type").pipe(Flag.optional),
  },
  ({ sourceId, targetId, type }) =>
    withCliServices(
      Effect.gen(function* () {
        const linkRepository = yield* LinkRepositoryTag;
        const typeValue = Option.getOrUndefined(type);
        if (!typeValue) {
          return yield* new InvalidLinkCommandError({ message: "--type is required." });
        }
        const source = yield* resolveEntityId(sourceId);
        const target = yield* resolveEntityId(targetId);
        const linkType = yield* parseLinkType(typeValue);

        // Links are stored as one directed row. Incoming/inverse semantics are derived
        // from source/target at read time so we can add bidirectional options later.
        const link = yield* linkRepository.create({
          sourceId: source,
          targetId: target,
          type: linkType,
        });

        yield* Console.log("");
        yield* Console.log("Link created successfully!");
        yield* Console.log("");
        yield* Console.log(`${link.sourceId} --${link.type}--> ${link.targetId}`);
        yield* Console.log("");
      })
    ).pipe(catchLinkErrors)
).pipe(Command.withSubcommands([linkListCommand]));

export const unlinkCommand = Command.make(
  "unlink",
  {
    sourceId: Argument.string("sourceId"),
    targetId: Argument.string("targetId"),
    type: Flag.string("type").pipe(Flag.optional),
  },
  ({ sourceId, targetId, type }) =>
    withCliServices(
      Effect.gen(function* () {
        const linkRepository = yield* LinkRepositoryTag;
        const source = yield* resolveEntityId(sourceId);
        const target = yield* resolveEntityId(targetId);
        const typeValue = Option.getOrUndefined(type);
        const linkType = typeValue ? yield* parseLinkType(typeValue) : undefined;

        yield* linkRepository.deleteBetween(source, target, linkType);

        yield* Console.log("");
        yield* Console.log("Link removed successfully!");
        yield* Console.log("");
        yield* Console.log(
          linkType ? `${source} --${linkType}--> ${target}` : `${source} -> ${target}`
        );
        yield* Console.log("");
      })
    ).pipe(catchLinkErrors)
);
