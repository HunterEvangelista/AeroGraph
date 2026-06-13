import { describe, expect, it } from "vitest";
import {
  calculateEntityIdPrefixes,
  DEFAULT_ENTITY_ID_PREFIX_SCOPE,
  formatEntityIdWithBoldPrefix,
} from "../entity-prefix-format.js";

describe("entity prefix index", () => {
  it("calculates shortest unique prefixes by local scope", () => {
    const rows = calculateEntityIdPrefixes([
      "abc11111-0000-0000-0000-000000000000",
      "abd22222-0000-0000-0000-000000000000",
      "b3333333-0000-0000-0000-000000000000",
    ]);

    expect(rows.map((row) => [row.entityId, row.scope, row.prefix, row.prefixLength])).toEqual([
      ["abc11111-0000-0000-0000-000000000000", DEFAULT_ENTITY_ID_PREFIX_SCOPE, "abc", 3],
      ["abd22222-0000-0000-0000-000000000000", DEFAULT_ENTITY_ID_PREFIX_SCOPE, "abd", 3],
      ["b3333333-0000-0000-0000-000000000000", DEFAULT_ENTITY_ID_PREFIX_SCOPE, "b", 1],
    ]);
  });

  it("updates prefixes when adjacent ids overlap", () => {
    expect(
      calculateEntityIdPrefixes([
        "a1111111-0000-0000-0000-000000000000",
        "a2222222-0000-0000-0000-000000000000",
      ]).map(({ entityId, prefix }) => ({ entityId, prefix }))
    ).toEqual([
      { entityId: "a1111111-0000-0000-0000-000000000000", prefix: "a1" },
      { entityId: "a2222222-0000-0000-0000-000000000000", prefix: "a2" },
    ]);
  });

  it("formats bold prefixes only when ANSI is enabled", () => {
    expect(formatEntityIdWithBoldPrefix("abcdef", "abc", { ansi: false })).toBe("abcdef");
    expect(formatEntityIdWithBoldPrefix("abcdef", "abc", { ansi: true })).toBe(
      "\u001b[1mabc\u001b[22mdef"
    );
  });
});
