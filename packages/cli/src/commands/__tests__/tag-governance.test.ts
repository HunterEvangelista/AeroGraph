import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Schema } from "effect";
import { afterEach, beforeEach, describe, test } from "vitest";
import { type CliWorkspace, createCliWorkspace } from "../../__tests__/helpers/cli";

const TagRow = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  term_id: Schema.NullOr(Schema.String),
});
const DatabaseState = Schema.Struct({
  entities: Schema.Array(Schema.Unknown),
  entityTags: Schema.Array(Schema.Unknown),
  links: Schema.Array(Schema.Unknown),
  tags: Schema.Array(TagRow),
  terms: Schema.Array(Schema.Unknown),
  termNames: Schema.Array(Schema.Unknown),
  migrationJournal: Schema.Array(Schema.Unknown),
});
const TermInspection = Schema.Struct({
  term: Schema.Struct({ id: Schema.String, kind: Schema.String }),
  canonicalName: Schema.String,
  aliases: Schema.Array(Schema.Struct({ displayName: Schema.String })),
});
const TermCreateResult = Schema.Struct({
  ok: Schema.Literal(true),
  command: Schema.Literal("term create"),
  term: TermInspection,
});
const TagInspection = Schema.Struct({
  tag: Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    termId: Schema.optional(Schema.String),
  }),
  term: Schema.optional(TermInspection),
});
const TagResult = Schema.Struct({
  ok: Schema.Literal(true),
  command: Schema.String,
  tag: TagInspection,
});
const TagListResult = Schema.Struct({
  ok: Schema.Literal(true),
  command: Schema.Literal("tag list"),
  tags: Schema.Array(TagInspection),
});
const CommandFailure = Schema.Struct({
  ok: Schema.Literal(false),
  command: Schema.String,
  error: Schema.Struct({ tag: Schema.String, message: Schema.String }),
});

