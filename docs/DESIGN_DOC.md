# Design Document: KIOKU

## 1. Problem Statement & Vision

### Problem

Product knowledge—requirements, architecture, code, and decisions—is fragmented across disconnected tools with no shared structure or version control. Changes happen ad-hoc, docs go stale, and neither humans nor AI agents can reliably answer "What is the current, canonical understanding of how X works?"

### Vision

A version-controlled knowledge platform where epics, stories, documentation, system designs, and code references exist as a unified, tagged graph. Every change goes through an explicit workflow, ensuring the graph is always the canonical source of truth. AI agents traverse this graph to retrieve precise context; humans navigate it to understand the system at any level.

### Wedge (v1 Focus)

AI-assisted codebase onboarding that analyzes a repo and, through guided conversation, builds a tagged knowledge graph connecting code, concepts, and documentation—giving any stakeholder (human or AI) precise, relevant context with minimal noise.

### North Star Metric

**Time-to-informed-action**: How quickly can any stakeholder go from question to confident action, with the right context and nothing more?

---

## 2. Core Concepts

### 2.1 Knowledge Graph

The central data structure is a **tagged knowledge graph** where:

- **Entities** are the nodes (Docs, CodeRefs, Stories, Diagrams)
- **Tags** are the primary connective tissue enabling cross-cutting queries
- **Links** are explicit relationships between entities (references, parent/child, blocks/blocked-by)

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐  │
│  │  Epics   │◄──►│  Stories │◄──►│   Docs   │◄──►│   Code   │  │
│  │          │    │          │    │  (Wiki)  │    │   Refs   │  │
│  └────┬─────┘    └────┬─────┘    └────┬─────┘    └────┬─────┘  │
│       │               │               │               │         │
│       └───────────────┴───────────────┴───────────────┘         │
│                           │                                     │
│                      [ TAGS ]                                   │
│              #checkout  #payments  #auth                        │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              DIAGRAMS (Mermaid)                          │   │
│  │         Generated from graph OR manually authored        │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Tags

Tags are the primary mechanism for connecting related entities across types.

**Properties:**

- Hierarchical: `#checkout/rate-limiting`, `#auth/oauth`
- First-class entities (can have descriptions, aliases)
- Many-to-many relationship with all entity types

**Query examples:**

- "Everything tagged `#checkout`" → returns docs, code refs, stories
- "Intersection of `#checkout` AND `#rate-limiting`" → precise context

### 2.3 Version Control (v1: Simplified)

For v1, versioning is **append-only history per entity**:

- Every mutation creates a new version
- Full history is preserved
- No branching/merging in v1 (deferred to v2)
- Each version has: timestamp, author, change type, previous version reference

**Future (v2+):**

- PR-like workflow for proposing changes
- Branching for exploratory work
- Entity-level diffs and merge resolution

---

## 3. Architecture

### 3.1 System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENTS                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐      │
│   │    CLI      │     │  Desktop    │     │    Web      │      │
│   │   (Bun +    │     │  (Tauri +   │     │ (TanStack   │      │
│   │   Effect)   │     │   React)    │     │   Start)    │      │
│   └──────┬──────┘     └──────┬──────┘     └──────┬──────┘      │
│          │                   │                   │              │
│          │    ┌──────────────┴──────────────┐    │              │
│          │    │      Shared Core Library    │    │              │
│          │    │   (Effect + Domain Logic)   │    │              │
│          │    └──────────────┬──────────────┘    │              │
│          │                   │                   │              │
│          └───────────────────┼───────────────────┘              │
│                              │                                  │
│                              ▼                                  │
│                    ┌─────────────────┐                          │
│                    │  SQLite (Local) │                          │
│                    └─────────────────┘                          │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                      AGENT LAYER                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                   LLM Integration                       │   │
│   │              (Vercel AI SDK - provider agnostic)        │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│   ┌───────────────┐  ┌───────────────┐  ┌───────────────┐      │
│   │  Onboarding   │  │    Query      │  │   Proposal    │      │
│   │    Agent      │  │    Agent      │  │    Agent      │      │
│   └───────────────┘  └───────────────┘  └───────────────┘      │
│                                                                 │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                   MCP Server                            │   │
│   │           (External agent integration)                  │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Local-First Architecture

For v1, everything runs locally:

