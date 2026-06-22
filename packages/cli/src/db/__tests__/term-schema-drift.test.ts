import { MIGRATION_OPERATIONS, TERM_KINDS, TERM_NAME_KINDS, TERM_STATUSES } from "@kioku/core";
import { describe, expect, it } from "vitest";
import {
  CREATE_TABLES_SQL,
  MIGRATION_OPERATION_VALUES,
  sqlStringList,
  TERM_KIND_VALUES,
  TERM_NAME_KIND_VALUES,
  TERM_NAME_NORMALIZED_CHECK,
  TERM_STATUS_VALUES,
} from "../schema.js";

describe("term registry schema drift guards", () => {
  it("keeps DB enum values aligned with core term domain constants", () => {
    expect(TERM_KIND_VALUES).toEqual(TERM_KINDS);
    expect(TERM_STATUS_VALUES).toEqual(TERM_STATUSES);
    expect(TERM_NAME_KIND_VALUES).toEqual(TERM_NAME_KINDS);
    expect(MIGRATION_OPERATION_VALUES).toEqual(MIGRATION_OPERATIONS);
  });

  it("keeps raw bootstrap SQL CHECK constraints aligned with DB constants", () => {
    expect(CREATE_TABLES_SQL).toContain(`CHECK(kind IN (${sqlStringList(TERM_KIND_VALUES)}))`);
    expect(CREATE_TABLES_SQL).toContain(`CHECK(status IN (${sqlStringList(TERM_STATUS_VALUES)}))`);
    expect(CREATE_TABLES_SQL).toContain(
      `CHECK(name_kind IN (${sqlStringList(TERM_NAME_KIND_VALUES)}))`
    );
    expect(CREATE_TABLES_SQL).toContain(
      `CHECK(operation IN (${sqlStringList(MIGRATION_OPERATION_VALUES)}))`
    );
    expect(CREATE_TABLES_SQL).toContain(`CHECK(${TERM_NAME_NORMALIZED_CHECK})`);
  });

  it("keeps tags.term_id as an intentional soft reference", () => {
    expect(CREATE_TABLES_SQL).toContain("term_id TEXT,");
    expect(CREATE_TABLES_SQL).not.toContain("term_id TEXT REFERENCES terms(id)");
  });
});