describe("pre-migration tag governance CLI", () => {
  let workspace: CliWorkspace;
  const dbFixture = join(dirname(fileURLToPath(import.meta.url)), "tag-governance-db-fixture.ts");

  beforeEach(() => {
    workspace = createCliWorkspace();
  });

  afterEach(() => {
    workspace.cleanup();
  });

  const state = () => {
    const result = spawnSync("bun", ["run", dbFixture, workspace.dbPath], {
      encoding: "utf8",
      shell: false,
    });
    if (result.error) throw result.error;
    assert.equal(result.status, 0, result.stderr);
    return Schema.decodeUnknownSync(DatabaseState)(JSON.parse(result.stdout));
  };

  const createTerm = (name: string, kind: string, id: string) => {
    const result = workspace.run("term", "create", name, "--kind", kind, "--id", id, "--json");
    assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
    return Schema.decodeUnknownSync(TermCreateResult)(JSON.parse(result.stdout));
  };

  test("creates terms with generated or custom stable IDs and repeatable aliases", () => {
    const generated = workspace.run(
      "term",
      "create",
      "Kioku",
      "--kind",
      "brand",
      "--description",
      "Project memory brand",
      "--alias",
      "Memory Graph",
      "--alias",
      "Kioku Project",
      "--json"
    );
    assert.equal(generated.status, 0, `${generated.stderr}\n${generated.stdout}`);
    const generatedBody = Schema.decodeUnknownSync(TermCreateResult)(JSON.parse(generated.stdout));
    assert.match(generatedBody.term.term.id, /^term-[0-9a-f-]{36}$/);
    assert.deepEqual(
      generatedBody.term.aliases.map(({ displayName }) => displayName),
      ["Kioku Project", "Memory Graph"]
    );

    const custom = workspace.run(
      "term",
      "create",
      "Platform Client",
      "--kind",
      "package",
      "--id",
      "term-package-client"
    );
    assert.equal(custom.status, 0, `${custom.stderr}\n${custom.stdout}`);
    assert.match(custom.stdout, /Term created: term-package-client/);

    const shown = workspace.run("term", "show", generatedBody.term.term.id, "--json");
    assert.equal(shown.status, 0, shown.stderr);
    assert.equal(JSON.parse(shown.stdout).term.term.id, generatedBody.term.term.id);
  });

  test("governs an existing tag without changing graph identity and unblocks rename planning", () => {
    const document = workspace.run(
      "doc",
      "create",
      "Governed Kioku Memory",
      "--content",
      "Existing project memory.",
      "--tags",
      "kioku"
    );
    assert.equal(document.status, 0, document.stderr);
    createTerm("Kioku", "brand", "term-brand-kioku");

    const before = state();
    const ungoverned = workspace.run("tag", "list", "--ungoverned");
    assert.equal(ungoverned.status, 0, ungoverned.stderr);
    assert.match(ungoverned.stdout, /#kioku.*\[ungoverned\]/);

    const governed = workspace.run(
      "tag",
      "govern",
      "kioku",
      "--term",
      "Kioku",
      "--kind",
      "brand",
      "--json"
    );
    assert.equal(governed.status, 0, `${governed.stderr}\n${governed.stdout}`);
    const governedBody = Schema.decodeUnknownSync(TagResult)(JSON.parse(governed.stdout));
    assert.equal(governedBody.tag.tag.id, "kioku");
    assert.equal(governedBody.tag.tag.termId, "term-brand-kioku");
    assert.equal(governedBody.tag.term?.canonicalName, "Kioku");

    const after = state();
    assert.deepEqual(after.entities, before.entities);
    assert.deepEqual(after.entityTags, before.entityTags);
    assert.deepEqual(after.links, before.links);
    assert.deepEqual(after.terms, before.terms);
    assert.deepEqual(after.termNames, before.termNames);
    assert.deepEqual(after.migrationJournal, before.migrationJournal);
    assert.deepEqual(
      after.tags.map((tag) => (tag.id === "kioku" ? { ...tag, term_id: null } : tag)),
      before.tags
    );

    const repeat = workspace.run("tag", "govern", "kioku", "--term", "term-brand-kioku");
    assert.equal(repeat.status, 0, `${repeat.stderr}\n${repeat.stdout}`);
    assert.deepEqual(state(), after);

    const show = workspace.run("tag", "show", "kioku");
    assert.equal(show.status, 0, show.stderr);
    assert.match(show.stdout, /Governance: governed/);
    assert.match(show.stdout, /term-brand-kioku \(Kioku; brand; active\)/);
    const showJson = workspace.run("tag", "show", "kioku", "--json");
    assert.equal(showJson.status, 0, showJson.stderr);
    assert.equal(
      Schema.decodeUnknownSync(TagResult)(JSON.parse(showJson.stdout)).tag.term?.term.id,
      "term-brand-kioku"
    );

    const governedList = workspace.run("tag", "list", "--governed", "--json");
    assert.equal(governedList.status, 0, governedList.stderr);
    assert.deepEqual(
      Schema.decodeUnknownSync(TagListResult)(JSON.parse(governedList.stdout)).tags.map(
        ({ tag }) => tag.id
      ),
      ["kioku"]
    );
    const remaining = workspace.run("tag", "list", "--ungoverned", "--json");
    assert.equal(remaining.status, 0, remaining.stderr);
    assert.ok(
      Schema.decodeUnknownSync(TagListResult)(JSON.parse(remaining.stdout)).tags.every(
        ({ tag }) => tag.id !== "kioku"
      )
    );

    const migration = workspace.run("migrate", "brand", "Kioku", "AeroGraph", "--dry-run");
    assert.equal(migration.status, 0, `${migration.stderr}\n${migration.stdout}`);
    assert.match(migration.stdout, /Term: term-brand-kioku \(Kioku\)/);
    assert.match(migration.stdout, /#kioku kioku -> AeroGraph/);
  });

  test("requires compare-and-set replacement and rejects missing or cross-kind targets", () => {
    const document = workspace.run(
      "doc",
      "create",
      "Governance Safety",
      "--content",
      "Safety fixture.",
      "--tags",
      "kioku"
    );
    assert.equal(document.status, 0, document.stderr);
    createTerm("Kioku", "brand", "term-brand-kioku");
    createTerm("Other Brand", "brand", "term-brand-other");
    createTerm("Project Kioku", "project", "term-project-kioku");
    const initial = workspace.run("tag", "govern", "kioku", "--term", "term-brand-kioku");
    assert.equal(initial.status, 0, initial.stderr);

    for (const args of [
      ["tag", "govern", "kioku", "--term", "missing", "--json"],
      ["tag", "govern", "kioku", "--term", "term-brand-other", "--json"],
      [
        "tag",
        "govern",
        "kioku",
        "--term",
        "term-brand-other",
        "--replace",
        "term-brand-other",
        "--json",
      ],
      [
        "tag",
        "govern",
        "kioku",
        "--term",
        "term-project-kioku",
        "--replace",
        "term-brand-kioku",
        "--json",
      ],
      ["tag", "list", "--governed", "--ungoverned", "--json"],
    ] as const) {
      const result = workspace.run(...args);
      assert.notEqual(result.status, 0, `${result.stderr}\n${result.stdout}`);
      const error = Schema.decodeUnknownSync(CommandFailure)(JSON.parse(result.stdout));
      assert.match(error.error.tag, /Error$/);
      assert.ok(error.error.message.length > 0);
    }
    assert.equal(state().tags.find(({ id }) => id === "kioku")?.term_id, "term-brand-kioku");

    const replacement = workspace.run(
      "tag",
      "govern",
      "kioku",
      "--term",
      "Other Brand",
      "--kind",
      "brand",
      "--replace",
      "Kioku",
      "--json"
    );
    assert.equal(replacement.status, 0, `${replacement.stderr}\n${replacement.stdout}`);
    assert.equal(
      Schema.decodeUnknownSync(TagResult)(JSON.parse(replacement.stdout)).tag.tag.termId,
      "term-brand-other"
    );

    const missingTag = workspace.run("tag", "show", "absent", "--json");
    assert.notEqual(missingTag.status, 0);
    assert.equal(
      Schema.decodeUnknownSync(CommandFailure)(JSON.parse(missingTag.stdout)).error.message,
      "Tag not found: #absent"
    );
  });

  test("preserves nested hierarchy when a governance filter omits the parent", () => {
    for (const args of [
      ["tag", "create", "parent"],
      ["tag", "create", "child", "--parent", "parent"],
      ["tag", "create", "grandchild", "--parent", "parent/child"],
    ] as const) {
      const result = workspace.run(...args);
      assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
    }
    createTerm("Hierarchy", "concept", "term-concept-hierarchy");
    for (const tag of ["parent/child", "parent/child/grandchild"]) {
      const result = workspace.run("tag", "govern", tag, "--term", "term-concept-hierarchy");
      assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
    }

    const tree = workspace.run("tag", "list", "--governed", "--tree");
    assert.equal(tree.status, 0, tree.stderr);
    assert.match(tree.stdout, /^#parent\/child .*\[governed:/m);
    assert.match(tree.stdout, /^ {2}#parent\/child\/grandchild .*\[governed:/m);
  });
});
