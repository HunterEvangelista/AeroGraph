import { describe, expect, it } from "bun:test";
import { assertAlphaTagAdvances } from "./registry-tag-guard";

describe("npm alpha tag guard", () => {
  it("accepts a newer alpha", () => {
    expect(() => assertAlphaTagAdvances("0.1.0-alpha.10", "0.1.0-alpha.9")).not.toThrow();
  });

  it("rejects delayed and duplicate release candidates", () => {
    expect(() => assertAlphaTagAdvances("0.1.0-alpha.8", "0.1.0-alpha.9")).toThrow(
      "Refusing to move the npm alpha tag"
    );
    expect(() => assertAlphaTagAdvances("0.1.0-alpha.9", "0.1.0-alpha.9")).toThrow(
      "Refusing to move the npm alpha tag"
    );
  });
});
