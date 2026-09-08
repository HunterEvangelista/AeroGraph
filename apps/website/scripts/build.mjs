import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import {
  escapeHtml,
  renderExample,
  renderHome,
  renderNotFound,
  renderProject,
  validateContent,
} from "./render.mjs";

const root = new URL("../", import.meta.url);
const load = async (name) =>
  JSON.parse(await readFile(new URL(`content/${name}.json`, root), "utf8"));
const [site, examples, project] = await Promise.all([
  load("site"),
  load("examples"),
  load("project"),
]);
validateContent(site, examples);
// Render before touching the output so invalid copy cannot erase the last successful build.
const pages = new Map([
  ["index.html", renderHome(site, examples)],
  ["project/index.html", renderProject(site, project)],
  ["404.html", renderNotFound(site)],
  ...examples.map((example) => [
    `examples/${example.slug}/index.html`,
    renderExample(site, example, examples),
  ]),
]);
const paths = ["/", "/project/", ...examples.map((example) => `/examples/${example.slug}/`)];
pages.set(
  "sitemap.xml",
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map((path) => `<url><loc>${escapeHtml(site.url + path)}</loc></url>`).join("")}</urlset>\n`
);
pages.set("robots.txt", `User-agent: *\nAllow: /\n\nSitemap: ${site.url}/sitemap.xml\n`);
const output = new URL("dist/", root);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(new URL("public/", root), output, { recursive: true });
for (const [path, html] of pages) {
  const file = new URL(path, output);
  await mkdir(new URL(".", file), { recursive: true });
  await writeFile(file, html);
}
console.log(`Built ${pages.size - 2} pages → apps/website/dist`);
