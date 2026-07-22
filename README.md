# Kioku

Kioku is a local-first knowledge platform for codebases. It models docs, stories, code references, diagrams, tags, and links as a shared graph so humans and AI agents can retrieve the right context quickly.

## What It Is

- A tagged knowledge graph for project knowledge
- Local-first storage with SQLite
- A shared core library for domain logic and graph operations
- A CLI for creating and querying knowledge in a workspace

## Tags and Terms

Tags and Terms are both canonical pieces of data in Kioku, but serve different purposes. 

A **tag** is attached to entities in the knowledge graph. Documents, stories, code references, and diagrams refer to a tag by its stable tag ID. Tags answer: "Which entities are classified with this label?"

A **term** is the governed concept behind one or more tags. It has a stable term ID, a kind such as `brand`, `project`, or `feature`, a canonical name, and registered alias or deprecated names. Terms answer: "What concept does this name refer to, and what should it be called now?"

For example, before a project rename the graph might contain:

```text
Term:
  ID:        term-company-name
  type:      Brand
  Canonical: AcmeCorp

Tag:
  ID:        acme-corp
  Name:      AcmeCorp
  Term:      term-company-name

Attachment:
  doc-123 -> tag "AcmeCorp"
```

After renaming the concept to AeroGraph:

```text
Term:
  ID:        term-company-name
  Canonical: AeroGraph
  Names:
    AeroGraph -> canonical
    AcmeCorp     -> deprecated

Tag:
  ID:        acme-corp
  Name:      AeroGraph
  Term:      term-company-name

Attachment:
  doc-123 -> tag "AcmeCorp"
```

The term ID, tag ID, entity ID, and entity-to-tag attachment do not change. This preserves graph relationships while allowing canonical terminology to evolve. Queries can resolve canonical, alias, and deprecated names to the same governed concept.

### Migrating Terms

Use a term migration when a concept is renamed rather than replacing tag strings directly. A migration updates the governed term and matching tags while preserving stable IDs and entity attachments.

Rename migrations do not create terms or infer tag ownership. The source term must already exist, and existing tags for that concept must be explicitly governed by it before migration. This preparation keeps semantic ownership separate from the rename itself.

Always preview a migration first:

```bash
kioku migrate brand AcmeCorp AeroGraph --dry-run
```

The dry run reports the term, tags, and entities that would be affected without writing changes. Apply the migration with optional audit context after reviewing the plan:

```bash
kioku migrate brand AcmeCorp AeroGraph \
  --apply \
  --reason "Project rename" \
  --applied-by "your-name"
```

Applying a rename performs the term, registered-name, tag, and migration-journal updates in one SQLite transaction. If any update fails, the complete migration is rolled back. Successful migrations record the old and new names, term ID, affected entity IDs, reason, actor, and application time in the durable migration journal.

Queries and context selection resolve canonical, alias, and deprecated term names to every tag governed by that term. Comma-separated selectors still intersect, while selectors that are not registered term names retain exact tag-ID behavior. Context can render governed tags using their current canonical names without rewriting entity titles or historical content:

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
