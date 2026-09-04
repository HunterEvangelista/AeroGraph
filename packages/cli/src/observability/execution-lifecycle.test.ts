import { describe, expect, it } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  truncateSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { Schema } from "effect";
import { createCliWorkspace } from "../__tests__/helpers/cli";
import { type ExecutionEvent, ExecutionEventSchema } from "./execution-event";
import {
  EXECUTION_LOG_CLOSED_FILE_BUDGET_BYTES,
  EXECUTION_LOGS_DIR,
  executionLogFileName,
} from "./execution-recorder";

const readLogText = (home: string): string => {
  const directory = join(home, EXECUTION_LOGS_DIR);
  if (!existsSync(directory)) {
    return "";
  }
  return readdirSync(directory)
    .filter((name) => name.endsWith(".jsonl"))
    .sort()
    .map((name) => readFileSync(join(directory, name), "utf8"))
    .join("");
};

const readEvents = (home: string): ReadonlyArray<ExecutionEvent> =>
  readLogText(home)
    .split("\n")
    .filter(Boolean)
    .map((line) => Schema.decodeUnknownSync(ExecutionEventSchema)(JSON.parse(line)));

const clearLogs = (home: string): void => {
  rmSync(join(home, EXECUTION_LOGS_DIR), { recursive: true, force: true });
};

