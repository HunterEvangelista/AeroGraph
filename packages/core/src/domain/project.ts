import { Schema } from "effect";
import { BrandedId } from "./entity";

/** Project identifiers are non-empty opaque values; names are display labels and need not be unique. */
export const ProjectIdSchema = Schema.String.check(Schema.isNonEmpty()).pipe(
  Schema.brand("ProjectId")
);
export type ProjectId = typeof ProjectIdSchema.Type;

export const ProjectSchema = Schema.Struct({
  id: ProjectIdSchema,
  name: Schema.String.check(Schema.isNonEmpty()),
  createdAt: Schema.DateFromString,
});
export type Project = typeof ProjectSchema.Type;

export const CreateProjectInputSchema = Schema.Struct({
  id: Schema.String.check(Schema.isNonEmpty()),
  name: Schema.String.check(Schema.isNonEmpty()),
});
export type CreateProjectInput = typeof CreateProjectInputSchema.Type;

/** A membership records an entity's inclusion in a project and has no effect on entity ownership. */
export const EntityProjectMembershipSchema = Schema.Struct({
  projectId: ProjectIdSchema,
  entityId: BrandedId,
  createdAt: Schema.DateFromString,
});
export type EntityProjectMembership = typeof EntityProjectMembershipSchema.Type;
