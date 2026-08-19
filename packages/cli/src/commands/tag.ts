import {
  type AeroGraphError,
  type GovernTagInput,
  type TagGovernanceInspection,
  TagIdSchema,
  TagServiceTag,
  TERM_KINDS,
  TermGovernanceServiceTag,
  TermIdSchema,
  TermKind as TermKindSchema,
  ValidationError,
} from "@aerograph/core";
import { Console, Effect, Option, Schema } from "effect";
/**
 * Tag Commands
 * Operations for managing tags and entity tagging
 */
import { Argument, Command, Flag } from "effect/unstable/cli";
import { withCliServices } from "./workspace";

// ============================================================================
// Tag Create Command
// ============================================================================

const tagCreateCommand = Command.make(
  "create",
  {
    name: Argument.string("name"),
    parent: Flag.string("parent").pipe(
      Flag.withAlias("p"),
      Flag.withDescription("Parent tag ID for hierarchy"),
      Flag.optional
    ),
    description: Flag.string("description").pipe(
      Flag.withAlias("d"),
      Flag.withDescription("Tag description"),
      Flag.optional
    ),
  },
  ({ name, parent, description }) =>
    Effect.gen(function* () {
      const parentValue = Option.getOrUndefined(parent);
      const descValue = Option.getOrUndefined(description);

      const tag = yield* withCliServices(
        Effect.gen(function* () {
          const tagService = yield* TagServiceTag;

          // If parent is specified, use hierarchical creation
          if (parentValue) {
            const tagPath = `${parentValue}/${name}`;
            return yield* tagService.ensureHierarchy(tagPath);
          }

          // Otherwise create a root tag
          return yield* tagService.create({
            id: name,
            name,
            description: descValue,
          });
        })
      );

      yield* Console.log("");
      yield* Console.log("Tag created successfully!");
      yield* Console.log("");
      yield* Console.log(`ID:     #${tag.id}`);
      yield* Console.log(`Name:   ${tag.name}`);
      if (tag.description) {
        yield* Console.log(`Desc:   ${tag.description}`);
      }
      if (tag.parentId) {
        yield* Console.log(`Parent: #${tag.parentId}`);
      }
      yield* Console.log("");
    }).pipe(
      Effect.catchTags({
        WorkspaceNotFoundError: (e) =>
          Console.error(`Error: ${e.message}`).pipe(Effect.andThen(Effect.fail(e))),
        ConfigError: (e) =>
          Console.error(`Error: ${e.message}`).pipe(Effect.andThen(Effect.fail(e))),
        RepositoryError: (e) =>
          Console.error(`Database error: ${e.message}`).pipe(Effect.andThen(Effect.fail(e))),
        ValidationError: (e) =>
          Console.error(`Validation error: ${e.message}`).pipe(Effect.andThen(Effect.fail(e))),
      })
    )
);

// ============================================================================
// Tag List Command
// ============================================================================

const jsonFlag = Flag.boolean("json").pipe(
  Flag.withDescription("Emit JSON"),
  Flag.withDefault(false)
);
const governanceFilter = (
  governed: boolean,
  ungoverned: boolean
): Effect.Effect<"governed" | "ungoverned" | undefined, ValidationError> =>
  governed === ungoverned
    ? governed
      ? Effect.fail(
          new ValidationError({
            field: "governance",
            message: "Use only one of --governed or --ungoverned.",
          })
        )
      : Effect.void.pipe(Effect.as(undefined))
    : Effect.succeed(governed ? "governed" : "ungoverned");
const inspectionTag = (value: TagGovernanceInspection) => value.tag;
const inspectionTerm = (value: TagGovernanceInspection) => value.term;

interface TagJsonError {
  readonly tag: string;
  readonly message: string;
  readonly field?: string;
  readonly name?: string;
}

const errorMessage = (error: AeroGraphError): string => {
  if (error.message) return error.message;
  if (error._tag === "TagNotFoundError") return `Tag not found: #${error.tagId}`;
  if (error._tag === "TermNotFoundError") return `Term not found: ${error.name}`;
  if (error._tag === "EntityNotFoundError") return `Entity not found: ${error.entityId}`;
  return error._tag;
};

const errorData = (error: AeroGraphError): TagJsonError => {
  const data: TagJsonError = { tag: error._tag, message: errorMessage(error) };
  if ("field" in error && error.field !== undefined) return { ...data, field: error.field };
  if ("name" in error && error.name !== undefined) return { ...data, name: error.name };
  return data;
};

