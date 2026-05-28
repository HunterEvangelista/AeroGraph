import { join } from "node:path";
import { Effect } from "effect";
import { makeDatabaseClient } from "../../db/client.js";

const workspacePath = process.argv[2];

if (!workspacePath) {
  throw new Error("Workspace path is required");
}

const dbPath = join(workspacePath, ".kioku", "kioku.db");
const timestamp = "2026-01-01T00:00:00.000Z";

const metadata = {
  codeRef: JSON.stringify({
    repoPath: workspacePath,
    filePath: "src/auth.ts",
    startLine: 10,
    endLine: 20,
    symbol: "authMiddleware",
  }),
  story: JSON.stringify({ status: "in_progress", priority: "high" }),
  diagram: JSON.stringify({ diagramType: "flowchart", source: "graph TD; auth-->session" }),
};

await Effect.runPromise(
  Effect.scoped(
    Effect.gen(function* () {
      const client = yield* makeDatabaseClient(dbPath);
      const { db } = client;

      const insertEntity = db.prepare(
        "INSERT INTO entities (id, type, title, content, metadata, created_at, updated_at, version) VALUES (?, ?, ?, ?, ?, ?, ?, 1)"
      );
      const insertTag = db.prepare(
        "INSERT INTO tags (id, name, description, parent_id, aliases, created_at) VALUES (?, ?, NULL, NULL, NULL, ?)"
      );
      const insertEntityTag = db.prepare(
        "INSERT INTO entity_tags (entity_id, tag_id) VALUES (?, ?)"
      );
      const insertLink = db.prepare(
        "INSERT INTO links (id, source_id, target_id, type, created_at) VALUES (?, ?, ?, ?, ?)"
      );

      insertEntity.run(
        "doc-auth-overview",
        "doc",
        "Auth Overview",
        "Canonical auth middleware notes.",
        null,
        timestamp,
        timestamp
      );
      insertEntity.run(
        "code-auth-middleware",
        "code_ref",
        "Auth Middleware",
        "Middleware checks authenticated sessions.",
        metadata.codeRef,
        timestamp,
        timestamp
      );
      insertEntity.run(
        "story-auth-hardening",
        "story",
        "Auth Hardening Story",
        "Tighten auth middleware guarantees.",
        metadata.story,
        timestamp,
        timestamp
      );
      insertEntity.run(
        "diagram-auth-flow",
        "diagram",
        "Auth Flow Diagram",
        "Auth request flow.",
        metadata.diagram,
        timestamp,
        timestamp
      );
      insertEntity.run(
        "doc-auth-only",
        "doc",
        "Auth Only Doc",
        "Tagged only with auth.",
        null,
        timestamp,
        timestamp
      );

      insertTag.run("auth", "auth", timestamp);
      insertTag.run("middleware", "middleware", timestamp);

      insertEntityTag.run("doc-auth-overview", "auth");
      insertEntityTag.run("doc-auth-overview", "middleware");
      insertEntityTag.run("code-auth-middleware", "auth");
      insertEntityTag.run("code-auth-middleware", "middleware");
      insertEntityTag.run("doc-auth-only", "auth");

      insertLink.run(
        "link-doc-code",
        "doc-auth-overview",
        "code-auth-middleware",
        "references",
        timestamp
      );
      insertLink.run(
        "link-story-doc",
        "story-auth-hardening",
        "doc-auth-overview",
        "blocks",
        timestamp
      );
      insertLink.run(
        "link-code-diagram",
        "code-auth-middleware",
        "diagram-auth-flow",
        "related_to",
        timestamp
      );
    })
  )
);
