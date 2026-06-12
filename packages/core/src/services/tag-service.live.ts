/**
 * Tag Service live implementation
 */
import { Effect, Layer, Result } from "effect";
import { type Tag, type TagId, TagIdSchema } from "../domain/tag.js";
import { TagNotFoundError, ValidationError } from "../errors.js";
import type { TagRepository } from "../repository/tag-repository.js";
import { TagRepositoryTag } from "../repository/tag-repository.js";
import { type TagService, TagServiceTag } from "./tag-service.js";

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
      return yield* repo.create(input);
    }

    return yield* existing.failure;
  });

export const TagServiceLive = Layer.effect(
  TagServiceTag,
  Effect.gen(function* () {
    const repo = yield* TagRepositoryTag;

    const ensureHierarchy = (tagPath: string) =>
      Effect.gen(function* () {
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
      getAll: () => repo.getAll(),
      getChildren: (parentId) => repo.getChildren(parentId),
      getAncestors: (id) => repo.getAncestors(id),
      update: (id, updates) => repo.update(id, updates),
      delete: (id) => repo.delete(id),
      applyToEntity: (tagId, entityId) => repo.applyToEntity(tagId, entityId),
      removeFromEntity: (tagId, entityId) => repo.removeFromEntity(tagId, entityId),
      getTagsForEntity: (entityId) => repo.getTagsForEntity(entityId),
      search: (query) => repo.search(query),
      count: () => repo.count(),
      ensureHierarchy,
    } satisfies TagService;
  })
);
