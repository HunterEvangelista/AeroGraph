import { describe, expect, test } from "bun:test";
import { type TagGovernanceInspection, TagIdSchema } from "@aerograph/core";
import { formatTagList } from "./tag-output";

const inspection = (
  id: string,
  options: { readonly description?: string; readonly parentId?: string } = {}
): TagGovernanceInspection => {
  const tag = Object.assign(
    {
      id: TagIdSchema.make(id),
      name: id,
      createdAt: new Date("2026-01-02T03:04:05.000Z"),
    },
    options
  );
  return { tag };
};

describe("formatTagList", () => {
  test("formats complete empty output", () => {
    expect(formatTagList({ tags: [], tree: false })).toBe(`
Tags (0)
========================================

No tags found.

Create one with: aerograph tag create <name>
`);
  });

  test("formats flat output", () => {
    const tags = [inspection("architecture", { description: "Architecture context" })];

    expect(formatTagList({ tags, tree: false })).toBe(`
Tags (1)
========================================

#architecture - Architecture context [ungoverned]
`);
  });

  test("formats hierarchy without effects", () => {
    const tags = [
      inspection("architecture"),
      inspection("architecture/decision", { parentId: "architecture" }),
    ];

    expect(formatTagList({ tags, tree: true })).toBe(`
Tags (2)
========================================

#architecture [ungoverned]
  #architecture/decision [ungoverned]
`);
  });
});
