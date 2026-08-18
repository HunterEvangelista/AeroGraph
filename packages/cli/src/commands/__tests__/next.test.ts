import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type CliWorkspace, createCliWorkspace } from "../../__tests__/helpers/cli";

describe("next command", () => {
  let workspace: CliWorkspace;

  beforeEach(() => {
    workspace = createCliWorkspace();
  });

  afterEach(() => {
    workspace.cleanup();
  });

  it("lists suggestions after a query", () => {
    workspace.run("query", "--related-to", "doc-auth-ov");

    const result = workspace.run("next", "list");

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Saved next commands:");
    expect(result.stdout).toContain("next doc-auth-overview --related");
    expect(result.stdout).toContain("next doc-auth-overview --traverse");
    expect(result.stdout).toContain("next code-auth-middleware --related");
    expect(result.stdout).toContain("next story-auth-hardening --traverse");
  });

  it("reports empty when no query has been run", () => {
    const result = workspace.run("next", "list");

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("No saved next commands.");
  });

  it("clears all suggestions", () => {
    workspace.run("query", "--related-to", "doc-auth-ov");

    const result = workspace.run("next", "clear");

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Cleared");

    const listResult = workspace.run("next", "list");
    expect(listResult.stdout).toContain("No saved next commands.");
  });

  it("runs default related-to follow-up without a flag", () => {
    workspace.run("query", "--related-to", "doc-auth-ov");

    const result = workspace.run("next", "doc-auth-ov");

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Defaulting to --related");
    expect(result.stdout).toContain("Related to Auth Overview");
  });

  it("runs traverse follow-up with --traverse flag", () => {
    workspace.run("query", "--related-to", "doc-auth-ov");

    const result = workspace.run("next", "doc-auth-ov", "--traverse");

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Traversal from doc-auth-overview to depth 2");
  });

  it("errors on entity with no saved suggestion", () => {
    const result = workspace.run("next", "doc-auth-ov");

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("no saved next command");
  });

  it("rejects --related and --traverse together", () => {
    workspace.run("query", "--related-to", "doc-auth-ov");

    const result = workspace.run("next", "doc-auth-ov", "--related", "--traverse");

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Cannot use --related and --traverse together");
  });
});
