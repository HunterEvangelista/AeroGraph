import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type CliWorkspace, createCliWorkspace } from "../../__tests__/helpers/cli";

describe("link commands", () => {
  let workspace: CliWorkspace;

  beforeEach(() => {
    workspace = createCliWorkspace();
  });

  afterEach(() => {
    workspace.cleanup();
  });

  it("creates and lists one-way links", () => {
    const create = workspace.run(
      "link",
      "doc-auth-only",
      "diagram-auth-flow",
      "--type",
      "references"
    );

    expect(create.status).toBe(0);
    expect(create.stdout).toContain("Link created successfully!");
    expect(create.stdout).toContain("doc-auth-only --references--> diagram-auth-flow");

    const sourceList = workspace.run("link", "list", "doc-auth-only");
    expect(sourceList.status).toBe(0);
    expect(sourceList.stdout).toContain("Outgoing");
    expect(sourceList.stdout).toContain(
      "doc-auth-only --references--> diagram-auth-flow  [diagram] Auth Flow Diagram"
    );

    const targetList = workspace.run("link", "list", "diagram-auth-flow");
    expect(targetList.status).toBe(0);
    expect(targetList.stdout).toContain("Incoming");
    expect(targetList.stdout).toContain(
      "diagram-auth-flow <--references-- doc-auth-only  [doc] Auth Only Doc"
    );
  });

  it("unlinks a specific type between two entities", () => {
    expect(
      workspace.run("link", "doc-auth-only", "diagram-auth-flow", "--type", "references").status
    ).toBe(0);
    expect(
      workspace.run("link", "doc-auth-only", "diagram-auth-flow", "--type", "blocks").status
    ).toBe(0);

    const unlink = workspace.run(
      "unlink",
      "doc-auth-only",
      "diagram-auth-flow",
      "--type",
      "references"
    );

    expect(unlink.status).toBe(0);
    expect(unlink.stdout).toContain("doc-auth-only --references--> diagram-auth-flow");

    const list = workspace.run("link", "list", "doc-auth-only");
    expect(list.status).toBe(0);
    expect(list.stdout).not.toContain("--references--> diagram-auth-flow");
    expect(list.stdout).toContain("doc-auth-only --blocks--> diagram-auth-flow");
  });

  it("resolves unique short entity ids", () => {
    const result = workspace.run("link", "doc-auth-on", "diagram-auth", "--type", "related_to");

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("doc-auth-only --related_to--> diagram-auth-flow");
  });

  it("rejects ambiguous short entity ids", () => {
    const result = workspace.run("link", "doc-auth", "diagram-auth-flow", "--type", "references");

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Entity id "doc-auth" is ambiguous');
    expect(result.stderr).toContain("doc-auth-overview");
    expect(result.stderr).toContain("doc-auth-only");
  });

  it("rejects invalid link types", () => {
    const result = workspace.run(
      "link",
      "doc-auth-only",
      "diagram-auth-flow",
      "--type",
      "explains"
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Invalid link type "explains"');
  });

  it("surfaces linked entities in doc show", () => {
    const result = workspace.run("doc", "show", "doc-auth-ov");

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Links");
    expect(result.stdout).toContain(
      "--references--> code-auth-middleware  [code_ref] Auth Middleware"
    );
    expect(result.stdout).toContain(
      "<--blocks-- story-auth-hardening  [story] Auth Hardening Story"
    );
  });

  it("uses short ids for doc edit and delete", () => {
    const edit = workspace.run("doc", "edit", "--title", "Auth Only Updated", "doc-auth-on");
    expect(edit.status).toBe(0);
    expect(edit.stdout).toContain("Auth Only Updated");

    const show = workspace.run("doc", "show", "doc-auth-on");
    expect(show.status).toBe(0);
    expect(show.stdout).toContain("# Auth Only Updated");

    const remove = workspace.run("doc", "delete", "--force", "doc-auth-on");
    expect(remove.status).toBe(0);

    const missing = workspace.run("doc", "show", "doc-auth-on");
    expect(missing.status).not.toBe(0);
    expect(missing.stderr).toContain("EntityNotFoundError");
  });
});