const outputError = <A, E extends AeroGraphError, R>(
  effect: Effect.Effect<A, E, R>,
  command: string,
  asJson: boolean
) =>
  asJson
    ? effect.pipe(
        Effect.catch((error) =>
          Console.log(JSON.stringify({ ok: false, command, error: errorData(error) })).pipe(
            Effect.andThen(
              Effect.sync(() => {
                process.exitCode = 1;
              })
            )
          )
        )
      )
    : effect.pipe(Effect.tapError((error) => Console.error(`Error: ${errorData(error).message}`)));

const tagListCommand = Command.make(
  "list",
  {
    search: Flag.string("search").pipe(
      Flag.withAlias("s"),
      Flag.withDescription("Search tags by name"),
      Flag.optional
    ),
    tree: Flag.boolean("tree").pipe(
      Flag.withDescription("Show as hierarchy tree"),
      Flag.withDefault(false)
    ),
    governed: Flag.boolean("governed").pipe(Flag.withDefault(false)),
    ungoverned: Flag.boolean("ungoverned").pipe(Flag.withDefault(false)),
    json: jsonFlag,
  },
  ({ search, tree, governed, ungoverned, json: asJson }) =>
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Existing tree rendering logic is localized to the list command.
    Effect.gen(function* () {
      const searchValue = Option.getOrUndefined(search);
      const filter = yield* governanceFilter(governed, ungoverned);
      const tags = yield* withCliServices(
        Effect.gen(function* () {
          const governance = yield* TermGovernanceServiceTag;
          const inspections = yield* governance.listTags(filter);
          if (!searchValue) return inspections;
          const query = searchValue.toLocaleLowerCase();
          return inspections.filter((inspection) => {
            const tag = inspectionTag(inspection);
            return [tag.id, tag.name, ...(tag.aliases ?? [])].some((value) =>
              value.toLocaleLowerCase().includes(query)
            );
          });
        })
      );

      if (asJson) {
        yield* Console.log(JSON.stringify({ ok: true, command: "tag list", tags }));
        return;
      }
      yield* Console.log("");
      yield* Console.log(`Tags (${tags.length})`);
      yield* Console.log("=".repeat(40));
      yield* Console.log("");

      if (tags.length === 0) {
        yield* Console.log("No tags found.");
        yield* Console.log("");
        yield* Console.log("Create one with: aerograph tag create <name>");
      } else {
        const render = (inspection: TagGovernanceInspection, depth: number) => {
          const tag = inspectionTag(inspection);
          const desc = tag.description ? ` - ${tag.description}` : "";
          const governedTerm = inspectionTerm(inspection);
          const governanceText = governedTerm
            ? ` [governed: ${governedTerm.canonicalName} (${governedTerm.term.kind})]`
            : " [ungoverned]";
          return `${"  ".repeat(depth)}#${tag.id}${desc}${governanceText}`;
        };
        if (!tree) {
          for (const inspection of tags) yield* Console.log(render(inspection, 0));
        } else {
          const byParent = new Map<string | undefined, TagGovernanceInspection[]>();
          for (const inspection of tags) {
            const parent = inspectionTag(inspection).parentId;
            const siblings = byParent.get(parent) ?? [];
            siblings.push(inspection);
            byParent.set(parent, siblings);
          }
          const selectedIds = new Set<string>(
            tags.map((inspection) => inspectionTag(inspection).id)
          );
          const visit = (inspection: TagGovernanceInspection, depth: number): Effect.Effect<void> =>
            Effect.gen(function* () {
              const tag = inspectionTag(inspection);
              yield* Console.log(render(inspection, depth));
              for (const child of byParent.get(tag.id) ?? []) yield* visit(child, depth + 1);
            });
          for (const inspection of tags) {
            const parentId = inspectionTag(inspection).parentId;
            if (!parentId || !selectedIds.has(parentId)) yield* visit(inspection, 0);
          }
        }
      }

      yield* Console.log("");
    }).pipe((effect) => outputError(effect, "tag list", asJson))
);

// ============================================================================
// Tag Apply Command
// ============================================================================

