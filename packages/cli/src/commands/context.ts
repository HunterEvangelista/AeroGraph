import { writeFile } from "node:fs/promises";
import {
  type Entity,
  EntityServiceTag,
  GraphServiceTag,
  type Link,
  LinkRepositoryTag,
  resolveTagSelectors,
  type Tag,
  TagServiceTag,
  TermServiceTag,
} from "@kioku/core";
import { Console, Data, Effect, Option } from "effect";
import { Argument, Command, Flag } from "effect/unstable/cli";
import { formatEntityIdMatches, resolveEntityId } from "../entity-id";
import { type ContextEntity, formatContextMarkdown } from "../ui/context-markdown";
import { isNonNegativeInteger } from "./validation";
import { withCliServices } from "./workspace";

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

const validateDepth = (depth: number) => {
  if (isNonNegativeInteger(depth)) return Effect.void;

  return Effect.fail(
    new InvalidContextQueryError({ message: "--depth must be a non-negative integer." })
  );
};

const canonicalTagName = (tag: Tag, canonicalNames: Map<string, string>) =>
  Effect.gen(function* () {
    if (!tag.termId) return tag.id;
    const cached = canonicalNames.get(tag.termId);
    if (cached) return cached;

    const termService = yield* TermServiceTag;
    const term = yield* termService.getById(tag.termId);
    canonicalNames.set(tag.termId, term.canonicalName);
    return term.canonicalName;
  });

const loadContextEntities = (entities: ReadonlyArray<Entity>, canonicalTerms: boolean) =>
  Effect.gen(function* () {
    const tagService = yield* TagServiceTag;
    const results: ContextEntity[] = [];
    const canonicalNames = new Map<string, string>();

    for (const entity of entities) {
      const tags = yield* tagService.getTagsForEntity(entity.id);
      const tagIds = tags.map((tag) => tag.id);
      if (!canonicalTerms) {
        results.push({ entity, tags: tagIds });
        continue;
      }

      const displayTags: string[] = [];
      for (const tag of tags) {
        const displayName = yield* canonicalTagName(tag, canonicalNames);
        if (!displayTags.includes(displayName)) displayTags.push(displayName);
      }
      results.push({ entity, tags: tagIds, displayTags });
    }

    return results;
  });

const loadTagSelection = (tagValue: string, canonicalTerms: boolean) =>
  Effect.gen(function* () {
    const selectors = splitTags(tagValue);
    if (selectors.length === 0) {
      return yield* new InvalidContextQueryError({
        message: "--tags must include at least one tag.",
      });
    }

    const graphService = yield* GraphServiceTag;
    const resolved = yield* resolveTagSelectors(selectors);
    const titleSelectors = canonicalTerms
      ? resolved.map((selector) => selector.canonicalName ?? selector.selector)
      : selectors;
    const entities = yield* graphService.findByTagGroups(
      resolved.map((selector) => selector.tagIds)
    );
    return {
      title: `Tags ${titleSelectors.map((tag) => `#${tag}`).join(", ")}`,
      entities,
    };
  });

const loadEntitySelection = (query: ReadonlyArray<string>, depth: number) =>
  Effect.gen(function* () {
    const entityService = yield* EntityServiceTag;
    const graphService = yield* GraphServiceTag;
    const resolvedId = yield* resolveEntityId(query[0] ?? "");
    const root = yield* entityService.getById(resolvedId);
    const traversal =
      depth > 0 ? yield* graphService.traverse(resolvedId, depth) : { entities: [] };
    return {
      title: root.title,
      entities: uniqueEntities([root, ...traversal.entities]),
    };
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

export const contextCommand = Command.make(
  "context",
  {
    tags: Flag.string("tags").pipe(Flag.optional),
    depth: Flag.integer("depth").pipe(Flag.withDefault(1)),
    output: Flag.string("output").pipe(Flag.optional),
    canonicalTerms: Flag.boolean("canonical-terms").pipe(
      Flag.withDescription("Display governed tags using canonical term names"),
      Flag.withDefault(false)
    ),
    query: Argument.string("query").pipe(Argument.variadic()),
  },
  ({ tags, depth, output, canonicalTerms, query }) =>
    Effect.gen(function* () {
      const tagValue = Option.getOrUndefined(tags);
      const outputValue = Option.getOrUndefined(output);
      const hasQuery = query.length > 0;

      yield* validateDepth(depth);

      if (tagValue && hasQuery) {
        return yield* new InvalidContextQueryError({
          message: "Choose either <entityId> or --tags, not both.",
        });
      }

      if (!tagValue && !hasQuery) {
        return yield* new InvalidContextQueryError({
          message: "Provide <entityId>, --tags, or a quoted task prompt.",
        });
      }

      if (!tagValue && (query.length > 1 || /\s/.test(query[0] ?? ""))) {
        yield* printTaskStub(query.join(" "));
        return;
      }

      const markdown = yield* withCliServices(
        Effect.gen(function* () {
          const linkRepository = yield* LinkRepositoryTag;
          const { title, entities } = tagValue
            ? yield* loadTagSelection(tagValue, canonicalTerms)
            : yield* loadEntitySelection(query, depth);

          const entityIds = new Set(entities.map((entity) => entity.id));
          const links: Link[] = [];
          for (const entity of entities) {
            links.push(...(yield* linkRepository.getAllForEntity(entity.id)));
          }

          return formatContextMarkdown({
            title,
            entities: yield* loadContextEntities(entities, canonicalTerms),
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
          Console.error(`Error: ${e.message}`).pipe(Effect.andThen(Effect.fail(e))),
        AmbiguousEntityIdError: (e) =>
          Console.error(
            `Error: Entity id "${e.value}" is ambiguous: ${formatEntityIdMatches(e.matches)}`
          ).pipe(Effect.andThen(Effect.fail(e))),
        EntityNotFoundError: (e) =>
          Console.error(`Error: Entity not found: ${e.entityId}`).pipe(
            Effect.andThen(Effect.fail(e))
          ),
        WorkspaceNotFoundError: (e) =>
          Console.error(`Error: ${e.message}`).pipe(Effect.andThen(Effect.fail(e))),
        ConfigError: (e) =>
          Console.error(`Error: ${e.message}`).pipe(Effect.andThen(Effect.fail(e))),
        RepositoryError: (e) =>
          Console.error(`Database error: ${e.message}`).pipe(Effect.andThen(Effect.fail(e))),
        AmbiguousTermNameError: (e) =>
          Console.error(`Error: ${e.message}`).pipe(Effect.andThen(Effect.fail(e))),
        TermNotFoundError: (e) =>
          Console.error(`Error: ${e.message}`).pipe(Effect.andThen(Effect.fail(e))),
      })
    )
).pipe(Command.withDescription("Export agent-ready markdown context"));
