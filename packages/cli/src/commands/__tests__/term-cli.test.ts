import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Schema } from "effect";
import { afterEach, beforeEach, describe, test } from "vitest";
import { type CliWorkspace, createCliWorkspace } from "../../__tests__/helpers/cli";

describe("term CLI (SQLite integration)", () => {
  let workspace: CliWorkspace;
  beforeEach(() => {
    workspace = createCliWorkspace({ seedTerms: true });
  });
  afterEach(() => {
    workspace.cleanup();
  });

  const dbFixture = join(dirname(fileURLToPath(import.meta.url)), "term-cli-db-fixture.ts");
  const runDbFixture = (operation: "state" | "insert-unrelated-journal") => {
    const result = spawnSync("bun", ["run", dbFixture, workspace.dbPath, operation], {
      encoding: "utf8",
      shell: false,
    });
    if (result.error) throw result.error;
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
  };
  const TermRow = Schema.Struct({
    id: Schema.String,
    status: Schema.String,
    replacement_term_id: Schema.NullOr(Schema.String),
    merged_into_id: Schema.NullOr(Schema.String),
  });
  const TermNameRow = Schema.Struct({
    term_id: Schema.String,
    kind: Schema.String,
    name: Schema.String,
    display_name: Schema.String,
    name_kind: Schema.String,
    created_at: Schema.String,
  });
  const TagRow = Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    aliases: Schema.NullOr(Schema.String),
    term_id: Schema.NullOr(Schema.String),
  });
  const EntityTagRow = Schema.Struct({ entity_id: Schema.String, tag_id: Schema.String });
  const JournalRow = Schema.Struct({
    id: Schema.String,
    operation: Schema.String,
    term_id: Schema.String,
    related_term_id: Schema.NullOr(Schema.String),
    reason: Schema.NullOr(Schema.String),
    applied_by: Schema.NullOr(Schema.String),
    to_name: Schema.NullOr(Schema.String),
    applied_at: Schema.String,
  });
  const DatabaseState = Schema.Struct({
    terms: Schema.Array(TermRow),
    term_names: Schema.Array(TermNameRow),
    tags: Schema.Array(TagRow),
    entity_tags: Schema.Array(EntityTagRow),
    migration_journal: Schema.Array(JournalRow),
  });
  const JsonCommandError = Schema.Struct({
    ok: Schema.Literal(false),
    command: Schema.String,
    error: Schema.Struct({ tag: Schema.String }),
  });
  const state = () => Schema.decodeUnknownSync(DatabaseState)(JSON.parse(runDbFixture("state")));
  const terms = () => state().terms;
  const names = () => state().term_names;
  const tags = () => state().tags;
  const entityTags = () => state().entity_tags;
  const journal = () => state().migration_journal;
  const iso = (value: string) => assert.match(value, /^\d{4}-\d{2}-\d{2}T/);
  test("help registers term creation and lifecycle commands", () => {
    const result = workspace.run("term", "--help");
    assert.equal(result.status, 0);
    assert.match(result.stdout, /list|show|audit|alias|deprecate|merge/);
    assert.match(result.stdout, /create/);
  });

  test("lists and shows required fields, with kind filtering", () => {
    const list = workspace.run("term", "list", "--kind", "api");
    assert.equal(list.status, 0);
    assert.match(list.stdout, /Stable ID: term-old-api/);
    assert.doesNotMatch(list.stdout, /term-shared-project/);
    assert.match(list.stdout, /Created: .*T/);
    assert.match(list.stdout, /Updated: .*T/);
    const show = workspace.run("term", "show", "term-old-api");
    assert.equal(show.status, 0);
    assert.match(show.stdout, /Kind: api/);
    assert.match(show.stdout, /Description: Old API/);
  });

  test("stable IDs win with kind while duplicate names require kind", () => {
    const byId = workspace.run("term", "show", "term-old-api", "--kind", "project");
    assert.equal(byId.status, 0);
    assert.match(byId.stdout, /Stable ID: term-old-api/);
    assert.match(byId.stdout, /Kind: api/);
    const ambiguous = workspace.run("term", "show", "Shared");
    assert.notEqual(ambiguous.status, 0);
    assert.match(ambiguous.stderr, /ambiguous/i);
    const byKind = workspace.run("term", "show", "Shared", "--kind", "project", "--json");
    assert.equal(byKind.status, 0);
    assert.equal(JSON.parse(byKind.stdout).term.term.id, "term-shared-project");
  });

  test("JSON success and errors are parseable and lifecycle dry-run is truthful", () => {
    const alias = workspace.run("term", "alias", "term-old-api", "legacy-api", "--json");
    assert.equal(alias.status, 0);
    assert.equal(JSON.parse(alias.stdout).ok, true);
    const plan = workspace.run(
      "term",
      "deprecate",
      "term-old-api",
      "--dry-run",
      "--replacement",
      "term-new-api",
      "--json"
    );
    assert.equal(plan.status, 0);
    const parsed = JSON.parse(plan.stdout);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.command, "term deprecate");
    assert.equal(parsed.mode, "dry-run");
    assert.match(parsed.result.term.createdAt, /^\d{4}-\d{2}-\d{2}T/);
    const invalid = workspace.run("term", "deprecate", "term-old-api", "--json");
    assert.notEqual(invalid.status, 0);
    const error = JSON.parse(invalid.stdout);
    assert.equal(error.ok, false);
    assert.equal(error.command, "term deprecate");
    assert.equal(error.error.tag, "ValidationError");
  });

  test("human lifecycle output has separate counts, notes, and no numeric indexes", () => {
    const deprecate = workspace.run(
      "term",
      "deprecate",
      "term-old-api",
      "--dry-run",
      "--replacement",
      "term-new-api"
    );
    assert.equal(deprecate.status, 0);
    assert.match(deprecate.stdout, /Aliases: Legacy Shared/);
    assert.match(deprecate.stdout, /Proposed replacement: term-new-api \(New API\)/);

    const result = workspace.run("term", "merge", "term-old-api", "term-new-api", "--dry-run");
    assert.equal(result.status, 0);
    assert.match(result.stdout, /Affected tags: 2/);
    assert.match(result.stdout, /Affected entities: 1/);
    assert.match(result.stdout, /Note:/);
    assert.match(result.stdout, /Tag IDs, display names, aliases/);
    assert.doesNotMatch(result.stdout, /Tag #shared-tag: shared-tag\s+0/);
  });

  test("mode validation and dry-run do not mutate", () => {
    const initial = state();
    for (const args of [
      ["term", "deprecate", "term-old-api", "--kind", "api"],
      ["term", "deprecate", "term-old-api", "--kind", "api", "--dry-run", "--apply"],
      ["term", "deprecate", "term-old-api", "--kind", "api", "--dry-run"],
      ["term", "merge", "term-old-api", "term-new-api", "--kind", "api"],
      ["term", "merge", "term-old-api", "term-new-api", "--kind", "api", "--dry-run", "--apply"],
      ["term", "merge", "term-old-api", "term-new-api", "--kind", "api", "--dry-run"],
    ]) {
      const result = workspace.run(...args);
      if (args.includes("--dry-run") && !args.includes("--apply")) assert.equal(result.status, 0);
      else assert.notEqual(result.status, 0);
      assert.deepEqual(state(), initial);
    }
  });

  test("deprecate apply with fallback and audit", () => {
    const result = workspace.run(
      "term",
      "deprecate",
      "Shared",
      "--kind",
      "api",
      "--replacement",
      "New API",
      "--apply",
      "--reason",
      "obsolete",
      "--applied-by",
      "alice",
      "--json"
    );
    assert.equal(result.status, 0);
    const body = JSON.parse(result.stdout);
    assert.equal(body.ok, true);
    assert.equal(body.result.term.id, "term-old-api");
    assert.deepEqual(body.result.plan.affectedTags.map((tag: { id: string }) => tag.id).sort(), [
      "shared-tag",
      "shared-tag-alias",
    ]);
    iso(body.result.journalEntry.appliedAt);
    assert.deepEqual(
      terms()
        .filter((term) => ["term-old-api", "term-new-api"].includes(term.id))
        .map(({ id, status, replacement_term_id }) => ({ id, status, replacement_term_id })),
      [
        { id: "term-new-api", status: "active", replacement_term_id: null },
        { id: "term-old-api", status: "deprecated", replacement_term_id: "term-new-api" },
      ]
    );
    assert.deepEqual(
      journal().map(({ reason, applied_by, to_name, related_term_id }) => ({
        reason,
        applied_by,
        to_name,
        related_term_id,
      })),
      [
        {
          reason: "obsolete",
          applied_by: "alice",
          to_name: "New API",
          related_term_id: "term-new-api",
        },
      ]
    );
    for (const selector of ["term-old-api", "Shared"]) {
      const audit = workspace.run("term", "audit", selector, "--kind", "api", "--json");
      assert.equal(audit.status, 0);
      const entry = JSON.parse(audit.stdout).audit.entries[0];
      assert.equal(entry.termId, "term-old-api");
      iso(entry.appliedAt);
    }
  });

  test("deprecate apply without fallback records a zero-affected lifecycle change", () => {
    const result = workspace.run(
      "term",
      "deprecate",
      "term-zero-api",
      "--kind",
      "api",
      "--apply",
      "--json"
    );
    assert.equal(result.status, 0);
    const body = JSON.parse(result.stdout);
    assert.equal(body.ok, true);
    assert.equal(body.result.term.status, "deprecated");
    assert.equal(body.result.journalEntry.toName, undefined);
    assert.equal(body.result.journalEntry.relatedTermId, undefined);
    iso(body.result.journalEntry.appliedAt);
    assert.deepEqual(
      terms()
        .filter((term) => term.id === "term-zero-api")
        .map(({ status, replacement_term_id }) => ({ status, replacement_term_id })),
      [{ status: "deprecated", replacement_term_id: null }]
    );
    assert.equal(journal().filter((entry) => entry.term_id === "term-zero-api").length, 1);
    const human = workspace.run("term", "deprecate", "term-old-api", "--kind", "api", "--apply");
    assert.equal(human.status, 0);
    assert.match(human.stdout, /Lifecycle state and audit journal changed on apply/);
    assert.doesNotMatch(human.stdout, /no changes/i);
  });

  test("merge apply preserves graph and attributes audit entries", () => {
    const beforeTags = tags();
    const beforeEntityTags = entityTags();
    runDbFixture("insert-unrelated-journal");
    const result = workspace.run(
      "term",
      "merge",
      "Shared",
      "New API",
      "--kind",
      "api",
      "--reason",
      "consolidate",
      "--applied-by",
      "bob",
      "--apply",
      "--json"
    );
    assert.equal(result.status, 0);
    const body = JSON.parse(result.stdout);
    assert.equal(body.ok, true);
    assert.equal(body.result.source.status, "merged");
    iso(body.result.journalEntry.appliedAt);
    assert.deepEqual(
      terms()
        .filter((term) => term.id === "term-old-api")
        .map(({ status, merged_into_id, replacement_term_id }) => ({
          status,
          merged_into_id,
          replacement_term_id,
        })),
      [{ status: "merged", merged_into_id: "term-new-api", replacement_term_id: null }]
    );
    assert.deepEqual(
      tags(),
      beforeTags.map((tag) =>
        tag.term_id === "term-old-api" ? { ...tag, term_id: "term-new-api" } : tag
      )
    );
    assert.deepEqual(entityTags(), beforeEntityTags);
    assert.deepEqual(
      journal()
        .filter((entry) => entry.id !== "unrelated-rename")
        .map(({ operation, term_id, related_term_id, reason, applied_by }) => ({
          operation,
          term_id,
          related_term_id,
          reason,
          applied_by,
        })),
      [
        {
          operation: "merge",
          term_id: "term-old-api",
          related_term_id: "term-new-api",
          reason: "consolidate",
          applied_by: "bob",
        },
      ]
    );
    for (const [selector, operations] of [
      ["term-old-api", ["merge"]],
      ["term-new-api", ["merge", "rename"]],
    ] as const) {
      const audit = workspace.run("term", "audit", selector, "--kind", "api", "--json");
      assert.equal(audit.status, 0);
      const entries = JSON.parse(audit.stdout).audit.entries;
      assert.deepEqual(
        entries.map((entry: { operation: string }) => entry.operation).sort(),
        [...operations].sort()
      );
      for (const entry of entries) iso(entry.appliedAt);
    }
    const show = workspace.run("term", "show", "term-old-api", "--kind", "api", "--json");
    assert.equal(show.status, 0);
    assert.equal(JSON.parse(show.stdout).term.term.status, "merged");
    const alias = workspace.run(
      "term",
      "alias",
      "term-old-api",
      "merged-alias",
      "--kind",
      "api",
      "--json"
    );
    assert.notEqual(alias.status, 0);
    assert.equal(JSON.parse(alias.stdout).ok, false);
  });

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: this matrix intentionally covers the public command/error surface.
  test("alias conflicts and JSON command/error matrix", () => {
    const beforeNames = names();
    const conflict = workspace.run(
      "term",
      "alias",
      "term-old-api",
      "New API",
      "--kind",
      "api",
      "--json"
    );
    assert.notEqual(conflict.status, 0);
    assert.match(JSON.parse(conflict.stdout).error.tag, /Error$/);
    assert.deepEqual(names(), beforeNames);
    for (const args of [
      ["term", "list", "--kind", "api", "--json"],
      ["term", "show", "term-old-api", "--json"],
      ["term", "alias", "term-old-api", "fresh-name", "--json"],
      ["term", "audit", "term-old-api", "--json"],
    ] as const) {
      const result = workspace.run(...args);
      assert.equal(result.status, 0);
      const body = JSON.parse(result.stdout);
      assert.equal(body.ok, true);
      if (args[1] === "list")
        assert.ok(
          body.terms.some(
            (term: { term: { id: string; status: string } }) =>
              term.term.id === "term-old-api" && term.term.status === "active"
          )
        );
      if (args[1] === "show" || args[1] === "alias")
        assert.equal(body.term.term.id, "term-old-api");
      if (args[1] === "audit") assert.equal(body.audit.inspection.term.id, "term-old-api");
      for (const value of JSON.stringify(body).matchAll(
        /(?:createdAt|updatedAt|appliedAt)":"([^"]+)/g
      )) {
        const timestamp = value[1];
        if (timestamp !== undefined) iso(timestamp);
      }
    }
    for (const args of [
      ["term", "show", "Shared", "--json"],
      ["term", "show", "missing", "--json"],
      ["term", "list", "--kind", "invalid", "--json"],
      ["term", "deprecate", "term-old-api", "--kind", "api", "--json"],
    ] as const) {
      const result = workspace.run(...args);
      assert.notEqual(result.status, 0);
      const error = Schema.decodeUnknownSync(JsonCommandError)(JSON.parse(result.stdout));
      assert.equal(error.ok, false);
    }
  });
});