const tagApplyCommand = Command.make(
  "apply",
  {
    entityId: Argument.string("entity-id"),
    tagId: Argument.string("tag"),
  },
  ({ entityId, tagId }) =>
    Effect.gen(function* () {
      yield* withCliServices(
        Effect.gen(function* () {
          const tagService = yield* TagServiceTag;

          // Ensure tag exists (creates hierarchy if needed)
          const tag = yield* tagService.ensureHierarchy(tagId);

          // Apply to entity
          yield* tagService.applyToEntity(tag.id, entityId);
        })
      );

      yield* Console.log("");
      yield* Console.log(`Tag #${tagId} applied to entity ${entityId}`);
      yield* Console.log("");
    }).pipe(
      Effect.catchTags({
        WorkspaceNotFoundError: (e) =>
          Console.error(`Error: ${e.message}`).pipe(Effect.andThen(Effect.fail(e))),
        ConfigError: (e) =>
          Console.error(`Error: ${e.message}`).pipe(Effect.andThen(Effect.fail(e))),
        RepositoryError: (e) =>
          Console.error(`Database error: ${e.message}`).pipe(Effect.andThen(Effect.fail(e))),
        EntityNotFoundError: (e) =>
          Console.error(`Error: Entity not found: ${e.entityId}`).pipe(
            Effect.andThen(Effect.fail(e))
          ),
        TagNotFoundError: (e) =>
          Console.error(`Error: Tag not found: ${e.tagId}`).pipe(Effect.andThen(Effect.fail(e))),
        ValidationError: (e) =>
          Console.error(`Validation error: ${e.message}`).pipe(Effect.andThen(Effect.fail(e))),
      })
    )
);

// ============================================================================
// Tag Remove Command
// ============================================================================

const tagRemoveCommand = Command.make(
  "remove",
  {
    entityId: Argument.string("entity-id"),
    tagId: Argument.string("tag"),
  },
  ({ entityId, tagId }) =>
    Effect.gen(function* () {
      yield* withCliServices(
        Effect.gen(function* () {
          const tagService = yield* TagServiceTag;
          yield* tagService.removeFromEntity(TagIdSchema.make(tagId), entityId);
        })
      );

      yield* Console.log("");
      yield* Console.log(`Tag #${tagId} removed from entity ${entityId}`);
      yield* Console.log("");
    }).pipe(
      Effect.catchTags({
        WorkspaceNotFoundError: (e) =>
          Console.error(`Error: ${e.message}`).pipe(Effect.andThen(Effect.fail(e))),
        ConfigError: (e) =>
          Console.error(`Error: ${e.message}`).pipe(Effect.andThen(Effect.fail(e))),
        RepositoryError: (e) =>
          Console.error(`Database error: ${e.message}`).pipe(Effect.andThen(Effect.fail(e))),
        EntityNotFoundError: (e) =>
          Console.error(`Error: Entity not found: ${e.entityId}`).pipe(
            Effect.andThen(Effect.fail(e))
          ),
        TagNotFoundError: (e) =>
          Console.error(`Error: Tag not found: ${e.tagId}`).pipe(Effect.andThen(Effect.fail(e))),
      })
    )
);

// ============================================================================
// Tag Governance Commands
// ============================================================================

const tagGovernCommand = Command.make(
  "govern",
  {
    tagId: Argument.string("tag-id"),
    term: Flag.string("term"),
    kind: Flag.string("kind").pipe(Flag.optional),
    replace: Flag.string("replace").pipe(Flag.optional),
    json: jsonFlag,
  },
  (args) =>
    Effect.gen(function* () {
      const kindValue = Option.getOrUndefined(args.kind);
      if (kindValue !== undefined && !Schema.is(TermKindSchema)(kindValue)) {
        return yield* new ValidationError({
          field: "kind",
          message: `Invalid term kind '${kindValue}'. Expected one of: ${TERM_KINDS.join(", ")}`,
        });
      }
      const result = yield* withCliServices(
        Effect.gen(function* () {
          const governance = yield* TermGovernanceServiceTag;
          // Stable IDs always win; kind qualifies names only.
          const termInspection =
            kindValue === undefined
              ? yield* governance.show(args.term)
              : yield* governance
                  .show({ id: TermIdSchema.make(args.term) })
                  .pipe(
                    Effect.catchTag("TermNotFoundError", () =>
                      governance.show({ name: args.term, kind: kindValue })
                    )
                  );
          const replacement = Option.getOrUndefined(args.replace);
          const expected =
            replacement === undefined
              ? undefined
              : yield* (
                  kindValue === undefined
                    ? governance.show(replacement)
                    : governance
                        .show({ id: TermIdSchema.make(replacement) })
                        .pipe(
                          Effect.catchTag("TermNotFoundError", () =>
                            governance.show({ name: replacement, kind: kindValue })
                          )
                        )
                ).pipe(Effect.map((inspection) => ({ id: inspection.term.id })));
          const input: GovernTagInput = {
            tagId: TagIdSchema.make(args.tagId),
            term: { id: termInspection.term.id },
          };
          return yield* governance.governTag(expected ? { ...input, replace: expected } : input);
        })
      );
      if (args.json)
        yield* Console.log(JSON.stringify({ ok: true, command: "tag govern", tag: result }));
      else {
        const term = inspectionTerm(result);
        yield* Console.log(`Tag ID: #${result.tag.id}`);
        yield* Console.log(`Tag name: ${result.tag.name}`);
        yield* Console.log("Status: governed");
        if (term)
          yield* Console.log(
            `Term: ${term.term.id} | ${term.canonicalName} | kind: ${term.term.kind} | status: ${term.term.status}`
          );
      }
    }).pipe((effect) => outputError(effect, "tag govern", args.json))
);

