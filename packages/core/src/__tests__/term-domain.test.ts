import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { CreateTermInput, normalizeTermName } from "../domain/term";

describe("term domain helpers", () => {
  it("normalizes term lookup names for case-insensitive alias resolution", () => {
    expect(normalizeTermName("Kioku")).toBe("kioku");
    expect(normalizeTermName("KIOKU Memory")).toBe("kioku-memory");
    expect(normalizeTermName(" Aero_Graph ")).toBe("aero-graph");
  });

  it("rejects names containing the CLI selector delimiter", () => {
    expect(() =>
      Schema.decodeUnknownSync(CreateTermInput)({
        id: "term-brand-foo",
        canonicalName: "Foo, Inc.",
        kind: "brand",
      })
    ).toThrow();
  });
});
