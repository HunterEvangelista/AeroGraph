import { join } from "node:path";
import { Effect } from "effect";
import { DatabaseClientLive, DatabaseClientTag } from "../../db/client";
import { entities, entityTags, links, tags } from "../../db/schema";

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
      const client = yield* DatabaseClientTag;
      const { drizzle } = client;

      drizzle
        .insert(entities)
        .values([
          {
            id: "doc-auth-overview",
            type: "doc",
            title: "Auth Overview",
            content: "Canonical auth middleware notes.",
            metadata: null,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
          {
            id: "code-auth-middleware",
            type: "code_ref",
            title: "Auth Middleware",
            content: "Middleware checks authenticated sessions.",
            metadata: metadata.codeRef,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
          {
            id: "story-auth-hardening",
            type: "story",
            title: "Auth Hardening Story",
            content: "Tighten auth middleware guarantees.",
            metadata: metadata.story,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
          {
            id: "diagram-auth-flow",
            type: "diagram",
            title: "Auth Flow Diagram",
            content: "Auth request flow.",
            metadata: metadata.diagram,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
          {
            id: "doc-auth-only",
            type: "doc",
            title: "Auth Only Doc",
            content: "Tagged only with auth.",
            metadata: null,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        ])
        .run();

      drizzle
        .insert(tags)
        .values([
          { id: "auth", name: "auth", createdAt: timestamp },
          { id: "middleware", name: "middleware", createdAt: timestamp },
        ])
        .run();

      drizzle
        .insert(entityTags)
        .values([
          { entityId: "doc-auth-overview", tagId: "auth" },
          { entityId: "doc-auth-overview", tagId: "middleware" },
          { entityId: "code-auth-middleware", tagId: "auth" },
          { entityId: "code-auth-middleware", tagId: "middleware" },
          { entityId: "doc-auth-only", tagId: "auth" },
        ])
        .run();

      drizzle
        .insert(links)
        .values([
          {
            id: "link-doc-code",
            sourceId: "doc-auth-overview",
            targetId: "code-auth-middleware",
            type: "references",
            createdAt: timestamp,
          },
          {
            id: "link-story-doc",
            sourceId: "story-auth-hardening",
            targetId: "doc-auth-overview",
            type: "blocks",
            createdAt: timestamp,
          },
          {
            id: "link-code-diagram",
            sourceId: "code-auth-middleware",
            targetId: "diagram-auth-flow",
            type: "related_to",
            createdAt: timestamp,
          },
        ])
        .run();
    }).pipe(Effect.provide(DatabaseClientLive(dbPath)))
  )
);
