/**
 * Link Commands
 * Create, remove, and inspect directed entity relationships.
 */
import { Args, Command } from "@effect/cli";
import {
  type Entity,
  EntityServiceTag,
  type Link,
  LinkRepositoryTag,
  type LinkType,
} from "@kioku/core";
import { Console, Data, Effect } from "effect";
import { formatEntityIdMatches, resolveEntityId } from "../entity-id.js";
import { withCliServices } from "./workspace.js";

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

const parseLinkType = (value: string) =>
  linkTypes.includes(value as LinkType)
    ? Effect.succeed(value as LinkType)
    : Effect.fail(new InvalidLinkTypeError({ value }));

const collectLinkArgs = (args: ReadonlyArray<string>) => {
  const positional: string[] = [];
  let type: string | undefined;

  for (let index = 0; index < args.length; index++) {
    const value = args[index];
    if (!value) continue;

    if (value === "--type") {
      type = args[index + 1];
      index++;
    } else {
      positional.push(value);
    }
  }

  return { positional, type };
};

const validateLinkArgs = (args: ReadonlyArray<string>, requireType: boolean) => {
  if (args.includes("--type") && !args[args.indexOf("--type") + 1]) {
    return "--type requires a value.";
  }

  const unknownOption = args.find((value) => value.startsWith("--") && value !== "--type");
  if (unknownOption) return `Unknown option: ${unknownOption}`;

  const { positional, type } = collectLinkArgs(args);
  if (positional.length !== 2) return "Expected <sourceId> and <targetId>.";
  if (requireType && !type) return "--type is required.";
};

const parseLinkArgs = (args: ReadonlyArray<string>, requireType: boolean) =>
  Effect.gen(function* () {
    const error = validateLinkArgs(args, requireType);
    if (error) return yield* Effect.fail(new InvalidLinkCommandError({ message: error }));

    const { positional, type } = collectLinkArgs(args);
    const [sourceId, targetId] = positional as [string, string];
    return { sourceId, targetId, type };
  });

const entitySummary = (entity: Entity): string => `${entity.id}  [${entity._tag}] ${entity.title}`;

const directionLabel = (link: Link, entityId: string): string =>
  link.sourceId === entityId ? `--${link.type}-->` : `<--${link.type}--`;

const otherEntityId = (link: Link, entityId: string): string =>
  link.sourceId === entityId ? link.targetId : link.sourceId;

const printLinkGroup = (title: string, entityId: string, links: ReadonlyArray<Link>) =>
  Effect.gen(function* () {
    yield* Console.log("");
    yield* Console.log(title);
    yield* Console.log("-".repeat(title.length));

    if (links.length === 0) {
      yield* Console.log("  No links found.");
      return;
    }

    const entityService = yield* EntityServiceTag;
    for (const link of links) {
      const other = yield* entityService.getById(
        otherEntityId(link, entityId) as Parameters<typeof entityService.getById>[0]
      );
      yield* Console.log(`  ${entityId} ${directionLabel(link, entityId)} ${entitySummary(other)}`);
    }
  });

const catchLinkErrors = <A, R>(effect: Effect.Effect<A, LinkCommandError, R>) =>
  effect.pipe(
    Effect.catchAll((error) => {
      switch (error._tag) {
        case "InvalidLinkTypeError":
          return Console.error(
            `Error: Invalid link type "${error.value ?? ""}". Expected one of: ${linkTypes.join(", ")}.`
          ).pipe(Effect.zipRight(Effect.fail(error)));
        case "AmbiguousEntityIdError":
          return Console.error(
            `Error: Entity id "${error.value ?? ""}" is ambiguous: ${formatEntityIdMatches(error.matches ?? [])}`
          ).pipe(Effect.zipRight(Effect.fail(error)));
        case "InvalidLinkCommandError":
        case "WorkspaceNotFoundError":
        case "ConfigError":
          return Console.error(`Error: ${error.message ?? error._tag}`).pipe(
            Effect.zipRight(Effect.fail(error))
          );
        case "RepositoryError":
          return Console.error(`Database error: ${error.message ?? error._tag}`).pipe(
            Effect.zipRight(Effect.fail(error))
          );
        case "EntityNotFoundError":
          return Console.error(`Error: Entity not found: ${error.entityId ?? ""}`).pipe(
            Effect.zipRight(Effect.fail(error))
          );
        case "LinkNotFoundError":
          return Console.error(`Error: Link not found: ${error.linkId ?? ""}`).pipe(
            Effect.zipRight(Effect.fail(error))
          );
        default:
          return Effect.fail(error);
      }
    })
  );

const linkListCommand = Command.make(
  "list",
  {
    entityId: Args.text({ name: "entityId" }),
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
    args: Args.text({ name: "args" }).pipe(Args.repeated),
  },
  ({ args }) =>
    withCliServices(
      Effect.gen(function* () {
        const linkRepository = yield* LinkRepositoryTag;
        const parsed = yield* parseLinkArgs(args, true);
        const source = yield* resolveEntityId(parsed.sourceId);
        const target = yield* resolveEntityId(parsed.targetId);
        const linkType = yield* parseLinkType(parsed.type ?? "");

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
    args: Args.text({ name: "args" }).pipe(Args.repeated),
  },
  ({ args }) =>
    withCliServices(
      Effect.gen(function* () {
        const linkRepository = yield* LinkRepositoryTag;
        const parsed = yield* parseLinkArgs(args, false);
        const source = yield* resolveEntityId(parsed.sourceId);
        const target = yield* resolveEntityId(parsed.targetId);
        const linkType = parsed.type ? yield* parseLinkType(parsed.type) : undefined;

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
