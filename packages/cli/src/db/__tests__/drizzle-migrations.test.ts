import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const fixturePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "helpers/drizzle-migrations-fixture.ts"
);

describe("Drizzle migrations", () => {
  it("applies the migration chain once and reopens without rerunning migration 0002", () => {
    const result = spawnSync("bun", ["run", fixturePath], {
      encoding: "utf8",
      shell: false,
    });

    expect(result.status, `${result.stderr}\n${result.stdout}`).toBe(0);
  });
});
