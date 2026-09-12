import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const fixturePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "helpers/project-schema-fixture.ts"
);

describe("project membership schema", () => {
  it("enforces independent project membership and preserves existing stores", () => {
    const result = spawnSync("bun", ["run", fixturePath], { encoding: "utf8" });
    expect(result.status, `${result.stderr}\n${result.stdout}`).toBe(0);
  });
});
