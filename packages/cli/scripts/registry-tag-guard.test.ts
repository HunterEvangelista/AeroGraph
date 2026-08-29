import { describe, expect, it } from "bun:test";
import { assertLatestTagAdvances } from "./registry-tag-guard";

describe("npm latest tag guard", () => {
  it("accepts a newer alpha", () => {
    expect(() => assertLatestTagAdvances("0.1.0-alpha.10", "0.1.0-alpha.9")).not.toThrow();
  });

  it("accepts the first alpha after the placeholder release", () => {
    expect(() => assertLatestTagAdvances("0.1.0-alpha.0", "0.0.1")).not.toThrow();
  });

  it("rejects delayed and duplicate release candidates", () => {
    expect(() => assertLatestTagAdvances("0.1.0-alpha.8", "0.1.0-alpha.9")).toThrow(
      "Refusing to move the npm latest tag"
    );
    expect(() => assertLatestTagAdvances("0.1.0-alpha.9", "0.1.0-alpha.9")).toThrow(
      "Refusing to move the npm latest tag"
    );
  });
});