1. **CLI** is the primary interface
2. **SQLite** stores all data locally
3. **No server required** for basic operation
4. **Future**: Sync layer to push/pull from remote Postgres

### 3.3 Shared Core Library

A TypeScript library (`@kioku/core`) containing:

- Domain models (Entity types, Tag, Version)
- Repository interfaces (storage-agnostic)
- Graph traversal algorithms
- Validation logic (Effect Schema)

This core is shared across CLI, Desktop, and Web clients.

---

## 4. Tech Stack

| Layer              | Technology                     | Notes                                          |
| ------------------ | ------------------------------ | ---------------------------------------------- |
| **CLI Runtime**    | Bun                            | Fast, native TypeScript, good SQLite support   |
| **CLI Framework**  | Effect + custom                | Type-safe, composable commands                 |
| **Desktop App**    | Tauri + React                  | Future (v2), Linear-like UX                    |
| **Web App**        | TanStack Start                 | Future (v2), shared React components           |
| **Core Logic**     | Effect                         | Error handling, services, dependency injection |
| **API (future)**   | tRPC + Effect                  | End-to-end type safety, no GraphQL             |
| **Local Database** | SQLite (via `bun:sqlite`)      | Embedded, fast, portable                       |
| **Remote Database**| PostgreSQL                     | Future sync target                             |
| **Validation**     | Effect Schema                  | Runtime + static type validation               |
| **LLM Integration**| Vercel AI SDK                  | Provider-agnostic (OpenAI, Anthropic, Ollama)  |
| **Diagrams**       | Mermaid                        | Text-based, version-controllable               |

---

## 5. v1 Scope (PoC)

### 5.1 Goals

- Prove the core graph model works for organizing project knowledge
- Demonstrate AI-assisted onboarding (repo → knowledge graph)
- Enable precise context retrieval for a query
- Single user, local-only, CLI-first

### 5.2 Features

| Feature                | Description                                                | Priority |
| ---------------------- | ---------------------------------------------------------- | -------- |
| **Graph CRUD**         | Create, read, update, delete entities (Docs, CodeRefs, Stories) | P0  |
| **Tagging**            | Add/remove tags, hierarchical tags, tag search             | P0       |
| **Linking**            | Bidirectional links between entities                       | P0       |
| **Onboarding Agent**   | Guided interview to build initial graph from repo          | P0       |
| **Query Command**      | "What do I need to know about #X?" → relevant entities     | P0       |
| **Version History**    | View history of any entity                                 | P1       |
| **Diagram Generation** | Generate Mermaid diagrams from graph relationships         | P1       |
| **Import Markdown**    | Import existing markdown docs with frontmatter             | P1       |
| **Export Context**     | Export query results as markdown (for LLM context)         | P1       |

### 5.3 Out of Scope (v1)

- Multi-user / collaboration
- Remote sync / Postgres backend
- Desktop or Web UI
- PR/review workflow for changes
- GitHub integration
- Bidirectional diagram editing

---

## 6. Data Model

### 6.1 Entity Types

```typescript
// Base entity (all entities extend this)
interface BaseEntity {
  id: string;                    // UUID
  type: EntityType;              // 'doc' | 'code_ref' | 'story' | 'diagram'
  title: string;
  content: string;               // Markdown for docs, path+range for code_refs
  tags: string[];                // Tag IDs
  links: Link[];                 // Outbound links to other entities
  createdAt: Date;
  updatedAt: Date;
  version: number;               // Incrementing version number
}

type EntityType = 'doc' | 'code_ref' | 'story' | 'diagram';

// Document (wiki page, design doc, decision record)
interface Doc extends BaseEntity {
  type: 'doc';
  content: string;               // Markdown
}

// Code Reference (pointer to code in a repo)
interface CodeRef extends BaseEntity {
  type: 'code_ref';
  repoPath: string;              // Relative path to repo root
  filePath: string;              // Path within repo
  startLine?: number;            // Optional line range
  endLine?: number;
  commitHash?: string;           // Pin to specific commit (optional)
}

// Story (work item, like a Linear issue)
interface Story extends BaseEntity {
  type: 'story';
  status: StoryStatus;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  parentId?: string;             // Epic or parent story
}

type StoryStatus = 'backlog' | 'todo' | 'in_progress' | 'done' | 'cancelled';

// Diagram (Mermaid source, rendered client-side)
interface Diagram extends BaseEntity {
  type: 'diagram';
  diagramType: 'flowchart' | 'sequence' | 'erd' | 'classDiagram' | 'other';
  source: string;                // Mermaid source code
  generatedFrom?: string[];      // Entity IDs if auto-generated
}
```

