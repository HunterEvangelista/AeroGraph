# AeroGraph

AeroGraph is a local-first knowledge platform for codebases. It models docs, stories, code references, diagrams, tags, and links as a shared graph so humans and AI agents can retrieve the right context quickly.

## What It Is

- A tagged knowledge graph for project knowledge
- Local-first storage with SQLite
- A shared core library for domain logic and graph operations
- A CLI for creating and querying knowledge in a workspace

## Tags and Terms

A **tag** is a label attached to saved items such as documents, stories, and code references.

A **term** records what a name means. It lets AeroGraph treat a current name, an older name, and other spellings as the same thing. This is useful when a project, package, feature, or API is renamed.

For example, before a project rename AeroGraph might store:

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

Use a term migration when something is renamed. AeroGraph updates the name without disconnecting documents from their tags.

AeroGraph does not guess which tags belong to a name. Before running a rename, create the term and connect the existing tags to it.

Always preview a migration first:

```bash
aerograph migrate brand AcmeCorp AeroGraph --dry-run
```

The dry run shows what would change without saving anything. After reviewing it, apply the rename:

```bash
aerograph migrate brand AcmeCorp AeroGraph \
  --apply \
  --reason "Project rename" \
  --applied-by "your-name"
```

AeroGraph applies the rename as one operation: either everything succeeds or nothing changes. It also saves a record of what changed, why, and who applied it.

### Preparing Existing Tags for a Rename

First, find tags that are not connected to a term:

```bash
aerograph tag list --ungoverned
```

Then create the term, connect the existing tag, and check the result:

```bash
aerograph term create AcmeCorp --kind brand --alias "Acme Corp"
aerograph tag govern acme-corp --term AcmeCorp --kind brand
aerograph tag show acme-corp
```

AeroGraph creates the term ID for you. Use `--id` only when an import or another tool requires a specific ID.

If a tag is already connected to the wrong term, name its current term with `--replace`:

```bash
aerograph tag govern acme-corp --term "Correct Name" --replace "Current Name"
```

AeroGraph refuses the change if `Current Name` is not the tag's current term. This prevents scripts or stale commands from overwriting a newer choice. Add `--json` to these commands when calling them from another tool.

### Managing Terms Over Time

List terms, view their names, or see their change history:

```bash
aerograph term list --kind api
aerograph term show "Legacy Client" --kind package
aerograph term audit term-package-client --json
aerograph term alias term-package-client "old-client"
```

Deprecate a term when it should no longer be used for new work. Existing tags and searches keep working. You can also suggest a replacement:

```bash
aerograph term deprecate "Legacy Client" \
  --kind package \
  --replacement "Platform Client" \
  --dry-run

aerograph term deprecate "Legacy Client" \
  --kind package \
  --replacement "Platform Client" \
  --apply \
  --reason "Client sunset"
```

Merge two terms when they were created separately but mean the same thing. AeroGraph moves their tags under one term without changing the tags or their attached documents:

```bash
aerograph term merge "Duplicate API" "Canonical API" --kind api --dry-run
aerograph term merge "Duplicate API" "Canonical API" --kind api --apply
```

Both commands require `--dry-run` to preview the change or `--apply` to save it. Add `--kind` when the same name is used for more than one kind of term.

After a rename, searches for either the old or new name find the same saved material:

```bash
aerograph query --tags AcmeCorp
aerograph query --tags AeroGraph
aerograph context --tags AcmeCorp --canonical-terms
```

## Repo Layout

- `packages/core`: shared domain models, repositories, services, and graph logic
- `packages/cli`: the `aerograph` CLI and SQLite-backed implementations
- `packages/ai`: AI integration package built on top of the core model
- `apps`: future desktop and web clients
- `docs`: product and project documentation, including `docs/DESIGN_DOC.md`


Common workspace commands:

```bash
bun run build
bun run typecheck
bun run test
```
