import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type CliWorkspace, createCliWorkspace } from "../../__tests__/helpers/cli.js";

const extractId = (stdout: string): string => {
  const match = stdout.match(/ID:\s+([^\n]+)/);
  if (!match?.[1]) {
    throw new Error(`Could not extract id from stdout:\n${stdout}`);
  }
  return match[1].trim();
};

describe("story command", () => {
  let workspace: CliWorkspace;

  beforeEach(() => {
    workspace = createCliWorkspace();
  });

  afterEach(() => {
    workspace.cleanup();
  });

  it("creates and lists stories", () => {
    const created = workspace.run(
      "story",
      "create",
      "--title",
      "User can sign in",
      "--status",
      "todo",
      "--content",
      "Sign in happy path.",
      "--tag",
      "auth,onboarding"
    );

    expect(created.status).toBe(0);
    expect(created.stdout).toContain("Story created successfully!");
    expect(created.stdout).toContain("Title:   User can sign in");
    expect(created.stdout).toContain("Status:  todo");

    const listed = workspace.run("story", "list", "--tag", "onboarding");

    expect(listed.status).toBe(0);
    expect(listed.stdout).toContain("Stories (1)");
    expect(listed.stdout).toContain("[todo] User can sign in");
  });

  it("shows story details with tags and linked entities", () => {
    const created = workspace.run(
      "story",
      "create",
      "--title",
      "Tagged story",
      "--status",
      "backlog",
      "--content",
      "Detailed story body.",
      "--tag",
      "onboarding"
    );
    const createdId = extractId(created.stdout);

    const createdShow = workspace.run("story", "show", createdId);

    expect(createdShow.status).toBe(0);
    expect(createdShow.stdout).toContain("# Tagged story");
    expect(createdShow.stdout).toContain(`ID:      ${createdId}`);
    expect(createdShow.stdout).toContain("Status:  backlog");
    expect(createdShow.stdout).toContain("Tags:    #onboarding");
    expect(createdShow.stdout).toContain("Detailed story body.");

    const fixtureShow = workspace.run("story", "show", "story-auth-hardening");

    expect(fixtureShow.status).toBe(0);
    expect(fixtureShow.stdout).toContain("# Auth Hardening Story");
    expect(fixtureShow.stdout).toContain("Status:  in_progress");
    expect(fixtureShow.stdout).toContain("Links");
    expect(fixtureShow.stdout).toContain("--blocks--> doc-auth-overview  [doc] Auth Overview");
  });

  it("filters stories by status aliases", () => {
    const hyphen = workspace.run("story", "list", "--status", "in-progress");
    const underscore = workspace.run("story", "list", "--status", "in_progress");

    expect(hyphen.status).toBe(0);
    expect(hyphen.stdout).toContain("story-auth-hardening  [in_progress] Auth Hardening Story");
    expect(underscore.status).toBe(0);
    expect(underscore.stdout).toContain("story-auth-hardening  [in_progress] Auth Hardening Story");
  });

  it("edits story fields", () => {
    const result = workspace.run(
      "story",
      "edit",
      "story-auth-hardening",
      "--title",
      "Auth Hardening Done",
      "--status",
      "done",
      "--content",
      "Story completed."
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Story updated successfully!");
    expect(result.stdout).toContain("Title:   Auth Hardening Done");
    expect(result.stdout).toContain("Status:  done");
    expect(result.stdout).toContain("Version: 2");

    const shown = workspace.run("story", "show", "story-auth-hardening");

    expect(shown.stdout).toContain("# Auth Hardening Done");
    expect(shown.stdout).toContain("Status:  done");
    expect(shown.stdout).toContain("Story completed.");
  });

  it("deletes stories using current doc-delete-compatible semantics", () => {
    const result = workspace.run("story", "delete", "story-auth-hardening");

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Deleting story: Auth Hardening Story");
    expect(result.stdout).toContain("Story story-auth-hardening deleted.");

    const shown = workspace.run("story", "show", "story-auth-hardening");

    expect(shown.status).not.toBe(0);
    expect(shown.stderr).toContain("Entity not found: story-auth-hardening");
  });

  it("rejects invalid statuses and non-story entities", () => {
    const invalidStatus = workspace.run("story", "list", "--status", "started");
    const nonStory = workspace.run("story", "show", "doc-auth-overview");

    expect(invalidStatus.status).not.toBe(0);
    expect(invalidStatus.stderr).toContain('Invalid story status "started"');
    expect(nonStory.status).not.toBe(0);
    expect(nonStory.stderr).toContain("Entity is not a story: doc-auth-overview");
  });
});
