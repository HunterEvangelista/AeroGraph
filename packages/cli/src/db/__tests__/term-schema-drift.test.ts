import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MIGRATION_OPERATIONS, TERM_KINDS, TERM_NAME_KINDS, TERM_STATUSES } from "@kioku/core";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";
import {
  CREATE_TABLES_SQL,
  MIGRATION_OPERATION_VALUES,
  migrationJournal,
  sqlStringList,
  TERM_KIND_VALUES,
  TERM_NAME_KIND_VALUES,
  TERM_NAME_NORMALIZED_CHECK,
  TERM_STATUS_VALUES,
  termNames,
  terms,
} from "../schema.js";

const checkNames = (table: Parameters<typeof getTableConfig>[0]): ReadonlyArray<string> =>
  getTableConfig(table)
    .checks.map(({ name }) => name)
    .sort();

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

  it("declares term registry checks in Drizzle metadata", () => {
    expect(checkNames(terms)).toEqual([
      "terms_canonical_name_check",
      "terms_kind_check",
      "terms_lifecycle_shape_check",
      "terms_status_check",
    ]);
    expect(checkNames(termNames)).toEqual([
      "term_names_display_name_check",
      "term_names_kind_check",
      "term_names_name_kind_check",
      "term_names_name_normalized_check",
    ]);
    expect(checkNames(migrationJournal)).toEqual([
      "migration_journal_kind_check",
      "migration_journal_operation_check",
      "migration_journal_semantics_check",
    ]);
    expect(getTableConfig(termNames).indexes.map(({ config }) => config.name)).toContain(
      "idx_term_names_one_canonical"
    );
  });

  it("commits term registry checks to the Drizzle snapshot", () => {
    const snapshotPath = join(
      dirname(fileURLToPath(import.meta.url)),
      "../../../drizzle/meta/0004_snapshot.json"
    );
    const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8")) as {
      readonly tables: Record<string, { readonly checkConstraints: Record<string, unknown> }>;
    };

    expect(Object.keys(snapshot.tables.terms?.checkConstraints ?? {}).sort()).toEqual(
      checkNames(terms)
    );
    expect(Object.keys(snapshot.tables.term_names?.checkConstraints ?? {}).sort()).toEqual(
      checkNames(termNames)
    );
    expect(Object.keys(snapshot.tables.migration_journal?.checkConstraints ?? {}).sort()).toEqual(
      checkNames(migrationJournal)
    );
  });
});
