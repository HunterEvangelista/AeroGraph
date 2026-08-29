import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const fixturePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "helpers/term-lifecycle-sqlite-fixture.ts"
);

describe("SQLite term lifecycle persistence", () => {
  it("persists lifecycle pointers and rolls back failed merge journaling", () => {
    const result = spawnSync("bun", ["run", fixturePath], {
      encoding: "utf8",
      shell: false,
    });
    expect(result.status, `${result.stderr}\n${result.stdout}`).toBe(0);
  });
});
