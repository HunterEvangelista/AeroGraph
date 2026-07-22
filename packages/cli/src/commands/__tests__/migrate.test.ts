import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type CliWorkspace, createCliWorkspace } from "../../__tests__/helpers/cli.js";

const governTagFixture = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../__tests__/helpers/govern-tag-fixture.ts"
);
const readJournalFixture = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../__tests__/helpers/read-journal-fixture.ts"
);

const queryEntityIds = (stdout: string): ReadonlyArray<string> =>
  [...stdout.matchAll(/^ {2}(\S+) {2}\[/gm)].map((match) => match[1] ?? "");

const contextEntityIds = (stdout: string): ReadonlyArray<string> =>
  [...stdout.matchAll(/^- ID: (.+)$/gm)].map((match) => match[1] ?? "");

const governTags = (workspace: CliWorkspace, ...args: ReadonlyArray<string>) => {
  const result = spawnSync("bun", ["run", governTagFixture, workspace.rootPath, ...args], {
    encoding: "utf8",
    shell: false,
  });
  expect(result.status, `${result.stderr}\n${result.stdout}`).toBe(0);
};

const governKiokuTag = (workspace: CliWorkspace) => governTags(workspace);

describe("migrate command", () => {
  let workspace: CliWorkspace;

  beforeEach(() => {
    workspace = createCliWorkspace();
  });

  afterEach(() => {
    workspace.cleanup();
  });

  it("previews a rename without changing tags", () => {
    const create = workspace.run(
      "doc",
      "create",
      "Rename Safety Notes",
      "--content",
      "Existing Kioku rename context.",
      "--tags",
      "kioku"
    );
    expect(create.status, `${create.stderr}\n${create.stdout}`).toBe(0);
    governKiokuTag(workspace);

    const dryRun = workspace.run("migrate", "brand", "kioku", "AeroGraph", "--dry-run");
    expect(dryRun.status, `${dryRun.stderr}\n${dryRun.stdout}`).toBe(0);
    expect(dryRun.stdout).toContain("Rename Migration Dry Run");
    expect(dryRun.stdout).toContain("Term: term-brand-kioku (Kioku)");
    expect(dryRun.stdout).toContain("Affected tags: 1");
    expect(dryRun.stdout).toContain("#kioku kioku -> AeroGraph");
    expect(dryRun.stdout).toContain("Affected entities: 1");
    expect(dryRun.stdout).toContain("Rename Safety Notes");
    expect(dryRun.stdout).toContain("No changes were applied.");

    const tag = workspace.run("tag", "show", "kioku");
    expect(tag.status, `${tag.stderr}\n${tag.stdout}`).toBe(0);
    expect(tag.stdout).toContain("Name:    kioku");
  });

  it("applies a rename while preserving tag identity and attached entities", () => {
    const create = workspace.run(
      "doc",
      "create",
      "Rename Applied Notes",
      "--content",
      "Existing Kioku rename context.",
      "--tags",
      "kioku"
    );
    expect(create.status, `${create.stderr}\n${create.stdout}`).toBe(0);
    governKiokuTag(workspace);
    const relatedBefore = workspace.run("query", "--related-to", "doc-auth-overview");
    expect(relatedBefore.status, `${relatedBefore.stderr}\n${relatedBefore.stdout}`).toBe(0);

    const apply = workspace.run(
      "migrate",
      "brand",
      "kioku",
      "AeroGraph",
      "--apply",
      "--reason",
      "Project rename",
      "--applied-by",
      "test"
    );
    expect(apply.status, `${apply.stderr}\n${apply.stdout}`).toBe(0);
    expect(apply.stdout).toContain("Rename migration applied");
    expect(apply.stdout).toContain("Term ID: term-brand-kioku");
    expect(apply.stdout).toContain("Journal: journal-rename-brand-kioku-aerograph-");
    expect(apply.stdout).toContain("#kioku kioku -> AeroGraph");
    expect(apply.stdout).toContain("Rename Applied Notes");

    const tag = workspace.run("tag", "show", "kioku");
    expect(tag.status, `${tag.stderr}\n${tag.stdout}`).toBe(0);
    expect(tag.stdout).toContain("Tag: #kioku");
    expect(tag.stdout).toContain("Name:    AeroGraph");

    const docsByOldTagId = workspace.run("doc", "list", "--tag", "kioku");
    expect(docsByOldTagId.status, `${docsByOldTagId.stderr}\n${docsByOldTagId.stdout}`).toBe(0);
    expect(docsByOldTagId.stdout).toContain("Documents (1)");
    expect(docsByOldTagId.stdout).toContain("Rename Applied Notes");

    const oldNameQuery = workspace.run("query", "--tags", "kioku");
    const canonicalQuery = workspace.run("query", "--tags", "AeroGraph");
    expect(oldNameQuery.status, `${oldNameQuery.stderr}\n${oldNameQuery.stdout}`).toBe(0);
    expect(canonicalQuery.status, `${canonicalQuery.stderr}\n${canonicalQuery.stdout}`).toBe(0);
    expect(queryEntityIds(oldNameQuery.stdout)).toEqual(queryEntityIds(canonicalQuery.stdout));
    expect(oldNameQuery.stdout).toContain("Rename Applied Notes");

    const oldNameContext = workspace.run("context", "--tags", "kioku");
    const canonicalContext = workspace.run("context", "--tags", "AeroGraph", "--canonical-terms");
    expect(oldNameContext.status, `${oldNameContext.stderr}\n${oldNameContext.stdout}`).toBe(0);
    expect(canonicalContext.status, `${canonicalContext.stderr}\n${canonicalContext.stdout}`).toBe(
      0
    );
    expect(contextEntityIds(oldNameContext.stdout)).toEqual(
      contextEntityIds(canonicalContext.stdout)
    );
    expect(canonicalContext.stdout).toContain("# Kioku Context: Tags #AeroGraph");
    expect(canonicalContext.stdout).toContain("- Tags: #AeroGraph");
    expect(canonicalContext.stdout).toContain("Existing Kioku rename context.");

    const relatedAfter = workspace.run("query", "--related-to", "doc-auth-overview");
    expect(relatedAfter.status, `${relatedAfter.stderr}\n${relatedAfter.stdout}`).toBe(0);
    const preservedRelationship =
      "doc-auth-overview --references--> code-auth-middleware  [code_ref] Auth Middleware";
    expect(relatedBefore.stdout).toContain(preservedRelationship);
    expect(relatedAfter.stdout).toContain(preservedRelationship);

    const journalId = apply.stdout.match(/Journal: (\S+)/)?.[1];
    expect(journalId).toBeDefined();
    const reopenedJournal = spawnSync(
      "bun",
      ["run", readJournalFixture, workspace.rootPath, journalId ?? ""],
      { encoding: "utf8", shell: false }
    );
    expect(reopenedJournal.status, `${reopenedJournal.stderr}\n${reopenedJournal.stdout}`).toBe(0);
    const journal = JSON.parse(reopenedJournal.stdout) as {
      readonly id: string;
      readonly termId: string;
      readonly fromName: string;
      readonly toName: string;
    };
    expect(journal).toMatchObject({
      id: journalId,
      termId: "term-brand-kioku",
      fromName: "kioku",
      toName: "AeroGraph",
    });
  });

  it("applies a non-brand rename and quotes multi-word follow-up commands", () => {
    governTags(workspace, "Legacy Client", "package", "term-package-client", "auth");

    const dryRun = workspace.run(
      "migrate",
      "package",
      "Legacy Client",
      "Platform Client",
      "--dry-run"
    );
    expect(dryRun.status, `${dryRun.stderr}\n${dryRun.stdout}`).toBe(0);
    expect(dryRun.stdout).toContain(
      "Apply with: kioku migrate package 'Legacy Client' 'Platform Client' --apply"
    );

    const apply = workspace.run(
      "migrate",
      "package",
      "Legacy Client",
      "Platform Client",
      "--apply"
    );
    expect(apply.status, `${apply.stderr}\n${apply.stdout}`).toBe(0);
    expect(apply.stdout).toContain("Kind:    package");
    expect(apply.stdout).toContain("Term ID: term-package-client");

    const tag = workspace.run("tag", "show", "auth");
    expect(tag.status, `${tag.stderr}\n${tag.stdout}`).toBe(0);
    expect(tag.stdout).toContain("Name:    Platform Client");
  });

  it("requires exactly one migration mode", () => {
    const missingMode = workspace.run("migrate", "brand", "kioku", "AeroGraph");
    expect(missingMode.status).not.toBe(0);
    expect(missingMode.stderr).toContain("Choose exactly one of --dry-run or --apply.");

    const bothModes = workspace.run(
      "migrate",
      "brand",
      "kioku",
      "AeroGraph",
      "--dry-run",
      "--apply"
    );
    expect(bothModes.status).not.toBe(0);
    expect(bothModes.stderr).toContain("Choose exactly one of --dry-run or --apply.");
  });
});
