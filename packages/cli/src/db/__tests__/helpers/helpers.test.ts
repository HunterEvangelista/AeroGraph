import { describe, expect, it } from "vitest";
import { createInMemoryDatabase } from "./index.js";

describe("cli db test helpers", () => {
  it("uses the runtime-appropriate in-memory database behavior", async () => {
    if (typeof Bun === "undefined") {
      await expect(createInMemoryDatabase()).rejects.toThrow("requires Bun runtime");
      return;
    }

    const database = await createInMemoryDatabase();
    await expect(database.close()).resolves.toBeUndefined();
  });
});
