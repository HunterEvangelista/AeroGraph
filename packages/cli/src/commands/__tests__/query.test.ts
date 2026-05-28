import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type CliWorkspace, createCliWorkspace } from "../../__tests__/helpers/cli.js";

describe("query command", () => {
  let workspace: CliWorkspace;

  beforeEach(() => {
    workspace = createCliWorkspace();
  });

  afterEach(() => {
    workspace.cleanup();
  });

  it("queries exact tag intersections", () => {
    const result = workspace.run("query", "--tags", "auth,middleware");

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Tag intersection: #auth, #middleware (2)");
    expect(result.stdout).toContain("doc-auth-overview  [doc] Auth Overview");
    expect(result.stdout).toContain("code-auth-middleware  [code_ref] Auth Middleware");
    expect(result.stdout).not.toContain("doc-auth-only  [doc] Auth Only Doc");
  });

  it("queries related entities with link direction labels", () => {
    const result = workspace.run("query", "--related-to", "doc-auth-ov");

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Related to Auth Overview (doc-auth-overview)");
    expect(result.stdout).toContain(
      "doc-auth-overview --references--> code-auth-middleware  [code_ref] Auth Middleware"
    );
    expect(result.stdout).toContain(
      "doc-auth-overview <--blocks-- story-auth-hardening  [story] Auth Hardening Story"
    );
    expect(result.stdout).not.toContain("\n  code-auth-middleware  [code_ref] Auth Middleware");
    expect(result.stdout).toContain("next: kioku query --traverse doc-auth-overview --depth 2");
  });

  it("queries bounded traversals only with explicit depth", () => {
    const result = workspace.run("query", "--traverse", "doc-auth-ov", "--depth", "1");

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      "Traversal from doc-auth-overview to depth 1 (visited depth 1) (2)"
    );
    expect(result.stdout).toContain("code-auth-middleware  [code_ref] Auth Middleware");
    expect(result.stdout).toContain("story-auth-hardening  [story] Auth Hardening Story");
    expect(result.stdout).not.toContain("diagram-auth-flow  [diagram] Auth Flow Diagram");
  });

  it("queries shortest paths using positional endpoints", () => {
    const result = workspace.run("query", "--path", "story-auth", "diagram-auth");

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Shortest path: story-auth-hardening -> diagram-auth-flow");
    expect(result.stdout).toContain("1. story-auth-hardening  [story] Auth Hardening Story");
    expect(result.stdout).toContain("2. doc-auth-overview  [doc] Auth Overview");
    expect(result.stdout).toContain("3. code-auth-middleware  [code_ref] Auth Middleware");
    expect(result.stdout).toContain("4. diagram-auth-flow  [diagram] Auth Flow Diagram");
  });

  it("prints the natural-language query stub without opening the workspace", () => {
    const result = workspace.run("query", "What should I know before changing auth?");

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Natural-language query is not available in this edition yet.");
    expect(result.stdout).toContain("LLM-backed retrieval feature");
    expect(result.stdout).toContain("kioku query --tags auth,middleware");
  });

  it("rejects multiple simultaneous query modes", () => {
    const result = workspace.run("query", "--tags", "auth", "--related-to", "doc-auth-overview");

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Choose exactly one query mode");
  });

  it("rejects depth without traverse", () => {
    const result = workspace.run("query", "--tags", "auth", "--depth", "2");

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("--depth is only valid with --traverse");
  });

  it("rejects traverse without explicit depth", () => {
    const result = workspace.run("query", "--traverse", "doc-auth-overview");

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("--traverse requires an explicit --depth value");
  });

  it("rejects path calls without exactly two endpoints", () => {
    const result = workspace.run(
      "query",
      "--path",
      "doc-auth-overview",
      "code-auth-middleware",
      "extra"
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("--path requires <fromId> and <toId>");
  });

  it("rejects ambiguous entity id prefixes", () => {
    const result = workspace.run("query", "--related-to", "doc-auth");

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Entity id "doc-auth" is ambiguous');
    expect(result.stderr).toContain("doc-auth-overview [doc] Auth Overview");
    expect(result.stderr).toContain("doc-auth-only [doc] Auth Only Doc");
  });
});
