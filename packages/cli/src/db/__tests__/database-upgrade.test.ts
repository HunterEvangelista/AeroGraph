import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const fixturePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "helpers/database-upgrade-fixture.ts"
);

describe("database upgrades", () => {
  it("normalizes and constrains v3 term names before stamping v4", () => {
    const result = spawnSync("bun", ["run", fixturePath], {
      encoding: "utf8",
      shell: false,
    });

    expect(result.status, `${result.stderr}\n${result.stdout}`).toBe(0);
  });
});
