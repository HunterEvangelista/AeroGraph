import { describe, expect, test } from "bun:test";
import { formatStatus, type StatusResult } from "./status-output";

const result: StatusResult = {
  project: {
    name: "AeroGraph",
    id: "project-1",
    rootPath: "/repos/aerograph",
    createdAt: "2026-01-02T03:04:05.000Z",
  },
  storage: {
    resolutionMethod: "git_common_dir",
    configPath: "/home/.aerograph/config.json",
    dbPath: "/home/.aerograph/projects/project-1/aerograph.db",
    gitCommonDir: "/repos/aerograph/.git",
  },
  graph: {
    totalEntities: 10,
    docs: 4,
    codeRefs: 3,
    stories: 2,
    diagrams: 1,
    totalTags: 6,
    totalLinks: 8,
  },
};

describe("formatStatus", () => {
  test("formats the complete default output", () => {
    expect(formatStatus(result, false)).toBe(`
AeroGraph Project Status
========================================

Project: AeroGraph
ID:      project-1
Root:    /repos/aerograph
Created: 2026-01-02T03:04:05.000Z

Graph Statistics
----------------------------------------
Entities: 10
  - Docs:      4
  - Code Refs: 3
  - Stories:   2
  - Diagrams:  1
Tags:     6
Links:    8
`);
  });

  test("adds storage and resolution details in verbose output", () => {
    expect(formatStatus(result, true)).toContain(`
Storage and Resolution
----------------------------------------
Resolution: git_common_dir
Registry:   /home/.aerograph/config.json
Database:   /home/.aerograph/projects/project-1/aerograph.db
Git common: /repos/aerograph/.git

Graph Statistics`);
  });
});
