import { writeFile } from "node:fs/promises";
import { Args, Command } from "@effect/cli";
import {
  type Entity,
  EntityServiceTag,
  GraphServiceTag,
  type Link,
  LinkRepositoryTag,
  TagServiceTag,
} from "@kioku/core";
import { Console, Data, Effect } from "effect";
import { formatEntityIdMatches, resolveEntityId } from "../entity-id.js";
import { type ContextEntity, formatContextMarkdown } from "../ui/context-markdown.js";
import { withCliServices } from "./workspace.js";

class InvalidContextQueryError extends Data.TaggedError("InvalidContextQueryError")<{
  readonly message: string;
}> {}

const splitTags = (value: string): ReadonlyArray<string> =>
  value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

const uniqueEntities = (entities: ReadonlyArray<Entity>): ReadonlyArray<Entity> => [
  ...new Map(entities.map((entity) => [entity.id, entity])).values(),
];

const collectLinks = (
  links: ReadonlyArray<Link>,
  entityIds: ReadonlySet<string>
): ReadonlyArray<Link> =>
  links.filter((link) => entityIds.has(link.sourceId) && entityIds.has(link.targetId));

const loadContextEntities = (entities: ReadonlyArray<Entity>) =>
  Effect.gen(function* () {
    const tagService = yield* TagServiceTag;
    const results: ContextEntity[] = [];

    for (const entity of entities) {
      const tags = yield* tagService.getTagsForEntity(entity.id);
      results.push({ entity, tags: tags.map((tag) => tag.id) });
    }

    return results;
  });

const printTaskStub = (task: string) =>
  Effect.gen(function* () {
    yield* Console.log("");
    yield* Console.log("Task-shaped context export is not available yet.");
    yield* Console.log("");
    yield* Console.log(`Requested task: ${task}`);
    yield* Console.log("Use structured context modes for now:");
    yield* Console.log("  kioku context <entityId> --depth 2");
    yield* Console.log("  kioku context --tags auth,middleware");
    yield* Console.log("");
  });

const readFlagValue = (args: ReadonlyArray<string>, index: number, flag: string) =>
  Effect.gen(function* () {
    const value = args[index + 1];
    if (!value || value.startsWith("-")) {
      return yield* Effect.fail(
        new InvalidContextQueryError({ message: `${flag} requires a value.` })
      );
    }
    return value;
  });

const parseContextArgs = (args: ReadonlyArray<string>) =>
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Keeps option-after-id parsing localized for documented `context <id> --depth N --output file` forms.
  Effect.gen(function* () {
    let tagValue: string | undefined;
    let depth = 1;
    let outputValue: string | undefined;
    const query: string[] = [];

    for (let index = 0; index < args.length; index++) {
      const arg = args[index];
      if (!arg) continue;

      if (arg === "--tags") {
        tagValue = yield* readFlagValue(args, index, arg);
        index++;
      } else if (arg === "--depth") {
        const value = yield* readFlagValue(args, index, arg);
        depth = Number.parseInt(value, 10);
        if (!Number.isInteger(depth) || depth < 0) {
          return yield* Effect.fail(
            new InvalidContextQueryError({ message: "--depth must be >= 0." })
          );
        }
        index++;
      } else if (arg === "--output") {
        outputValue = yield* readFlagValue(args, index, arg);
        index++;
      } else if (arg.startsWith("-")) {
        return yield* Effect.fail(
          new InvalidContextQueryError({ message: `Unknown option: ${arg}` })
        );
      } else {
        query.push(arg);
      }
    }

    return { tagValue, depth, outputValue, query };
  });

export const contextCommand = Command.make(
  "context",
  {
    args: Args.text({ name: "args" }).pipe(Args.repeated),
  },
  ({ args }) =>
    Effect.gen(function* () {
      const { tagValue, depth, outputValue, query } = yield* parseContextArgs(args);
      const hasQuery = query.length > 0;

      if (tagValue && hasQuery) {
        return yield* Effect.fail(
          new InvalidContextQueryError({ message: "Choose either <entityId> or --tags, not both." })
        );
      }

      if (!tagValue && !hasQuery) {
        return yield* Effect.fail(
          new InvalidContextQueryError({
            message: "Provide <entityId>, --tags, or a quoted task prompt.",
          })
        );
      }

      if (!tagValue && (query.length > 1 || /\s/.test(query[0] ?? ""))) {
        yield* printTaskStub(query.join(" "));
        return;
      }

      const markdown = yield* withCliServices(
        Effect.gen(function* () {
          const entityService = yield* EntityServiceTag;
          const graphService = yield* GraphServiceTag;
          const linkRepository = yield* LinkRepositoryTag;

          let title: string;
          let entities: ReadonlyArray<Entity>;

          if (tagValue) {
            const tagIds = splitTags(tagValue);
            if (tagIds.length === 0) {
              return yield* Effect.fail(
                new InvalidContextQueryError({ message: "--tags must include at least one tag." })
              );
            }
            title = `Tags ${tagIds.map((tag) => `#${tag}`).join(", ")}`;
            entities = yield* graphService.findByTagPath(tagIds);
          } else {
            const resolvedId = yield* resolveEntityId(query[0] ?? "");
            const root = yield* entityService.getById(
              resolvedId as Parameters<typeof entityService.getById>[0]
            );
            const traversal =
              depth > 0 ? yield* graphService.traverse(resolvedId, depth) : { entities: [] };
            title = root.title;
            entities = uniqueEntities([root, ...traversal.entities]);
          }

          const entityIds = new Set(entities.map((entity) => entity.id));
          const links: Link[] = [];
          for (const entity of entities) {
            links.push(...(yield* linkRepository.getAllForEntity(entity.id)));
          }

          return formatContextMarkdown({
            title,
            entities: yield* loadContextEntities(entities),
            links: collectLinks(links, entityIds),
          });
        })
      );

      if (outputValue) {
        yield* Effect.tryPromise({
          try: () => writeFile(outputValue, markdown),
          catch: (error) =>
            new InvalidContextQueryError({
              message: `Failed to write output: ${error instanceof Error ? error.message : String(error)}`,
            }),
        });
        yield* Console.log(`Context written to ${outputValue}`);
      } else {
        yield* Console.log(markdown);
      }
    }).pipe(
      Effect.catchTags({
        InvalidContextQueryError: (e) =>
          Console.error(`Error: ${e.message}`).pipe(Effect.zipRight(Effect.fail(e))),
        AmbiguousEntityIdError: (e) =>
          Console.error(
            `Error: Entity id "${e.value}" is ambiguous: ${formatEntityIdMatches(e.matches)}`
          ).pipe(Effect.zipRight(Effect.fail(e))),
        EntityNotFoundError: (e) =>
          Console.error(`Error: Entity not found: ${e.entityId}`).pipe(
            Effect.zipRight(Effect.fail(e))
          ),
        WorkspaceNotFoundError: (e) =>
          Console.error(`Error: ${e.message}`).pipe(Effect.zipRight(Effect.fail(e))),
        ConfigError: (e) =>
          Console.error(`Error: ${e.message}`).pipe(Effect.zipRight(Effect.fail(e))),
        RepositoryError: (e) =>
          Console.error(`Database error: ${e.message}`).pipe(Effect.zipRight(Effect.fail(e))),
      })
    )
).pipe(Command.withDescription("Export agent-ready markdown context"));
