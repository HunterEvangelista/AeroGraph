import { copyFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { assertNoExternalBundleImports } from "./bundle-imports";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const coreRoot = resolve(packageRoot, "../core");
const entrypoint = resolve(packageRoot, "src/bundle-entry.ts");
const outdir = resolve(packageRoot, "dist");
const buildOptions = {
  entrypoints: [entrypoint],
  target: "bun" as const,
  naming: "cli.js",
  minify: false,
  packages: "bundle" as const,
  define: {},
  // Workspace links point at the source checkout. The bundle must always use
  // the core output produced in this checkout, including in isolated builds.
  alias: { "@aerograph/core": resolve(coreRoot, "dist/index.js") },
};

// The CLI package is published independently, so its lifecycle must not depend
// on a dist directory left by a different workspace task or checkout.
await Bun.$`bun run --cwd ${coreRoot} build`;
const result = await Bun.build({ ...buildOptions, outdir, sourcemap: "none" });
if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

const analysisRoot = await mkdtemp(resolve(tmpdir(), "aerograph-cli-analysis-"));
try {
  // Bun 1.2 does not expose a metafile. A linked source map from a second
  // build with identical resolver, target, alias, define, and bundling options
  // is the authoritative set of modules that entered the production bundle.
  const analysis = await Bun.build({
    ...buildOptions,
    outdir: analysisRoot,
    sourcemap: "linked",
  });
  if (!analysis.success) {
    for (const log of analysis.logs) console.error(log);
    throw new Error("Unable to produce the CLI bundle analysis source map");
  }
  const map = JSON.parse(await readFile(resolve(analysisRoot, "cli.js.map"), "utf8")) as {
    sources?: string[];
    sourceRoot?: string;
  };
  if (!map.sources?.length) throw new Error("CLI bundle analysis source map is empty");
  const inputs = map.sources.map((source) => resolve(analysisRoot, map.sourceRoot ?? "", source));
  const bundle = await readFile(resolve(outdir, "cli.js"), "utf8");
  assertNoExternalBundleImports(bundle);
  await validateInputs(inputs);
  await copyFile(resolve(packageRoot, "../../LICENSE"), resolve(packageRoot, "LICENSE"));
  await Bun.$`bun run ${resolve(packageRoot, "scripts/generate-third-party-licenses.ts")} ${JSON.stringify(inputs)}`;
} finally {
  await rm(analysisRoot, { recursive: true, force: true });
}

async function validateInputs(inputs: string[]) {
  if (inputs.some((input) => /node_modules[\\/]ws(?:[\\/]|$)/.test(input)))
    throw new Error("CLI build unexpectedly includes ws in its bundle input set");
  if (inputs.some((input) => /[\\/]NodeSocketServer\.(?:js|ts)$/.test(input)))
    throw new Error("CLI build unexpectedly includes NodeSocketServer in its bundle input set");
  if (
    inputs.some((input) =>
      /node_modules[\\/](?:@msgpackr-extract|msgpackr-extract)(?:[\\/]|$)/.test(input)
    )
  )
    throw new Error("CLI build unexpectedly includes optional native msgpack input");
}
