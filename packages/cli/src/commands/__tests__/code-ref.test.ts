import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type CliWorkspace, createCliWorkspace } from "../../__tests__/helpers/cli";

const extractId = (stdout: string): string => {
  const match = stdout.match(/ID:\s+([^\n]+)/);
  if (!match?.[1]) {
    throw new Error(`Could not extract id from stdout:\n${stdout}`);
  }
  return match[1].trim();
};

describe("code-ref command", () => {
  let workspace: CliWorkspace;

  beforeEach(() => {
    workspace = createCliWorkspace();
  });

  afterEach(() => {
    workspace.cleanup();
  });

  it("adds and lists code refs by file", () => {
    const created = workspace.run(
      "code-ref",
      "add",
      "--title",
      "Auth middleware",
      "--file",
      "src/middleware/auth.ts",
      "--start-line",
      "12",
      "--end-line",
      "45",
      "--symbol",
      "authMiddleware",
      "--tag",
      "auth,middleware"
    );

    expect(created.status).toBe(0);
    expect(created.stdout).toContain("Code ref created successfully!");
    expect(created.stdout).toContain("Title:   Auth middleware");
    expect(created.stdout).toContain("File:    src/middleware/auth.ts");
    expect(created.stdout).toContain("Lines:   12-45");
    expect(created.stdout).toContain("Symbol:  authMiddleware");

    const listed = workspace.run("code-ref", "list", "--file", "src/middleware/auth.ts");

    expect(listed.status).toBe(0);
    expect(listed.stdout).toContain("Code refs (1)");
    expect(listed.stdout).toContain(
      "src/middleware/auth.ts:12-45 [authMiddleware]  Auth middleware"
    );
  });

  it("shows code ref details with tags and linked entities", () => {
    const shown = workspace.run("code-ref", "show", "code-auth-middleware");

    expect(shown.status).toBe(0);
    expect(shown.stdout).toContain("# Auth Middleware");
    expect(shown.stdout).toContain("ID:      code-auth-middleware");
    expect(shown.stdout).toContain("File:    src/auth.ts");
    expect(shown.stdout).toContain("Lines:   10-20");
    expect(shown.stdout).toContain("Symbol:  authMiddleware");
    expect(shown.stdout).toContain("Tags:    #auth, #middleware");
    expect(shown.stdout).toContain("Links");
    expect(shown.stdout).toContain("<--references-- doc-auth-overview  [doc] Auth Overview");
    expect(shown.stdout).toContain(
      "--related_to--> diagram-auth-flow  [diagram] Auth Flow Diagram"
    );
  });

  it("filters code refs by tag and search", () => {
    const byTag = workspace.run("code-ref", "list", "--tag", "middleware");
    const bySearch = workspace.run("code-ref", "list", "--search", "Middleware checks");

    expect(byTag.status).toBe(0);
    expect(byTag.stdout).toContain("Code refs (1)");
    expect(byTag.stdout).toContain(
      "code-auth-middleware  src/auth.ts:10-20 [authMiddleware]  Auth Middleware"
    );
    expect(bySearch.status).toBe(0);
    expect(bySearch.stdout).toContain("Code refs (1)");
    expect(bySearch.stdout).toContain("Auth Middleware");
  });

  it("deletes code refs using current doc-delete-compatible semantics", () => {
    const created = workspace.run(
      "code-ref",
      "add",
      "--title",
      "Temporary code ref",
      "--file",
      "src/temp.ts"
    );
    const id = extractId(created.stdout);

    const deleted = workspace.run("code-ref", "delete", id);

    expect(deleted.status).toBe(0);
    expect(deleted.stdout).toContain("Deleting code ref: Temporary code ref");
    expect(deleted.stdout).toContain(`Code ref ${id} deleted.`);

    const shown = workspace.run("code-ref", "show", id);

    expect(shown.status).not.toBe(0);
    expect(shown.stderr).toContain(`Entity not found: ${id}`);
  });

  it("rejects invalid line ranges and non-code-ref entities", () => {
    const invalidRange = workspace.run(
      "code-ref",
      "add",
      "--title",
      "Invalid range",
      "--file",
      "src/invalid.ts",
      "--start-line",
      "45",
      "--end-line",
      "12"
    );
    const nonCodeRef = workspace.run("code-ref", "show", "doc-auth-overview");

    expect(invalidRange.status).not.toBe(0);
    expect(invalidRange.stderr).toContain(
      "--end-line must be greater than or equal to --start-line"
    );
    expect(nonCodeRef.status).not.toBe(0);
    expect(nonCodeRef.stderr).toContain("Entity is not a code ref: doc-auth-overview");
  });
});
