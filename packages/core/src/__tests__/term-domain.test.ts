import { describe, expect, it } from "vitest";
import { normalizeTermName } from "../domain/term.js";

describe("term domain helpers", () => {
  it("normalizes term lookup names for case-insensitive alias resolution", () => {
    expect(normalizeTermName("Kioku")).toBe("kioku");
    expect(normalizeTermName("KIOKU Memory")).toBe("kioku-memory");
    expect(normalizeTermName(" Aero_Graph ")).toBe("aero-graph");
  });
});
