# Kioku

Kioku is a local-first knowledge platform for codebases. It models docs, stories, code references, diagrams, tags, and links as a shared graph so humans and AI agents can retrieve the right context quickly.

## What It Is

- A tagged knowledge graph for project knowledge
- Local-first storage with SQLite
- A shared core library for domain logic and graph operations
- A CLI for creating and querying knowledge in a workspace

## Tags and Terms

A **tag** is a label attached to saved items such as documents, stories, and code references.

A **term** records what a name means. It lets Kioku treat a current name, an older name, and other spellings as the same thing. This is useful when a project, package, feature, or API is renamed.

For example, before a project rename Kioku might store:

```text
Term:
  ID:           term-company-name
  Kind:         brand
  Current name: AcmeCorp

Tag:
  ID:        acme-corp
  Name:      AcmeCorp
  Term:      term-company-name

Document:
  doc-123 -> tag ID acme-corp
```

After renaming it to AeroGraph:

```text
Term:
  ID:           term-company-name
  Current name: AeroGraph
  Older name:   AcmeCorp

Tag:
  ID:        acme-corp
  Name:      AeroGraph
  Term:      term-company-name

Document:
  doc-123 -> tag ID acme-corp
```

The document still points to the same tag. Only the displayed name changes. Searching for either `AcmeCorp` or `AeroGraph` finds the same material.

### Migrating Terms

Use a term migration when something is renamed. Kioku updates the name without disconnecting documents from their tags.

Kioku does not guess which tags belong to a name. Before running a rename, create the term and connect the existing tags to it.

Always preview a migration first:

```bash
kioku migrate brand AcmeCorp AeroGraph --dry-run
```

The dry run shows what would change without saving anything. After reviewing it, apply the rename:

```bash
kioku migrate brand AcmeCorp AeroGraph \
  --apply \
  --reason "Project rename" \
  --applied-by "your-name"
```

Kioku applies the rename as one operation: either everything succeeds or nothing changes. It also saves a record of what changed, why, and who applied it.

### Preparing Existing Tags for a Rename

First, find tags that are not connected to a term:

```bash
kioku tag list --ungoverned
```

Then create the term, connect the existing tag, and check the result:

```bash
kioku term create Kioku --kind brand --alias "Kioku Project"
kioku tag govern kioku --term Kioku --kind brand
kioku tag show kioku
```

Kioku creates the term ID for you. Use `--id` only when an import or another tool requires a specific ID.

If a tag is already connected to the wrong term, name its current term with `--replace`:

```bash
kioku tag govern kioku --term "Correct Name" --replace "Current Name"
```

Kioku refuses the change if `Current Name` is not the tag's current term. This prevents scripts or stale commands from overwriting a newer choice. Add `--json` to these commands when calling them from another tool.

### Managing Terms Over Time

List terms, view their names, or see their change history:

```bash
kioku term list --kind api
kioku term show "Legacy Client" --kind package
kioku term audit term-package-client --json
kioku term alias term-package-client "old-client"
```

Deprecate a term when it should no longer be used for new work. Existing tags and searches keep working. You can also suggest a replacement:

```bash
kioku term deprecate "Legacy Client" \
  --kind package \
  --replacement "Platform Client" \
  --dry-run

kioku term deprecate "Legacy Client" \
  --kind package \
  --replacement "Platform Client" \
  --apply \
  --reason "Client sunset"
```

Merge two terms when they were created separately but mean the same thing. Kioku moves their tags under one term without changing the tags or their attached documents:

```bash
kioku term merge "Duplicate API" "Canonical API" --kind api --dry-run
kioku term merge "Duplicate API" "Canonical API" --kind api --apply
```

Both commands require `--dry-run` to preview the change or `--apply` to save it. Add `--kind` when the same name is used for more than one kind of term.

After a rename, searches for either the old or new name find the same saved material:

```bash
kioku query --tags AcmeCorp
kioku query --tags AeroGraph
kioku context --tags AcmeCorp --canonical-terms
```

## Repo Layout

- `packages/core`: shared domain models, repositories, services, and graph logic
- `packages/cli`: the `kioku` CLI and SQLite-backed implementations
- `packages/ai`: AI integration package built on top of the core model
- `apps`: future desktop and web clients
- `docs`: product and project documentation, including `docs/DESIGN_DOC.md`


Common workspace commands:

```bash
bun run build
bun run typecheck
bun run test
```
