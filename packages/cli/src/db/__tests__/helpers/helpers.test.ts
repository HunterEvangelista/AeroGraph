import { describe, expect, it } from "vitest";
import { createInMemoryDatabase } from "./index";

describe("cli db test helpers", () => {
  it("creates and closes an in-memory database", async () => {
    const database = await createInMemoryDatabase();
    await expect(database.close()).resolves.toBeUndefined();
  });
});
