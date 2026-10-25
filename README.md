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

AeroGraph is Bun-first and supports two production runtimes:

```bash
# Preferred: Bun 1.1.38 or later
bunx --bun aerograph --version

# Supported: Node.js 24 or later
npx aerograph --version
```

The npm executable uses a Node.js shebang for compatibility with npm, `npx`, and global
package installations. `bunx --bun` explicitly selects Bun instead. Installing Bun does not
silently change the runtime used by an existing Node.js workflow.

To install the Node.js executable globally:

```bash
npm install --global aerograph
```

The remaining examples use `aerograph` for readability. When running without a global
installation, replace it with your selected runner:

```bash
bunx --bun aerograph status  # Bun
npx aerograph status         # Node.js
```

### Upgrading From a Bun-Only Alpha

Earlier AeroGraph alphas installed `aerograph` with a Bun shebang. After upgrading to the
dual-runtime release, the plain installed `aerograph` command requires Node.js 24 or later.
The graph format and CLI commands remain compatible. On a Bun-only machine, invoke the same
package with `bunx --bun aerograph`.

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

Point to the code the decision explains with a code reference:

```bash
aerograph code-ref add --title "Session TTL" \
  --file src/session.ts \
  --symbol SESSION_TTL \
  --tag authentication
```

Then link the document to it. Each `create` and `add` command prints the record's ID; the first eight characters are enough:

```bash
aerograph link 825c7515 32aa3643 --type references
```

Link types are `references`, `related_to`, `parent_of`, `child_of`, `blocks`, and `blocked_by`. To see what is connected to a record:

```bash
aerograph next 32aa3643 --related
```

### Retrieve Context

Use `query` to find project knowledge for yourself:

```bash
aerograph query --tags authentication
```

Use `context` when you want agent-ready Markdown:

```bash
aerograph context --tags authentication
```

```markdown
# AeroGraph Context: Tags #authentication

Agent-ready project memory exported from AeroGraph.

## Code References

### Session TTL

- ID: 32aa3643-5cfa-4021-bdfe-df6260ba5176
- Type: code_ref
- Location: src/session.ts
- Tags: #authentication

## Related Docs

### Authentication constraint

- ID: 825c7515-ec88-4a98-8b56-fc139b2d75eb
- Type: doc
- Tags: #authentication

Sessions expire after 30 minutes.
```

Paste that into your agent's prompt, or let the agent run `aerograph context` itself.

## Tags and Terms

**Tags** label knowledge by topic. A document and a code reference tagged `authentication`, for example, can be found together even though they are different kinds of records.

**Terms** keep names consistent as a project changes. Suppose a company named `AcmeCorp` is also called `Acme Corp` in older documents. A term records those names as the same concept. If the company later becomes `AeroGraph`, the term can keep `AcmeCorp` as an older name so either name still leads to the relevant project knowledge.

Manage terms with `aerograph term` (`create`, `alias`, `merge`, `deprecate`, `audit`). Run `aerograph term --help` for details.

## License

AeroGraph is available under the [Apache License 2.0](LICENSE).
