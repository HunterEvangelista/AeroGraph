import { readFile } from "node:fs/promises";
import { chromium } from "@playwright/test";
import "./build.mjs";

// Render the preview from the site's own font and sculpture without a running server.
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });
  await page.route("https://aerograph.dev/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const files = {
      "/": ["index.html", "text/html"],
      "/styles.css": ["styles.css", "text/css"],
      "/artwork.js": ["artwork.js", "text/javascript"],
      "/fonts/syne-latin-variable.woff2": ["fonts/syne-latin-variable.woff2", "font/woff2"],
    };
    const file = files[pathname];
    if (!file) return route.fulfill({ status: 404 });
    await route.fulfill({
      body: await readFile(new URL(`../dist/${file[0]}`, import.meta.url)),
      contentType: file[1],
    });
  });
  await page.goto("https://aerograph.dev/");
  await page.addStyleTag({
    content:
      ".masthead{border:0} nav,.hero-actions,.eyebrow{display:none}.hero{padding:40px 0;grid-template-columns:1fr 280px;gap:0}.hero h1{font-size:86px}.hero-bottom{display:block;margin-top:28px}.hero-description{max-width:690px}.hero .artwork{height:310px}.featured,.section,.closing,.footer{display:none}",
  });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() =>
    document.querySelector(".artwork").classList.contains("is-rendered")
  );
  await page.screenshot({ path: new URL("../public/social.png", import.meta.url).pathname });
} finally {
  await browser.close();
}
