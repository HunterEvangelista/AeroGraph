import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type CliWorkspace, createCliWorkspace } from "../../__tests__/helpers/cli.js";

const extractCreatedId = (stdout: string): string => {
  const match = stdout.match(/ID:\s+([^\s]+)/);
  if (!match?.[1]) throw new Error(`Could not extract ID from stdout:\n${stdout}`);
  return match[1];
};

describe("history command", () => {
  let workspace: CliWorkspace;

  beforeEach(() => {
    workspace = createCliWorkspace();
  });

  afterEach(() => {
    workspace.cleanup();
  });

  it("lists create and update snapshots with literal versions", () => {
    const create = workspace.run(
      "doc",
      "create",
      "--content",
      "Original auth notes.",
      "History Test Doc"
    );
    expect(create.status).toBe(0);
    const id = extractCreatedId(create.stdout);

    const edit = workspace.run("doc", "edit", "--content", "Updated auth notes.", id);
    expect(edit.status).toBe(0);

    const list = workspace.run("history", id);
    expect(list.status).toBe(0);
    expect(list.stdout).toContain(`History for ${id} (2)`);
    expect(list.stdout).toContain("v1  create");
    expect(list.stdout).toContain("Original auth notes.");
    expect(list.stdout).toContain("v2  update");
    expect(list.stdout).toContain("Updated auth notes.");

    const versionOne = workspace.run("history", id, "--version", "1");
    expect(versionOne.status).toBe(0);
    expect(versionOne.stdout).toContain("Version 1: [doc] History Test Doc");
    expect(versionOne.stdout).toContain("Original auth notes.");
    expect(versionOne.stdout).not.toContain("Updated auth notes.");
  });
});
