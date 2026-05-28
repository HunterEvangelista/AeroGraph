# Provisional Tag Semantics

Kioku tags are currently lightweight labels, not governed vocabulary entries. This document records the working semantics until Kioku has a managed tag library with descriptions, owners, aliases, and lifecycle rules.

## Current Behavior

- Tags are exact string labels.
- `kioku query --tags a,b` means entity results must have both tag `a` and tag `b`.
- Tags do not imply hierarchy today.
- A tag like `editor/indexer` is a single exact tag, not equivalent to `editor` plus `indexer`.
- Tags should be lowercase kebab-case or simple lowercase nouns unless there is a strong reason otherwise.

## Naming Guidelines

- Prefer stable domain nouns: `editor`, `indexer`, `code-ref`, `adr`, `graph`.
- Prefer capability tags for product areas: `workflow`, `context`, `maintenance`, `symbols`.
- Avoid overly specific implementation details unless the tag is meant to retrieve implementation-specific docs.
- Avoid synonyms once a tag is in use; add the existing tag instead of inventing a near-duplicate.
- Use multiple exact tags instead of slash hierarchy for now.

## Useful Working Tags

- `kioku`: Kioku product or system-level notes.
- `product`: Product direction, value propositions, and workflow concepts.
- `editor`: Editor-facing behavior or integrations.
- `indexer`: File watching, parsing, symbol indexing, and graph refresh behavior.
- `graph`: Entity/link model usage and retrieval behavior.
- `code-ref`: Code reference entities and source anchors.
- `symbols`: Symbol-level anchors such as functions, classes, routes, or declarations.
- `context`: Working-set or active-context behavior.
- `workflow`: Developer workflow and command loop behavior.
- `agent`: Agent-facing context or retrieval workflows.
- `maintenance`: Refresh, drift detection, stale references, and repair behavior.

## Open Questions

- Should tags become first-class entities with descriptions and aliases?
- Should Kioku support tag groups or hierarchy, and if so, how should query semantics remain predictable?
- Should there be reserved tags for document roles such as `adr`, `decision`, `constraint`, `open-question`, and `guide`?
- Should imported Markdown frontmatter seed tags into the graph?
