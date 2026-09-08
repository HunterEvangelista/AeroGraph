import { describe, expect, it } from "bun:test";
import { Cause } from "effect";
import { Command } from "effect/unstable/cli";
import { commandCatalog } from "./command-name";
import { classifyCause, errorCategory } from "./error-category";
import { createExecutionEvent, encodeExecutionEvent } from "./execution-event";

const testCatalog = commandCatalog(
  Command.make("aerograph").pipe(
    Command.withSubcommands([
      Command.make("doc").pipe(Command.withSubcommands([Command.make("create")])),
      Command.make("query"),
      Command.make("status"),
      Command.make("tag").pipe(Command.withSubcommands([Command.make("list")])),
    ])
  )
);

const event = createExecutionEvent({
  runId: "00000000-0000-4000-8000-000000000000",
  command: "doc.create",
  cliVersion: "1.2.3",
  startedAt: "2026-09-04T12:00:00.000Z",
  endedAt: "2026-09-04T12:00:00.012Z",
  durationMs: 12,
  outcome: "failure",
  errorCategory: "validation",
  projectResolution: "registered_path",
});

describe("execution event contract", () => {
  it("encodes exactly the versioned allowlist as one JSON line", () => {
    const eventWithUntrustedProperties = {
      ...event,
      rawArgv: "private argument",
      path: "/private/repository",
      message: "private error",
      content: "private document",
    };
    const encoded = encodeExecutionEvent(eventWithUntrustedProperties);

    expect(encoded).not.toContain("\n");
    expect(JSON.parse(encoded)).toEqual(event);
    expect(encoded).not.toContain("private");
  });

  it("classifies only known command paths", () => {
    expect(testCatalog.classify(["doc", "create", "private title"])).toBe("doc.create");
    expect(testCatalog.classify(["--log-level", "debug", "tag", "list"])).toBe("tag.list");
    expect(testCatalog.classify(["query", "private prompt"])).toBe("query");
    expect(testCatalog.classify(["invalid-command", "status"])).toBe("unknown");
    expect(testCatalog.classify(["--invalid-option", "status"])).toBe("unknown");
    expect(testCatalog.classify(["--completions", "status"])).toBe("aerograph");
    expect(testCatalog.classify(["--help=true"])).toBe("aerograph");
    expect(testCatalog.classify(["--no-version"])).toBe("aerograph");
    expect(testCatalog.classify(["-hv"])).toBe("aerograph");
    expect(testCatalog.classify(["-h", "doc", "create"])).toBe("doc.create");
    expect(testCatalog.classify(["--version"])).toBe("aerograph");
    expect(testCatalog.classify(["private-command", "private-value"])).toBe("unknown");
    expect(testCatalog.names).toEqual(
      new Set(["aerograph", "doc", "doc.create", "query", "status", "tag", "tag.list", "unknown"])
    );
  });

  it("maps failures to coarse categories without using their messages", () => {
    expect(errorCategory({ _tag: "WorkspaceNotFoundError", message: "private path" })).toBe(
      "workspace"
    );
    expect(errorCategory({ _tag: "UnrecognizedPrivateError", message: "private content" })).toBe(
      "unknown"
    );
    expect(classifyCause(Cause.fail({ _tag: "DatabaseError", message: "private SQL" }))).toEqual({
      outcome: "failure",
      errorCategory: "database",
    });
    expect(classifyCause(Cause.die(new Error("private defect")))).toEqual({
      outcome: "failure",
      errorCategory: "internal",
    });
    expect(classifyCause(Cause.interrupt(1))).toEqual({ outcome: "interrupted" });
  });
});
