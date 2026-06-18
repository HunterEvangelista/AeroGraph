import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type CliWorkspace, createCliWorkspace } from "../../__tests__/helpers/cli.js";

describe("doc command concurrency", () => {
  let workspace: CliWorkspace;

  beforeEach(() => {
    workspace = createCliWorkspace();
  });

  afterEach(() => {
    workspace.cleanup();
  });

  it("creates tagged docs from parallel CLI processes", async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        workspace.runAsync(
          "doc",
          "create",
          `Concurrent Doc ${index}`,
          "--content",
          `created concurrently ${index}`,
          "--tags",
          "concurrency,sqlite"
        )
      )
    );

    for (const result of results) {
      expect(result.status, `${result.stderr}\n${result.stdout}`).toBe(0);
      expect(result.stderr).not.toContain("database is locked");
      expect(result.stdout).toContain("Document created successfully!");
    }

    const listed = workspace.run("doc", "list", "--tag", "concurrency");

    expect(listed.status).toBe(0);
    expect(listed.stdout).toContain("Documents (8)");
    for (let index = 0; index < 8; index += 1) {
      expect(listed.stdout).toContain(`Concurrent Doc ${index}`);
    }
  });
});
