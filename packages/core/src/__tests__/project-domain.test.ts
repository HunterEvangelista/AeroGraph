import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import {
  CreateProjectInputSchema,
  EntityProjectMembershipSchema,
  ProjectIdSchema,
  ProjectSchema,
} from "../domain/project";
import { FIXED_TIMESTAMP_ISO } from "./helpers/index";

const decode = <S extends Schema.ConstraintDecoder<Schema.Schema.Type<S>>>(
  schema: S,
  value: S["Encoded"]
): S["Type"] => Schema.decodeSync(schema)(value);

describe("project domain schemas", () => {
  it("decodes projects and memberships with branded identifiers and dates", () => {
    const project = decode(ProjectSchema, {
      id: "project-1",
      name: "Platform",
      createdAt: FIXED_TIMESTAMP_ISO,
    });
    const membership = decode(EntityProjectMembershipSchema, {
      projectId: "project-1",
      entityId: "entity-1",
      createdAt: FIXED_TIMESTAMP_ISO,
    });

    expect(project.id).toBe("project-1");
    expect(project.createdAt).toBeInstanceOf(Date);
    expect(membership.projectId).toBe("project-1");
    expect(membership.entityId).toBe("entity-1");
    expect(membership.createdAt).toBeInstanceOf(Date);
  });

  it("accepts non-empty create inputs and rejects empty identifiers or names", () => {
    expect(decode(CreateProjectInputSchema, { id: "p1", name: "Project" })).toEqual({
      id: "p1",
      name: "Project",
    });
    expect(() => decode(ProjectIdSchema, "")).toThrow();
    expect(() => decode(CreateProjectInputSchema, { id: "", name: "Project" })).toThrow();
    expect(() => decode(CreateProjectInputSchema, { id: "p1", name: "" })).toThrow();
    expect(() =>
      decode(ProjectSchema, { id: "p1", name: "Project", createdAt: "not-a-date" })
    ).toThrow();
    expect(() =>
      decode(EntityProjectMembershipSchema, {
        projectId: "p1",
        entityId: "e1",
        createdAt: "not-a-date",
      })
    ).toThrow();
  });
});
