import { describe, expect, it } from "bun:test";
import { Cause } from "effect";
import { canonicalCommandName } from "./command-name";
import { classifyCause, errorCategory } from "./error-category";
import { createExecutionEvent, encodeExecutionEvent } from "./execution-event";

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
    expect(canonicalCommandName(["doc", "create", "private title"])).toBe("doc.create");
    expect(canonicalCommandName(["--log-level", "debug", "tag", "list"])).toBe("tag.list");
    expect(canonicalCommandName(["query", "private prompt"])).toBe("query");
    expect(canonicalCommandName(["invalid-command", "status"])).toBe("unknown");
    expect(canonicalCommandName(["--invalid-option", "status"])).toBe("unknown");
    expect(canonicalCommandName(["--completions", "status"])).toBe("aerograph");
    expect(canonicalCommandName(["--help=true"])).toBe("aerograph");
    expect(canonicalCommandName(["--no-version"])).toBe("aerograph");
    expect(canonicalCommandName(["-hv"])).toBe("aerograph");
    expect(canonicalCommandName(["-h", "doc", "list"])).toBe("doc.list");
    expect(canonicalCommandName(["--version"])).toBe("aerograph");
    expect(canonicalCommandName(["private-command", "private-value"])).toBe("unknown");
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
