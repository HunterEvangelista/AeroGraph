import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { escapeHtml, renderHome, validateContent } from "../scripts/render.mjs";

const site = JSON.parse(await readFile(new URL("../content/site.json", import.meta.url), "utf8"));
const examples = JSON.parse(
  await readFile(new URL("../content/examples.json", import.meta.url), "utf8")
);
const paths = ["/", "/project/", ...examples.map((example) => `/examples/${example.slug}/`)];

for (const width of [320, 390, 768, 1440]) {
  test(`pages, assets, and navigation at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    for (const path of paths) {
      const response = await page.goto(path);
      expect(response.status()).toBe(200);
      expect(response.headers()["content-security-policy"]).toContain("default-src 'none'");
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", site.url + path);
      await page.evaluate(() => document.fonts.ready);
      expect(await page.evaluate(() => document.fonts.check('500 17px "Syne"'))).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true
      );
      for (const href of await page
        .locator('a[href^="#"]')
        .evaluateAll((links) => links.map((link) => link.getAttribute("href")))) {
        await expect(page.locator(href)).toHaveCount(1);
      }
    }
    for (const path of [
      "/favicon.svg",
      "/social.png",
      "/robots.txt",
      "/sitemap.xml",
      "/fonts/OFL.txt",
    ]) {
      expect((await page.request.get(path)).status()).toBe(200);
    }
    expect(errors).toEqual([]);
  });
}

test("every internal link resolves, including fragments", async ({ page }) => {
  const links = new Set();
  for (const path of paths) {
    await page.goto(path);
    for (const href of await page
      .locator('a[href^="/"]')
      .evaluateAll((items) => items.map((item) => item.getAttribute("href"))))
      links.add(href);
  }
  for (const link of links) {
    expect((await page.request.get(link)).status()).toBe(200);
    await page.goto(link);
    const hash = new URL(page.url()).hash;
    if (hash) await expect(page.locator(hash)).toHaveCount(1);
  }
});

test("keyboard entry and handoff navigation", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#main$/);
  const link = page.getByRole("link", { name: site.featured.link });
  await link.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/examples\/agent-handoff\/$/);
  await expect(page.locator(".status-transition")).toContainText("#status:in-progress");
  await expect(page.locator(".status-transition")).toContainText("#status:review-ready");
});

test("content and handoff work without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:8787/");
  await expect(page.locator(".sphere-fallback")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Related examples" })).toBeVisible();
  await page.getByRole("link", { name: site.featured.link }).click();
  await expect(page.locator("h1")).toHaveText(examples[0].title);
  await expect(page.locator(".status-transition")).toBeVisible();
  await context.close();
});

test("canvas failure preserves the static sculpture", async ({ page }) => {
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.getContext = () => null;
  });
  await page.goto("/");
  await expect(page.locator(".sphere-fallback")).toBeVisible();
  await expect(page.locator(".artwork")).not.toHaveClass(/is-rendered/);
});

test("reduced motion suppresses pointer displacement", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator(".artwork")).toHaveClass("artwork is-rendered");
  const image = await page.locator("canvas").evaluate((canvas) => canvas.toDataURL());
  await page.locator("canvas").hover({ position: { x: 100, y: 100 } });
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  );
  expect(await page.locator("canvas").evaluate((canvas) => canvas.toDataURL())).toBe(image);
});

test("unknown paths have a real 404 and no canonical URL", async ({ page }) => {
  for (const path of ["/not-a-page", "/examples/not-an-example/"]) {
    expect((await page.goto(path)).status()).toBe(404);
    await expect(page.locator("h1")).toHaveText(site.notFound.title);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex");
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
  }
});

test("content is escaped and invalid references fail the build boundary", () => {
  expect(escapeHtml("<script>\"&'</script>")).toBe("&lt;script&gt;&quot;&amp;&#39;&lt;/script&gt;");
  const copy = structuredClone(site);
  copy.hero.title = '<script>alert("copy")</script>';
  expect(renderHome(copy, examples)).toContain(
    "&lt;script&gt;alert(&quot;copy&quot;)&lt;/script&gt;"
  );
  expect(renderHome(copy, examples)).not.toContain('<script>alert("copy")</script>');
  expect(() => validateContent(site, [...examples, examples[0]])).toThrow(/duplicate/);
  copy.featured.slug = "missing";
  expect(() => validateContent(copy, examples)).toThrow(/Unknown example/);
  copy.featured.slug = site.featured.slug;
  copy.links.start = "javascript:alert(1)";
  expect(() => validateContent(copy, examples)).toThrow(/HTTPS/);
});

test("sitemap includes public pages but excludes the 404", async ({ request }) => {
  const sitemap = await (await request.get("/sitemap.xml")).text();
  for (const path of paths) expect(sitemap).toContain(`<loc>${site.url}${path}</loc>`);
  expect(sitemap).not.toContain("404.html");
  expect((await request.get("/content/site.json")).status()).toBe(404);
});
