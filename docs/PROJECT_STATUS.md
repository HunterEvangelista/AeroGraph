# KIOKU Project Status

> **Last Updated:** March 3, 2026  
> **Phase:** 1 Complete, Phase 2 In Progress  
> **Build Status:** Passing

---

## Overview

KIOKU is a version-controlled knowledge platform that organizes project knowledge (requirements, architecture, code, decisions) into a unified, tagged graph. The v1 focus is AI-assisted codebase onboarding via CLI.

**North Star Metric:** Time-to-informed-action - How quickly can any stakeholder go from question to confident action, with the right context and nothing more?

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | Bun |
| Monorepo | Turborepo + Bun workspaces |
| Core Logic | Effect (error handling, DI, services) |
| Validation | Effect Schema |
| CLI Framework | @effect/cli |
| Database | SQLite (bun:sqlite) |
| Linting | Biome |
| Testing | Vitest (configured, no tests yet) |
| LLM Integration | Vercel AI SDK (stubbed) |

---

## Project Structure

```
kioku/
├── packages/
│   ├── core/           # @kioku/core - Shared domain logic
│   │   └── src/
│   │       ├── domain/     # Entity, Tag, Link, Version schemas
│   │       ├── repository/ # Storage interfaces
│   │       ├── services/   # EntityService, TagService, GraphService
│   │       └── errors.ts   # Tagged error types
│   │
│   ├── cli/            # @kioku/cli - CLI application
│   │   └── src/
│   │       ├── commands/   # init, status, doc, tag
│   │       ├── db/         # SQLite implementations
│   │       ├── config.ts   # Workspace management
│   │       └── ui/         # Terminal helpers (placeholder)
│   │
│   └── ai/             # @kioku/ai - LLM integration (stub)
│       └── src/
│           ├── providers/  # AIProvider interface
│           ├── prompts/    # System prompts
│           └── structured/ # Output schemas
│
├── apps/               # Future desktop/web apps
├── DESIGN_DOC.md       # Full specification
└── PROJECT_STATUS.md   # This file
```

---

## Phase 1: Foundation - COMPLETE

### Implemented Features

