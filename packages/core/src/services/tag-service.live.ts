/**
 * Tag Service live implementation
 */
import { Effect, Layer, Result } from "effect";
import { type Tag, type TagId, TagIdSchema } from "../domain/tag";
import { TagNotFoundError, ValidationError } from "../errors";
import type { TagRepository } from "../repository/tag-repository";
import { TagRepositoryTag } from "../repository/tag-repository";
import { TermRepositoryTag } from "../repository/term-repository";
import { type TagService, TagServiceTag } from "./tag-service";
import { resolveTermName } from "./term-resolution";

const parseTagPath = (tagPath: string): Effect.Effect<ReadonlyArray<string>, ValidationError> => {
  const parts = tagPath
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);

  return parts.length > 0
    ? Effect.succeed(parts)
    : Effect.fail(new ValidationError({ message: `Invalid tag path: ${tagPath}` }));
};

const tagIdFromParts = (parts: ReadonlyArray<string>, endIndex: number) =>
  TagIdSchema.make(parts.slice(0, endIndex + 1).join("/"));

const ensureTag = (
  repo: TagRepository,
  input: { id: TagId; name: string; parentId: TagId | undefined }
) =>
  Effect.gen(function* () {
    const existing = yield* Effect.result(repo.getById(input.id));

    if (Result.isSuccess(existing)) {
      return existing.success;
    }

    if (existing.failure instanceof TagNotFoundError) {
      const created = yield* Effect.result(repo.create(input));
      if (Result.isSuccess(created)) {
        return created.success;
      }

      const raced = yield* Effect.result(repo.getById(input.id));
      if (Result.isSuccess(raced)) {
        return raced.success;
      }

      return yield* created.failure;
    }

    return yield* existing.failure;
  });

const findLiteralTag = (repo: TagRepository, tagPath: string) =>
  Effect.gen(function* () {
    const literal = yield* Effect.result(repo.getById(TagIdSchema.make(tagPath)));
    if (Result.isSuccess(literal)) return literal.success;
    if (literal.failure instanceof TagNotFoundError) return undefined;
    return yield* literal.failure;
  });

const selectGovernedTag = (repo: TagRepository, tagPath: string, termId: string) =>
  Effect.gen(function* () {
    const governedTags = (yield* repo.getAll).filter((tag) => tag.termId === termId);
    if (governedTags.length !== 1) {
      return yield* new ValidationError({
        field: "tagPath",
        message:
          governedTags.length === 0
            ? `Governed term '${tagPath}' has no attachment tag.`
            : `Governed term '${tagPath}' has multiple attachment tags; use a literal tag ID.`,
      });
    }

    return governedTags[0];
  });

export const TagServiceLive = Layer.effect(
  TagServiceTag,
  Effect.gen(function* () {
    const repo = yield* TagRepositoryTag;
    const termRepo = yield* TermRepositoryTag;

    const resolveGovernedTag = (tagPath: string) =>
      Effect.gen(function* () {
        const literal = yield* findLiteralTag(repo, tagPath);
        if (literal) return literal;
        const resolution = yield* resolveTermName(termRepo, tagPath).pipe(
          Effect.catchTags({
            TermNotFoundError: () => Effect.void,
            AmbiguousTermNameError: (error) =>
              Effect.fail(
                new ValidationError({
                  field: "tagPath",
                  message: `${error.message ?? `Term name '${tagPath}' is ambiguous`}; use a literal tag ID or specify a kind. Candidates: ${error.candidates.join(", ")}.`,
                  cause: error,
                })
              ),
            TermMigrationError: (error) =>
              Effect.fail(
                new ValidationError({
                  field: "tagPath",
                  message: `Cannot attach tag for governed term '${tagPath}': ${error.message}`,
                  cause: error,
                })
              ),
          })
        );
        if (!resolution) return undefined;
        return yield* selectGovernedTag(repo, tagPath, resolution.term.id);
      });

    const ensureHierarchy = (tagPath: string) =>
      Effect.gen(function* () {
        const governedTag = yield* resolveGovernedTag(tagPath);
        if (governedTag) return governedTag;

        const parts = yield* parseTagPath(tagPath);
        let parentId: TagId | undefined;
        let currentTag: Tag | undefined;

        for (let i = 0; i < parts.length; i++) {
          const id = tagIdFromParts(parts, i);
          const name = parts[i] ?? id;
          currentTag = yield* ensureTag(repo, { id, name, parentId });
          parentId = currentTag.id;
        }

        if (!currentTag) {
          return yield* new ValidationError({
            message: `Invalid tag path: ${tagPath}`,
          });
        }

        return currentTag;
      });

    return {
      create: (input) => repo.create(input),
      getById: (id) => repo.getById(id),
      getAll: repo.getAll,
      getChildren: (parentId) => repo.getChildren(parentId),
      getAncestors: (id) => repo.getAncestors(id),
      update: (id, updates) => repo.update(id, updates),
      delete: (id) => repo.delete(id),
      applyToEntity: (tagId, entityId) => repo.applyToEntity(tagId, entityId),
      removeFromEntity: (tagId, entityId) => repo.removeFromEntity(tagId, entityId),
      getTagsForEntity: (entityId) => repo.getTagsForEntity(entityId),
      search: (query) => repo.search(query),
      count: repo.count,
      ensureHierarchy,
    } satisfies TagService;
  })
);