### 6.2 Tags

```typescript
interface Tag {
  id: string;                    // e.g., "checkout" or "checkout/rate-limiting"
  name: string;                  // Display name
  description?: string;
  parentId?: string;             // For hierarchical tags
  aliases?: string[];            // Alternative names
  createdAt: Date;
}
```

### 6.3 Links

```typescript
interface Link {
  id: string;
  sourceId: string;              // Entity ID
  targetId: string;              // Entity ID
  type: LinkType;
  createdAt: Date;
}

type LinkType = 
  | 'references'                 // Generic reference
  | 'parent_of'                  // Hierarchical (epic → story)
  | 'child_of'                   // Inverse of parent_of
  | 'blocks'                     // Dependency
  | 'blocked_by'                 // Inverse of blocks
  | 'related_to';                // Loose association
```

### 6.4 Versions

```typescript
interface EntityVersion {
  id: string;
  entityId: string;
  version: number;
  data: BaseEntity;              // Snapshot of entity at this version
  changeType: 'create' | 'update' | 'delete';
  changedFields?: string[];      // Which fields changed
  createdAt: Date;
  authorId?: string;             // Future: user ID
}
```

### 6.5 SQLite Schema

```sql
-- Entities table (stores current state)
CREATE TABLE entities (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,            -- 'doc' | 'code_ref' | 'story' | 'diagram'
  title TEXT NOT NULL,
  content TEXT,
  metadata TEXT,                 -- JSON for type-specific fields
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);

-- Tags table
CREATE TABLE tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  parent_id TEXT REFERENCES tags(id),
  aliases TEXT,                  -- JSON array
  created_at TEXT NOT NULL
);

-- Entity-Tag junction table
CREATE TABLE entity_tags (
  entity_id TEXT REFERENCES entities(id) ON DELETE CASCADE,
  tag_id TEXT REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (entity_id, tag_id)
);

-- Links table
CREATE TABLE links (
  id TEXT PRIMARY KEY,
  source_id TEXT REFERENCES entities(id) ON DELETE CASCADE,
  target_id TEXT REFERENCES entities(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Version history table
CREATE TABLE entity_versions (
  id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  data TEXT NOT NULL,            -- JSON snapshot
  change_type TEXT NOT NULL,
  changed_fields TEXT,           -- JSON array
  created_at TEXT NOT NULL,
  UNIQUE(entity_id, version)
);

-- Indexes for common queries
CREATE INDEX idx_entities_type ON entities(type);
CREATE INDEX idx_entity_tags_tag ON entity_tags(tag_id);
CREATE INDEX idx_links_source ON links(source_id);
CREATE INDEX idx_links_target ON links(target_id);
CREATE INDEX idx_entity_versions_entity ON entity_versions(entity_id);
```

---

## 7. Agent Architecture

### 7.1 Onboarding Agent

The onboarding agent builds an initial knowledge graph from an existing codebase through guided conversation.

**Flow:**