// ============================================================================
// Tag Show Command
// ============================================================================

const tagShowCommand = Command.make(
  "show",
  {
    id: Argument.string("tag-id"),
    json: jsonFlag,
  },
  ({ id, json: asJson }) =>
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: show renders optional hierarchy and governance metadata.
    Effect.gen(function* () {
      const { tag, ancestors, children, inspection } = yield* withCliServices(
        Effect.gen(function* () {
          const tagService = yield* TagServiceTag;
          const governance = yield* TermGovernanceServiceTag;

          const tag = yield* tagService.getById(TagIdSchema.make(id));
          const inspection = yield* governance.inspectTag(TagIdSchema.make(id));
          const ancestors = yield* tagService.getAncestors(tag.id);
          const children = yield* tagService
            .getChildren(tag.id)
            .pipe(Effect.orElseSucceed(() => []));

          return { tag, ancestors, children, inspection };
        })
      );

      if (asJson) {
        yield* Console.log(JSON.stringify({ ok: true, command: "tag show", tag: inspection }));
        return;
      }
      yield* Console.log("");
      yield* Console.log(`Tag: #${tag.id}`);
      yield* Console.log("=".repeat(40));
      yield* Console.log("");
      yield* Console.log(`Name:    ${tag.name}`);
      if (tag.description) {
        yield* Console.log(`Desc:    ${tag.description}`);
      }
      yield* Console.log(`Created: ${tag.createdAt.toISOString()}`);
      const governedTerm = inspectionTerm(inspection);
      yield* Console.log(`Governance: ${governedTerm ? "governed" : "ungoverned"}`);
      if (governedTerm) {
        yield* Console.log(
          `Term: ${governedTerm.term.id} (${governedTerm.canonicalName}; ${governedTerm.term.kind}; ${governedTerm.term.status})`
        );
      }

      if (ancestors.length > 0) {
        yield* Console.log("");
        yield* Console.log("Ancestors:");
        for (const ancestor of [...ancestors].reverse()) {
          yield* Console.log(`  #${ancestor.id}`);
        }
      }

      if (children.length > 0) {
        yield* Console.log("");
        yield* Console.log("Children:");
        for (const child of children) {
          yield* Console.log(`  #${child.id}`);
        }
      }

      yield* Console.log("");
    }).pipe((effect) => outputError(effect, "tag show", asJson))
);

// ============================================================================
// Tag Delete Command
// ============================================================================

const tagDeleteCommand = Command.make(
  "delete",
  {
    id: Argument.string("tag-id"),
    force: Flag.boolean("force").pipe(
      Flag.withAlias("f"),
      Flag.withDescription("Skip confirmation"),
      Flag.withDefault(false)
    ),
  },
  ({ id, force }) =>
    Effect.gen(function* () {
      yield* withCliServices(
        Effect.gen(function* () {
          const tagService = yield* TagServiceTag;

          const tag = yield* tagService.getById(TagIdSchema.make(id));

          if (!force) {
            yield* Console.log(`Deleting tag: #${tag.id}`);
            yield* Console.log("(Use --force to skip this confirmation in scripts)");
          }

          yield* tagService.delete(tag.id);
        })
      );

      yield* Console.log("");
      yield* Console.log(`Tag #${id} deleted.`);
      yield* Console.log("");
    }).pipe(
      Effect.catchTags({
        WorkspaceNotFoundError: (e) =>
          Console.error(`Error: ${e.message}`).pipe(Effect.andThen(Effect.fail(e))),
        ConfigError: (e) =>
          Console.error(`Error: ${e.message}`).pipe(Effect.andThen(Effect.fail(e))),
        RepositoryError: (e) =>
          Console.error(`Database error: ${e.message}`).pipe(Effect.andThen(Effect.fail(e))),
        TagNotFoundError: (e) =>
          Console.error(`Error: Tag not found: ${e.tagId}`).pipe(Effect.andThen(Effect.fail(e))),
      })
    )
);

// ============================================================================
// Tag Parent Command (with subcommands)
// ============================================================================

export const tagCommand = Command.make("tag").pipe(
  Command.withDescription("Manage tags and entity tagging"),
  Command.withSubcommands([
    tagCreateCommand,
    tagListCommand,
    tagGovernCommand,
    tagApplyCommand,
    tagRemoveCommand,
    tagShowCommand,
    tagDeleteCommand,
  ])
);
