# Kioku

Kioku is a local-first knowledge platform for codebases. It models docs, stories, code references, diagrams, tags, and links as a shared graph so humans and AI agents can retrieve the right context quickly.

## What It Is

- A tagged knowledge graph for project knowledge
- Local-first storage with SQLite
- A shared core library for domain logic and graph operations
- A CLI for creating and querying knowledge in a workspace

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