| Feature | Status | Location |
|---------|--------|----------|
| Monorepo setup | Done | turbo.json, package.json |
| Domain models (Doc, CodeRef, Story, Diagram) | Done | core/src/domain/entity.ts |
| Tag model (hierarchical, aliases) | Done | core/src/domain/tag.ts |
| Link model (bidirectional relationships) | Done | core/src/domain/link.ts |
| Version model (append-only history) | Done | core/src/domain/version.ts |
| Repository interfaces | Done | core/src/repository/*.ts |
| SQLite implementations | Done | cli/src/db/*.ts |
| Full-text search (FTS5) | Done | cli/src/db/schema.ts |
| EntityService | Done | core/src/services/entity-service.ts |
| TagService (with hierarchy) | Done | core/src/services/tag-service.ts |
| GraphService (traversal, stats) | Done | core/src/services/graph-service.ts |
| Workspace management | Done | cli/src/config.ts |
| `kioku init` command | Done | cli/src/commands/init.ts |
| `kioku status` command | Done | cli/src/commands/status.ts |
| `kioku doc` commands | Done | cli/src/commands/doc.ts |
| `kioku tag` commands | Done | cli/src/commands/tag.ts |
| AI package structure | Done | ai/src/*.ts |

### CLI Commands Available

```bash
# Workspace
kioku init [path]              # Initialize .kioku directory
kioku status                   # Show workspace stats

# Documents
kioku doc create <title> [-c content] [-t tags]
kioku doc show <id>
kioku doc list [-t tag] [-s search]
kioku doc edit <id> [--title] [--content]
kioku doc delete <id> [-f]

# Tags
kioku tag create <name> [-p parent] [-d description]
kioku tag list [-s search] [--tree]
kioku tag show <tag-id>
kioku tag apply <entity-id> <tag>
kioku tag remove <entity-id> <tag>
kioku tag delete <tag-id> [-f]
```

### Database Schema

| Table | Purpose |
|-------|---------|
| entities | Current entity state (type, title, content, metadata) |
| tags | Tag definitions with hierarchy (parent_id) |
| entity_tags | Many-to-many entity-tag junction |
| links | Relationships between entities |
| entity_versions | Version history snapshots |
| entities_fts | Full-text search virtual table |

---

## Phase 2: Graph Operations - IN PROGRESS

### Planned Features

| Feature | Priority | Status | Notes |
|---------|----------|--------|-------|
| `kioku link` / `unlink` | P0 | Not started | Repository complete, needs CLI |
| `kioku story` commands | P0 | Not started | Entity type exists |
| `kioku code-ref` commands | P0 | Not started | Entity type exists |
| `kioku query --tags` | P0 | Not started | GraphService has traversal |
| `kioku history <id>` | P1 | Not started | VersionRepository complete |
| `kioku context --tags` | P1 | Not started | Export for LLM context |
| `kioku import markdown` | P1 | Not started | Parse frontmatter |
| `kioku diagram` commands | P1 | Not started | Entity type exists |

### Implementation Order (Recommended)

1. **Link commands** - Wire existing LinkRepository to CLI
2. **Story/CodeRef commands** - Follow doc.ts pattern
3. **Query command** - Use GraphService.findByTagPath + getRelatedEntities
4. **History command** - Wire VersionRepository, auto-version on updates
5. **Context export** - Markdown formatter for query results
6. **Import command** - Parse markdown with YAML frontmatter

---

## Phase 3: AI Integration - NOT STARTED

### Planned Features

| Feature | Priority | Status |
|---------|----------|--------|
| Vercel AI SDK integration | P0 | Stubbed |
| Onboarding agent | P0 | Not started |
| Query agent (NL to graph) | P0 | Not started |
| Diagram generation | P1 | Not started |
| CLI UX polish | P1 | Not started |

### AI Package Current State

- `AIProvider` interface defined but returns "not implemented"
- System prompts written for onboarding/query agents
- Structured output schemas defined (OnboardingResult, QueryResult)

---

## Stretch Goals

| Feature | Status |
|---------|--------|
| Obsidian vault import | Not started |
| Interactive REPL (`kioku interactive`) | Not started |
| MCP server (read-only) | Not started |
| ASCII graph visualization (`kioku graph`) | Not started |

---

## Known Issues & Technical Debt

### Code Quality

| Issue | Priority | Notes |
|-------|----------|-------|
| No tests | High | Vitest configured but no test files |
| Duplicate `makeServiceLayers()` | Medium | In doc.ts and tag.ts |
| UI helpers empty | Low | cli/src/ui/index.ts placeholder |
| No progress spinners | Low | Long operations have no feedback |
| No interactive prompts | Low | --force flag exists, no actual prompts |

### Architectural Notes

- Version history repository complete but not wired to auto-create versions on entity updates
- Link commands not exposed despite complete repository implementation
- Story, CodeRef, Diagram entity types defined but no CLI commands

### Effect/TypeScript Discoveries

- Effect Schema uses branded types requiring careful handling
- `@effect/cli` uses `Option` type for optional args - convert with `Option.getOrUndefined()`
- Custom errors use `Data.TaggedError` class pattern
- CLI options must come BEFORE positional arguments
- Disabled Biome's `useLiteralKeys` due to conflict with `noPropertyAccessFromIndexSignature`

---

## File Reference

### Core Domain (packages/core/src/)

| File | Lines | Description |
|------|-------|-------------|
| domain/entity.ts | 156 | Doc, CodeRef, Story, Diagram schemas |
| domain/tag.ts | 48 | Tag schema with hierarchy |
| domain/link.ts | 66 | Link types and relationships |
| domain/version.ts | 46 | Version history schema |
| errors.ts | 97 | Tagged error types |

### Core Services (packages/core/src/services/)

| File | Lines | Description |
|------|-------|-------------|
| entity-service.ts | 98 | Entity CRUD wrapper |
| tag-service.ts | 139 | Tag ops with ensureHierarchy() |
| graph-service.ts | 235 | Traversal, stats, findPath |

### CLI Commands (packages/cli/src/commands/)

| File | Lines | Description |
|------|-------|-------------|
| init.ts | 49 | Workspace initialization |
| status.ts | 68 | Graph statistics |
| doc.ts | 393 | Document CRUD |
| tag.ts | 436 | Tag management |

### CLI Database (packages/cli/src/db/)

| File | Lines | Description |
|------|-------|-------------|
| schema.ts | 103 | DDL with FTS5 |
| client.ts | 102 | Connection management |
| entity-repository.ts | 414 | Entity SQLite impl |
| tag-repository.ts | 351 | Tag SQLite impl |
| link-repository.ts | 315 | Link SQLite impl |
| version-repository.ts | 258 | Version SQLite impl |

---

## Quick Start

```bash
# Install dependencies
bun install

# Build all packages
bun run build

# Initialize workspace in a project
cd /path/to/project
kioku init

# Check status
kioku status

# Create a doc
kioku doc create "Architecture Overview" -c "System design..." -t architecture

# Apply tags
kioku tag create "backend" -d "Backend services"
kioku tag apply <doc-id> backend
```

---

## Next Session Checklist

When resuming development:

1. [ ] Run `bun run build` to verify clean build
2. [ ] Run `bun run lint` to check for issues
3. [ ] Review this document for current state
4. [ ] Pick next feature from Phase 2 table
5. [ ] Consider adding tests for completed features
