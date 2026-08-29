# AeroGraph

AeroGraph helps you and your coding agent manage project knowledge that lives outside the code. It connects documents, code references, and stories so you can find the context behind a change.

## What It Is

- A tagged knowledge graph for project knowledge
- Local-first graphs that are scoped to your project
- A CLI for creating and querying project knowledge

## Getting Started

> [!NOTE]
> AeroGraph is currently in Alpha release and has no stable releases. `latest` points to the current alpha version.

### Installing AeroGraph

AeroGraph currently requires [Bun](https://bun.sh/) 1.1 or later. Once the package is published, install it with Bun:

```bash
bun add --global aerograph
```

The package installs the `aerograph` command. Confirm that the command is available:

```bash
aerograph --version
```

### Initialize a Project

Run `init` from the root of the project whose knowledge you want AeroGraph to manage:

```bash
aerograph init
```

For a project directory named `my-project`, initialization will confirm:

```text
Initializing AeroGraph project...
Creating database...

AeroGraph project initialized!

Project: my-project
```

Then confirm which project and graph are active:

```bash
aerograph status
```

The new project will begin with an empty graph:

```text
AeroGraph Project Status
========================================

Project: my-project

Graph Statistics
----------------------------------------
Entities: 0
  - Docs:      0
  - Code Refs: 0
  - Stories:   0
  - Diagrams:  0
Tags:     0
Links:    0
```

### Capture Project Knowledge

AeroGraph stores several kinds of project knowledge:

- **Documents** record decisions, constraints, guides, and other context that does not belong in source code.
- **Code references** point from that context to the code it explains.
- **Stories** track planned or completed work alongside the knowledge that shaped it.

Start with a real decision, constraint, or open question from your project rather than trying to document everything at once.

```bash
aerograph doc create "Authentication constraint" --tags authentication
```

AeroGraph opens `$VISUAL` or `$EDITOR` so you can write the document normally. Save and close the editor to add it to the graph.

For scripts or quick entries, provide the content directly:

```bash
aerograph doc create "Authentication constraint" \
  --tags authentication \
  --content "Sessions expire after 30 minutes."
```

### Organize and Connect It

Tags label related knowledge. Links describe how individual documents, code references, and stories relate to one another. Together they let you retrieve a useful part of the graph without reading the whole project history.

The sections below introduce tags and the terms that keep tag names consistent as a project changes.

### Retrieve Context

Use `query` to find project knowledge for yourself:

```bash
aerograph query --tags authentication
```

Use `context` when you want agent-ready Markdown:

```bash
aerograph context --tags authentication
```

This is only the outline of the first-run workflow. A complete quickstart will add a small working example, expected output, and the commands for tagging and linking its records.

## Tags and Terms

**Tags** label knowledge by topic. A document and a code reference tagged `authentication`, for example, can be found together even though they are different kinds of records.

**Terms** keep names consistent as a project changes. Suppose a company named `AcmeCorp` is also called `Acme Corp` in older documents. A term records those names as the same concept. If the company later becomes `AeroGraph`, the term can keep `AcmeCorp` as an older name so either name still leads to the relevant project knowledge.

Detailed workflows for renaming, merging, and retiring terms will live in the documentation.

## License

AeroGraph is available under the [Apache License 2.0](LICENSE).
