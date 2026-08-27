import { copyFile, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type PackageManifest = { version: string };

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(
  await readFile(resolve(packageRoot, "package.json"), "utf8")
) as PackageManifest;
const result = await Bun.build({
  entrypoints: [resolve(packageRoot, "src/bundle-entry.ts")],
  outdir: resolve(packageRoot, "dist"),
  naming: "cli.js",
  target: "bun",
  define: { AEROGRAPH_CLI_VERSION: JSON.stringify(manifest.version) },
  minify: false,
  sourcemap: "none",
  packages: "bundle",
  metafile: true,
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

// Bun 1.2 does not expose its metafile through Bun.build yet. Use the
// bundler's semantic graph as a compatibility fallback; newer Bun versions
// provide the same graph directly on the build result.
type SemanticMetafile = {
  inputs: Record<
    string,
    { imports: Array<{ external?: boolean; original?: string; path: string }> }
  >;
};
const metafile = result.metafile;
let semanticMetafile: SemanticMetafile;
if (metafile) {
  semanticMetafile = {
    inputs: Object.fromEntries(
      Object.entries(metafile.inputs).map(([path, input]) => [
        path,
        {
          imports: input.imports.map(({ external, original, path }) => ({
            path,
            ...(external === undefined ? {} : { external }),
            ...(original === undefined ? {} : { original }),
          })),
        },
      ])
    ),
  };
} else {
  const { build } = await import("esbuild");
  const analysis = await build({
    absWorkingDir: resolve(packageRoot, "../.."),
    entryPoints: ["packages/cli/src/bundle-entry.ts"],
    bundle: true,
    metafile: true,
    write: false,
    platform: "neutral",
    packages: "bundle",
    external: ["bun:*", "node:*"],
  });
  semanticMetafile = {
    inputs: Object.fromEntries(
      Object.entries(analysis.metafile.inputs).map(([path, input]) => [
        path,
        {
          imports: input.imports.map(({ external, original, path }) => ({
            path,
            ...(external === undefined ? {} : { external }),
            ...(original === undefined ? {} : { original }),
          })),
        },
      ])
    ),
  };
}
const metafilePath = resolve(packageRoot, "dist/cli.meta.json");
await writeFile(metafilePath, JSON.stringify(semanticMetafile, null, 2));

const builtinModules = new Set([
  "assert",
  "buffer",
  "child_process",
  "crypto",
  "events",
  "fs",
  "fs/promises",
  "http",
  "https",
  "module",
  "net",
  "os",
  "path",
  "readline",
  "stream",
  "string_decoder",
  "timers",
  "tty",
  "url",
  "util",
  "zlib",
]);
const unresolved = new Set<string>();
for (const input of Object.values(semanticMetafile.inputs)) {
  for (const imported of input.imports) {
    if (!imported.external) continue;
    const specifier = imported.original ?? imported.path;
    if (
      !specifier.startsWith("node:") &&
      !specifier.startsWith("bun:") &&
      !builtinModules.has(specifier)
    ) {
      unresolved.add(specifier);
    }
  }
}
if (unresolved.size > 0) {
  throw new Error(
    `CLI build has unresolved non-builtin imports: ${[...unresolved].sort().join(", ")}`
  );
}
const inputs = Object.keys(semanticMetafile.inputs);
if (inputs.some((input) => /(?:^|[\\/])node_modules[\\/]ws(?:[\\/]|$)/.test(input)))
  throw new Error("CLI build unexpectedly includes ws in its semantic input graph");
if (
  inputs.some(
    (input) => input.endsWith("NodeSocketServer.js") || input.endsWith("NodeSocketServer.ts")
  )
)
  throw new Error("CLI build unexpectedly includes NodeSocketServer in its semantic input graph");
await copyFile(resolve(packageRoot, "../../LICENSE"), resolve(packageRoot, "LICENSE"));
try {
  await Bun.$`bun run ${resolve(packageRoot, "scripts/generate-third-party-licenses.ts")} ${metafilePath}`;
} finally {
  await rm(metafilePath, { force: true });
}