```
┌─────────────────────────────────────────────────────────────────┐
│                    ONBOARDING FLOW                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. SCAN                                                        │
│     │                                                           │
│     ├─► Analyze directory structure                             │
│     ├─► Identify package.json, README, config files             │
│     ├─► Detect frameworks/languages                             │
│     └─► Find existing documentation                             │
│                                                                 │
│  2. INTERVIEW                                                   │
│     │                                                           │
│     ├─► "I found 8 top-level directories. Which are services    │
│     │    vs. libraries vs. infrastructure?"                     │
│     │                                                           │
│     ├─► "I see 'checkout', 'cart', 'inventory' together often.  │
│     │    Should I group these as #commerce?"                    │
│     │                                                           │
│     ├─► "There's an ARCHITECTURE.md from 2023. Is it current?"  │
│     │                                                           │
│     └─► "What are the 3-5 core concepts a new dev should know?" │
│                                                                 │
│  3. GENERATE                                                    │
│     │                                                           │
│     ├─► Create Doc entities for key concepts                    │
│     ├─► Create CodeRef entities for important files/dirs        │
│     ├─► Suggest tag taxonomy                                    │
│     ├─► Link related entities                                   │
│     └─► Generate overview diagram (Mermaid)                     │
│                                                                 │
│  4. REVIEW                                                      │
│     │                                                           │
│     ├─► Present generated graph summary                         │
│     ├─► User confirms or edits                                  │
│     └─► Commit to database                                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Implementation Notes:**

- Uses Vercel AI SDK for LLM calls
- Structured output (JSON mode) for entity generation
- Streaming for long responses
- Checkpointing so user can pause/resume

### 7.2 Query Agent

Retrieves relevant context from the graph based on a natural language query.

**Flow:**

```
┌─────────────────────────────────────────────────────────────────┐
│                      QUERY FLOW                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Input: "What do I need to know to add rate limiting to        │
│          the checkout flow?"                                    │
│                                                                 │
│  1. PARSE                                                       │
│     └─► Extract concepts: [rate limiting, checkout]             │
│                                                                 │
│  2. MAP TO TAGS                                                 │
│     └─► Match to existing tags: #checkout, #rate-limiting,      │
│         #api-gateway                                            │
│                                                                 │
│  3. TRAVERSE GRAPH                                              │
│     └─► Find entities with these tags                           │
│     └─► Follow links to related entities (1-2 hops)             │
│     └─► Rank by relevance                                       │
│                                                                 │
│  4. SUMMARIZE                                                   │
│     └─► Return ranked list of entities                          │
│     └─► Optional: LLM-generated summary                         │
│                                                                 │
│  Output:                                                        │
│    - Doc: "Checkout Architecture" (#checkout)                   │
│    - Doc: "Rate Limiting Strategy" (#rate-limiting)             │
│    - CodeRef: src/middleware/rateLimiter.ts                     │
│    - Story: "ARCH-123: Implement rate limiting" (done)          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 7.3 MCP Server (Future)

For integration with external AI agents (Cursor, Claude, etc.):

- Expose graph query as MCP tool
- Allow agents to traverse the knowledge graph
- Read-only in v1; write access in v2

---

## 8. CLI Commands

### 8.1 Proposed Interface

```bash
# Initialize a new kioku workspace in current directory
kioku init

# Onboarding: guided interview to build initial graph
kioku onboard [--repo <path>]

# Entity operations
kioku doc create "My Document"
kioku doc edit <id>
kioku doc show <id>
kioku doc list [--tag <tag>]

kioku code-ref add <file-path> [--lines <start>-<end>]
kioku code-ref list [--tag <tag>]

kioku story create "Story title"
kioku story edit <id>
kioku story list [--status <status>] [--tag <tag>]

# Tagging
kioku tag create <name> [--parent <parent-tag>] [--description "..."]
kioku tag list
kioku tag apply <entity-id> <tag>
kioku tag remove <entity-id> <tag>

# Linking
kioku link <source-id> <target-id> [--type <type>]
kioku unlink <source-id> <target-id>

# Querying
kioku query "What do I need to know about checkout?"
kioku query --tags checkout,payments
kioku query --related-to <entity-id>

# Context export (for LLM)
kioku context "Add rate limiting to checkout" --format markdown
kioku context --tags checkout --max-tokens 8000

# Diagrams
kioku diagram generate --tags checkout --type flowchart
kioku diagram show <id>

# History
kioku history <entity-id>
kioku history <entity-id> --version <n>

# Import
kioku import markdown <file-or-dir> [--tags <tags>]
kioku import obsidian <vault-path>

# Info
kioku status                   # Show graph stats
kioku graph                    # ASCII visualization of tag relationships
```

### 8.2 Interactive Mode

```bash
# Start interactive REPL
kioku interactive

# In REPL:
> query "how does auth work?"
> tag apply abc123 auth
> link abc123 def456 --type references
> exit
```

---

## 9. Project Structure

```
kioku/
├── packages/
│   ├── core/                    # Shared domain logic
│   │   ├── src/
│   │   │   ├── domain/          # Entity types, Tag, Link
│   │   │   ├── repository/      # Storage interfaces
│   │   │   ├── services/        # Business logic (Effect services)
│   │   │   ├── graph/           # Traversal algorithms
│   │   │   └── validation/      # Effect Schema definitions
│   │   └── package.json
│   │
│   ├── cli/                     # CLI application
│   │   ├── src/
│   │   │   ├── commands/        # Command implementations
│   │   │   ├── agents/          # Onboarding, Query agents
│   │   │   ├── db/              # SQLite repository implementation
│   │   │   ├── ui/              # Terminal UI helpers (prompts, tables)
│   │   │   └── index.ts         # Entry point
│   │   └── package.json
│   │
│   ├── ai/                      # LLM integration
│   │   ├── src/
│   │   │   ├── providers/       # Vercel AI SDK wrappers
│   │   │   ├── prompts/         # System prompts, templates
│   │   │   └── structured/      # Structured output schemas
│   │   └── package.json
│   │
│   └── mcp-server/              # MCP server (future)
│       └── ...
│
├── apps/
│   ├── desktop/                 # Tauri app (future)
│   └── web/                     # TanStack Start app (future)
│
├── turbo.json                   # Turborepo config
├── package.json                 # Workspace root
└── README.md
```

---

## 10. Development Phases

### Phase 1: Foundation (Week 1)

- [ ] Initialize monorepo (Turborepo + Bun workspaces)
- [ ] Set up `@kioku/core` with Effect
- [ ] Define domain models (Entity, Tag, Link, Version)
- [ ] Implement SQLite repository
- [ ] Basic CLI scaffolding (init, status)
- [ ] Entity CRUD commands (doc create/edit/show/list)
- [ ] Tagging commands (tag create/apply/remove)

### Phase 2: Graph Operations (Week 2)

- [ ] Implement linking (bidirectional)
- [ ] Graph traversal algorithms
- [ ] Query command (tag-based, relationship-based)
- [ ] Context export (markdown output for LLM)
- [ ] Version history (entity history, version show)
- [ ] Import command (markdown files)

### Phase 3: AI Integration (Week 3)

- [ ] Set up `@kioku/ai` with Vercel AI SDK
- [ ] Implement onboarding agent
  - Repo scanning
  - Guided interview flow
  - Entity generation
  - Tag suggestion
- [ ] Implement query agent (natural language → graph query)
- [ ] Diagram generation (Mermaid from graph)
- [ ] Polish CLI UX (colors, spinners, error handling)

### Stretch Goals (If Time Permits)

- [ ] Obsidian vault import
- [ ] Interactive REPL mode
- [ ] MCP server (basic read-only)
- [ ] ASCII graph visualization

---

## 11. Future Roadmap (v2+)

| Version | Features                                                                       |
| ------- | ------------------------------------------------------------------------------ |
| **v2**  | Desktop app (Tauri), Web app (TanStack Start), Multi-user local (shared SQLite)|
| **v3**  | Remote sync (PostgreSQL), Collaboration, PR workflow for changes               |
| **v4**  | GitHub adapter (code hosting integration), Real-time sync                      |
| **v5**  | Entity-level branching, Bidirectional diagram editing, Full enterprise features|

---

## 12. Open Risks & Mitigations

| Risk                                          | Likelihood | Impact | Mitigation                                                       |
| --------------------------------------------- | ---------- | ------ | ---------------------------------------------------------------- |
| **Onboarding agent produces low-quality output** | Medium  | High   | Extensive prompt engineering; human-in-the-loop review; iterative refinement |
| **Tag taxonomy becomes unwieldy**             | Medium     | Medium | Hierarchical tags; tag aliasing; periodic cleanup tooling        |
| **SQLite doesn't scale for large codebases**  | Low        | Medium | Pagination; lazy loading; future migration to Postgres           |
| **Effect learning curve slows development**   | Medium     | Medium | Start with simple patterns; reference Effect docs/examples       |
| **Vercel AI SDK limitations**                 | Low        | Low    | Abstract behind interface; swap providers if needed              |

---

## 13. Success Criteria (v1 PoC)

The PoC is successful if:

1. **Onboarding works**: Point at a real repo, answer 5-10 questions, get a useful initial graph
2. **Queries are precise**: Ask "What do I need to know about X?" and get relevant results (not a wall of text)
3. **Context export is useful**: Export context, paste into Claude/GPT, get better answers than without it
4. **It feels fast**: CLI commands respond in <500ms for typical operations
5. **You actually use it**: The tool provides enough value that you use it on a real project

---

## 14. Next Steps

1. **Confirm this design** - Any changes before implementation?
2. **Set up the repo** - Initialize monorepo structure
3. **Start Phase 1** - Foundation (core + CLI + SQLite)

---

*Document version: 1.0*
*Last updated: March 2026*
*Status: Ready for implementation*
