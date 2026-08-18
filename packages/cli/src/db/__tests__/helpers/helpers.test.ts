import { describe, expect, it } from "vitest";
import { createInMemoryDatabase } from "./index";

describe("cli db test helpers", () => {
  it("fails fast outside Bun runtime", async () => {
    await expect(createInMemoryDatabase()).rejects.toThrow("requires Bun runtime");
  });
});
