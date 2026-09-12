import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const fixturePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "helpers/project-repository-fixture.ts"
);

const attach = (dbPath: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn("bun", ["run", fixturePath, "attach", dbPath], { shell: false });
    const output: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => output.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => output.push(chunk));
    child.on("error", reject);
    child.on("close", (status) => {
      if (status === 0) resolve();
      else reject(new Error(`Membership writer exited ${status}: ${Buffer.concat(output)}`));
    });
  });

describe("project repository", () => {
  it("supports membership reads, non-destructive detach, and transaction rollback on Bun", () => {
    const result = spawnSync("bun", ["run", fixturePath], { encoding: "utf8", shell: false });
    expect(result.status, `${result.stderr}\n${result.stdout}`).toBe(0);
  });

  it("supports the same repository contract on Node.js", () => {
    const directory = mkdtempSync(join(tmpdir(), "aerograph-project-node-"));
    try {
      const bundle = join(directory, "fixture.mjs");
      const build = spawnSync(
        "bun",
        [
          "build",
          fixturePath,
          "--target=node",
          "--splitting",
          `--outdir=${directory}`,
          "--entry-naming=fixture.mjs",
          "--external=bun:sqlite",
        ],
        { encoding: "utf8", shell: false }
      );
      expect(build.status, `${build.stderr}\n${build.stdout}`).toBe(0);
      const result = spawnSync("node", [bundle], { encoding: "utf8", shell: false });
      expect(result.status, `${result.stderr}\n${result.stdout}`).toBe(0);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("keeps duplicate attachment idempotent across independent writers", async () => {
    const directory = mkdtempSync(join(tmpdir(), "aerograph-project-concurrency-"));
    const dbPath = join(directory, "aerograph.db");
    try {
      const seed = spawnSync("bun", ["run", fixturePath, "seed", dbPath], {
        encoding: "utf8",
        shell: false,
      });
      expect(seed.status, `${seed.stderr}\n${seed.stdout}`).toBe(0);
      const writers = await Promise.allSettled(Array.from({ length: 4 }, () => attach(dbPath)));
      for (const writer of writers) {
        if (writer.status === "rejected") throw writer.reason;
      }
      const verify = spawnSync("bun", ["run", fixturePath, "verify", dbPath], {
        encoding: "utf8",
        shell: false,
      });
      expect(verify.status, `${verify.stderr}\n${verify.stdout}`).toBe(0);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
