import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type CliWorkspace, createCliWorkspace } from "../../__tests__/helpers/cli.js";

const governTagFixture = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../__tests__/helpers/govern-tag-fixture.ts"
);

const governTags = (workspace: CliWorkspace, ...args: ReadonlyArray<string>) => {
  const result = spawnSync("bun", ["run", governTagFixture, workspace.rootPath, ...args], {
    encoding: "utf8",
    shell: false,
  });
  expect(result.status, `${result.stderr}\n${result.stdout}`).toBe(0);
};

describe("context command", () => {
  let workspace: CliWorkspace;

  beforeEach(() => {
    workspace = createCliWorkspace();
  });

  afterEach(() => {
    workspace.cleanup();
  });

  it("exports an entity graph neighborhood as markdown", () => {
    const result = workspace.run("context", "doc-auth-ov", "--depth", "1");

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("# Kioku Context: Auth Overview");
    expect(result.stdout).toContain("## Code References");
    expect(result.stdout).toContain("### Auth Middleware");
    expect(result.stdout).toContain("- Location: src/auth.ts:10-20");
    expect(result.stdout).toContain("## Related Docs");
    expect(result.stdout).toContain("### Auth Overview");
    expect(result.stdout).toContain("## Relationships");
    expect(result.stdout).toContain("doc-auth-overview --references--> code-auth-middleware");
    expect(result.stdout).not.toContain("Auth Flow Diagram");
  });

  it("exports tag intersections to a file", () => {
    const outputPath = join(workspace.rootPath, "context.md");
    const result = workspace.run("context", "--tags", "auth,middleware", "--output", outputPath);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`Context written to ${outputPath}`);

    const markdown = readFileSync(outputPath, "utf8");
    expect(markdown).toContain("# Kioku Context: Tags #auth, #middleware");
    expect(markdown).toContain("### Auth Overview");
    expect(markdown).toContain("### Auth Middleware");
    expect(markdown).not.toContain("Auth Only Doc");
  });

  it("stubs task-shaped context prompts", () => {
    const result = workspace.run("context", "What should I know before changing auth?");

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Task-shaped context export is not available yet.");
    expect(result.stdout).toContain("kioku context <entityId> --depth 2");
  });

  it("does not duplicate multi-role entities across semantic sections", () => {
    const create = workspace.run(
      "doc",
      "create",
      "--tags",
      "auth,decision,constraint",
      "--content",
      "Multi-role project memory.",
      "Multi Role Memory"
    );
    expect(create.status).toBe(0);

    const result = workspace.run("context", "--tags", "auth");

    expect(result.status).toBe(0);
    expect(result.stdout.match(/### Multi Role Memory/g)).toHaveLength(1);
    expect(result.stdout).toContain("## Relevant Decisions");
  });

  it("renders canonical terms without changing semantic section classification", () => {
    const create = workspace.run(
      "doc",
      "create",
      "--tags",
      "auth,decision",
      "--content",
      "Keep this decision in its semantic section.",
      "Governed Decision"
    );
    expect(create.status, `${create.stderr}\n${create.stdout}`).toBe(0);
    governTags(workspace, "Architecture Choice", "concept", "term-concept-decision", "decision");

    const result = workspace.run("context", "--tags", "auth", "--canonical-terms");

    expect(result.status, `${result.stderr}\n${result.stdout}`).toBe(0);
    expect(result.stdout).toContain("## Relevant Decisions");
    expect(result.stdout).toContain("### Governed Decision");
    expect(result.stdout).toContain("- Tags: #auth, #Architecture Choice");
    expect(result.stdout).not.toContain("- Tags: #auth, #decision");
  });
});
