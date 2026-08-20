# Provisional Tag Semantics

AeroGraph supports legacy exact-ID tags and tags associated with governed terms. Governed terminology can be inspected, aliased, deprecated, merged, and audited through the `aerograph term` commands.

## Setup and Safety

Terms can be created without an ID (the registry generates one), or with an explicit stable ID. Aliases are repeatable CLI flags:

```bash
aerograph term create AeroGraph --kind brand --alias "AeroGraph Project" --alias "Project Memory" --json
aerograph tag govern aerograph --term AeroGraph --kind brand
aerograph tag list --governed
aerograph tag list --ungoverned --json
```

Governance changes only term ownership; tag IDs, entity-tag attachments, entities, and relationships are preserved. Reassignment is compare-and-set: `--replace` names the expected current owner and is required for changing an already governed tag. Exact term IDs take precedence over names, and `--kind` only disambiguates names. `term create` and the `tag govern`, `tag show`, and `tag list` operations support `--json` with an `ok` and `command` envelope; failures use the corresponding error envelope.

## Setup and Safety

Terms can be created without an ID (the registry generates one), or with an explicit stable ID. Aliases are repeatable CLI flags:

```bash
kioku term create Kioku --kind brand --alias "Kioku Project" --alias "Project Memory" --json
kioku tag govern kioku --term Kioku --kind brand
kioku tag list --governed
kioku tag list --ungoverned --json
```

Governance changes only term ownership; tag IDs, entity-tag attachments, entities, and relationships are preserved. Reassignment is compare-and-set: `--replace` names the expected current owner and is required for changing an already governed tag. Exact term IDs take precedence over names, and `--kind` only disambiguates names. `term create` and the `tag govern`, `tag show`, and `tag list` operations support `--json` with an `ok` and `command` envelope; failures use the corresponding error envelope.

## Current Behavior

- A selector matching a canonical, alias, or deprecated term name resolves to every tag governed by that stable term ID.
- A merged term's historical names redirect to the active destination term and its governed tags.
- A deprecated term continues resolving its own governed tags; an optional replacement is advisory rather than a redirect.
- A selector that does not match a registered term retains exact tag-ID behavior.
- Exact stable IDs take precedence. Name lookup is kind-scoped, and unqualified cross-kind ambiguity must be resolved explicitly.
- One governed selector matches any tag in that term; `aerograph query --tags a,b` intersects the two selector groups.
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

- `aerograph`: AeroGraph product or system-level notes.
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
- Should AeroGraph support tag groups or hierarchy, and if so, how should query semantics remain predictable?
- Should there be reserved tags for document roles such as `adr`, `decision`, `constraint`, `open-question`, and `guide`?
- Should imported Markdown frontmatter seed tags into the graph?
