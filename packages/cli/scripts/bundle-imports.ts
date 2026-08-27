import { builtinModules } from "node:module";

const builtins = new Set(builtinModules);

export function scanBundleImports(bundle: string): string[] {
  const transpiler = new Bun.Transpiler({ loader: "js" });
  const imports = [...transpiler.scan(bundle).imports, ...transpiler.scanImports(bundle)];
  return [...new Set(imports.map(({ path }) => path))];
}

export function assertNoExternalBundleImports(bundle: string): void {
  const external = scanBundleImports(bundle).filter((specifier) => {
    const bareSpecifier = specifier.startsWith("node:") ? specifier.slice(5) : specifier;
    return !specifier.startsWith("bun:") && !builtins.has(bareSpecifier);
  });
  if (external.length > 0) {
    throw new Error(`Bundle has unresolved non-builtin imports: ${external.sort().join(", ")}`);
  }
  if (bundle.includes("__require(")) {
    throw new Error("Bundle contains an uninspectable generated require wrapper");
  }
}

// Keep the scanner contract exercised independently of a particular bundle.
// Bun's scanners complement each other: scan reports require.resolve while
// scanImports reports plain CommonJS require calls.
export function assertImportScannerCoverage(): void {
  const imports = new Set(
    scanBundleImports(
      [
        'import "import-form"',
        'export { value } from "export-form"',
        'import("dynamic-form")',
        'require("require-form")',
        'require.resolve("resolve-form")',
      ].join(";")
    )
  );
  for (const expected of [
    "import-form",
    "export-form",
    "dynamic-form",
    "require-form",
    "resolve-form",
  ]) {
    if (!imports.has(expected)) throw new Error(`Bundle import scanner missed ${expected}`);
  }
}

assertImportScannerCoverage();