describe("CLI execution lifecycle", () => {
  it("records successful and failed commands without persisting sensitive values", () => {
    const workspace = createCliWorkspace();
    try {
      clearLogs(workspace.aerographHome);
      const titleCanary = "PRIVATE_TITLE_CANARY_7812";
      const contentCanary = "PRIVATE_CONTENT_CANARY_3498";
      const missingIdCanary = "PRIVATE_ID_CANARY_9251";

      const status = workspace.run("status");
      expect(status.status).toBe(0);
      expect(status.stderr).toBe("");

      const created = workspace.run("doc", "create", "--content", contentCanary, titleCanary);
      expect(created.status).toBe(0);

      const missing = workspace.run("doc", "show", missingIdCanary);
      expect(missing.status).not.toBe(0);

      const events = readEvents(workspace.aerographHome);
      expect(events.map(({ command }) => command)).toEqual(["status", "doc.create", "doc.show"]);
      expect(events.map(({ outcome }) => outcome)).toEqual(["success", "success", "failure"]);
      expect(events[2]?.errorCategory).toBe("not_found");
      expect(events.every(({ projectResolution }) => projectResolution === "registered_path")).toBe(
        true
      );
      expect(events.every(({ durationMs }) => durationMs >= 0)).toBe(true);
      expect(new Set(events.map(({ runId }) => runId)).size).toBe(events.length);

      const logs = readLogText(workspace.aerographHome);
      for (const canary of [
        titleCanary,
        contentCanary,
        missingIdCanary,
        workspace.rootPath,
        workspace.aerographHome,
        workspace.dbPath,
      ]) {
        expect(logs).not.toContain(canary);
      }
    } finally {
      workspace.cleanup();
    }
  });

  it("records init and parse failures while preserving CLI output channels", () => {
    const workspace = createCliWorkspace();
    try {
      const initialEvents = readEvents(workspace.aerographHome);
      expect(initialEvents).toHaveLength(1);
      expect(initialEvents[0]?.command).toBe("init");
      expect(initialEvents[0]?.outcome).toBe("success");
      expect(initialEvents[0]?.projectResolution).toBe("registered_path");

      clearLogs(workspace.aerographHome);
      const argumentCanary = "PRIVATE_PARSE_CANARY_4826";
      const invalid = workspace.run("doc", "show", "--unknown-option", argumentCanary);
      expect(invalid.status).not.toBe(0);
      expect(invalid.stdout).not.toContain("cli_execution");

      const events = readEvents(workspace.aerographHome);
      expect(events).toHaveLength(1);
      expect(events[0]?.command).toBe("doc.show");
      expect(events[0]?.outcome).toBe("failure");
      expect(events[0]?.errorCategory).toBe("usage");
      expect(events[0]?.projectResolution).toBe("unresolved");
      expect(readLogText(workspace.aerographHome)).not.toContain(argumentCanary);

      const invalidCompletion = workspace.run("--completions", "status");
      expect(invalidCompletion.status).not.toBe(0);
      const completionEvent = readEvents(workspace.aerographHome).at(-1);
      expect(completionEvent?.command).toBe("aerograph");
      expect(completionEvent?.errorCategory).toBe("usage");
    } finally {
      workspace.cleanup();
    }
  });

  it("keeps records complete across concurrent CLI processes", async () => {
    const workspace = createCliWorkspace();
    try {
      clearLogs(workspace.aerographHome);
      const results = await Promise.all(
        Array.from({ length: 12 }, () => workspace.runAsync("status"))
      );
      expect(results.every(({ status }) => status === 0)).toBe(true);

      const events = readEvents(workspace.aerographHome);
      expect(events).toHaveLength(12);
      expect(
        events.every(({ command, outcome }) => command === "status" && outcome === "success")
      ).toBe(true);
    } finally {
      workspace.cleanup();
    }
  });

  it("uses private permissions and fails open when the sink cannot be created", () => {
    const workspace = createCliWorkspace();
    try {
      const directory = join(workspace.aerographHome, EXECUTION_LOGS_DIR);
      const activeFile = join(directory, executionLogFileName(new Date()));
      expect(statSync(directory).mode & 0o777).toBe(0o700);
      expect(statSync(activeFile).mode & 0o777).toBe(0o600);

      clearLogs(workspace.aerographHome);
      writeFileSync(directory, "not a directory");
      const status = workspace.run("status");
      expect(status.status).toBe(0);
      expect(status.stdout).toContain("Project:");
      expect(readFileSync(directory, "utf8")).toBe("not a directory");
    } finally {
      workspace.cleanup();
    }
  });

  it("prunes expired and over-budget closed files without rewriting the active file", () => {
    const workspace = createCliWorkspace();
    try {
      clearLogs(workspace.aerographHome);
      const directory = join(workspace.aerographHome, EXECUTION_LOGS_DIR);
      mkdirSync(directory, { recursive: true });
      const now = new Date();
      const dailyName = (daysAgo: number) =>
        `cli-${new Date(now.getTime() - daysAgo * 86_400_000).toISOString().slice(0, 10)}.jsonl`;
      const oldFile = join(directory, "cli-2000-01-01.jsonl");
      const cutoffFile = join(directory, dailyName(14));
      const olderRecentFile = join(directory, dailyName(2));
      const newerRecentFile = join(directory, dailyName(1));
      writeFileSync(oldFile, "expired\n");
      writeFileSync(cutoffFile, "cutoff\n");
      writeFileSync(olderRecentFile, "");
      writeFileSync(newerRecentFile, "");
      const oversized = Number(EXECUTION_LOG_CLOSED_FILE_BUDGET_BYTES / 2n + 1n);
      truncateSync(olderRecentFile, oversized);
      truncateSync(newerRecentFile, oversized);
      const olderModifiedAt = new Date(now.getTime() - 48 * 60 * 60 * 1000);
      const newerModifiedAt = new Date(now.getTime() - 36 * 60 * 60 * 1000);
      utimesSync(olderRecentFile, olderModifiedAt, olderModifiedAt);
      utimesSync(newerRecentFile, newerModifiedAt, newerModifiedAt);

      const activeFile = join(directory, executionLogFileName(now));
      writeFileSync(activeFile, "partial-record");
      const version = workspace.run("--version");
      expect(version.status).toBe(0);

      expect(existsSync(oldFile)).toBe(false);
      expect(existsSync(cutoffFile)).toBe(false);
      expect(existsSync(olderRecentFile)).toBe(false);
      expect(existsSync(newerRecentFile)).toBe(true);
      expect(readFileSync(activeFile, "utf8")).toMatch(/^partial-record\n\{/);
    } finally {
      const directory = join(workspace.aerographHome, EXECUTION_LOGS_DIR);
      if (existsSync(directory) && statSync(directory).isDirectory()) {
        chmodSync(directory, 0o700);
      }
      workspace.cleanup();
    }
  });
});
