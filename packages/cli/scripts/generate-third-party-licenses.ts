import { readFile, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";

type Manifest = {
  name?: string;
  version?: string;
  license?: string | { type?: string };
};
const packageRoot = resolve(import.meta.dir, "..");
const inputArgument = Bun.argv[2];
if (!inputArgument) throw new Error("Bun bundle input list is required");
const inputs = JSON.parse(inputArgument) as string[];
if (!Array.isArray(inputs) || inputs.length === 0)
  throw new Error("Bun bundle input list is empty");

const packageRoots = new Map<string, { manifest: Manifest; root: string }>();
const licenseNames = ["LICENSE", "LICENSE.md", "LICENSE.txt", "COPYING"];

const ownerForInput = async (input: string) => {
  const absolute = input.startsWith("/") ? input : resolve(packageRoot, "../..", input);
  const marker = `${sep}node_modules${sep}`;
  const markerIndex = absolute.lastIndexOf(marker);
  if (markerIndex < 0) return undefined;
  const segments = absolute.slice(markerIndex + marker.length).split(sep);
  const packageSegmentCount = segments[0]?.startsWith("@") ? 2 : 1;
  const root = `${absolute.slice(0, markerIndex + marker.length)}${segments.slice(0, packageSegmentCount).join(sep)}`;
  const manifest = JSON.parse(await readFile(resolve(root, "package.json"), "utf8")) as Manifest;
  if (!manifest.name) throw new Error(`Package manifest has no name: ${root}`);
  if (manifest.name.startsWith("@aerograph/")) return undefined;
  return { manifest, root };
};

for (const input of inputs) {
  const owner = await ownerForInput(input);
  if (!owner && input.includes("node_modules") && !input.includes("node_modules/@aerograph/"))
    throw new Error(`Cannot attribute bundled input to a package: ${input}`);
  if (owner) packageRoots.set(owner.root, owner);
}
if (packageRoots.size === 0) throw new Error("CLI bundle has no bundled third-party packages");

const entries: string[] = [];
for (const { manifest, root } of [...packageRoots.values()].sort((a, b) =>
  (a.manifest.name ?? "").localeCompare(b.manifest.name ?? "")
)) {
  const license = typeof manifest.license === "string" ? manifest.license : manifest.license?.type;
  if (!license || !manifest.version)
    throw new Error(`Bundled package has incomplete license metadata: ${root}`);
  let text = "";
  for (const candidate of licenseNames) {
    try {
      text = await readFile(resolve(root, candidate), "utf8");
      break;
    } catch {
      // SPDX metadata is accepted when a package does not publish a license file.
    }
  }
  let notice = "";
  for (const candidate of ["NOTICE", "NOTICE.md", "NOTICE.txt"]) {
    try {
      notice = await readFile(resolve(root, candidate), "utf8");
      break;
    } catch {
      // NOTICE is optional; when present it is included verbatim below.
    }
  }
  entries.push(
    `## ${manifest.name} ${manifest.version}\n\nLicense: ${license}\n\n${text.trim() || "No license text file was published by this package."}${notice.trim() ? `\n\nNOTICE\n\n${notice.trim()}` : ""}`
  );
}

const inventory = [...packageRoots.values()]
  .map(({ manifest }) => `${manifest.name}@${manifest.version}`)
  .sort();
const output = `# Third-party licenses\n\nCopyright © Hunter Evangelista. AeroGraph is distributed under the Apache License 2.0.\n\nThis file is generated from the source map of Bun's production bundle. It includes every package contributing bundled input; AeroGraph sources are excluded.\n\n<!-- bundled-package-inventory: ${inventory.join(", ")} -->\n\n${entries.join("\n\n")}\n`;
if (entries.length !== inventory.length || !output.includes("bundled-package-inventory:"))
  throw new Error("Generated third-party notice does not match the bundled package inventory");
await writeFile(resolve(packageRoot, "THIRD_PARTY_LICENSES.md"), output);
console.log(
  `Generated third-party notice for ${inventory.length} bundled packages: ${inventory.join(", ")}`
);
