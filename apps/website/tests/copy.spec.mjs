import { expect, test } from "@playwright/test";

test("homepage explains the product and presents one handoff plus two other uses", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".hero-description")).toContainText("local command-line tool");
  await expect(page.locator(".hero .eyebrow")).toHaveCount(0);
  await expect(page.locator(".example-grid .example-card")).toHaveCount(2);
  await expect(page.locator('.example-grid a[href="/examples/agent-handoff/"]')).toHaveCount(0);
  await expect(page.locator("details, .parts-section, .project-section, .facts")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Related examples" })).toBeVisible();
  await page.getByRole("link", { name: "See an example" }).click();
  await expect(page).toHaveURL(/#examples$/);
  await expect(page.locator("#featured-title")).toBeInViewport();
  await expect(page.locator(".closing .caption")).toHaveCount(0);
});

test("examples use one sample, concise steps, and explicit boundaries", async ({ page }) => {
  for (const slug of ["agent-handoff", "remember-the-reason", "pick-up-the-thread"]) {
    await page.goto(`/examples/${slug}/`);
    await expect(page.locator(".example-artifact")).toHaveCount(1);
    await expect(page.locator(".walkthrough-steps > li")).toHaveCount(3);
    await expect(page.locator(".boundary")).toBeVisible();
    await expect(page.locator(".related a")).toHaveCount(1);
    await expect(page.locator(".closing h2")).toHaveCount(0);
    await expect(page.locator(".closing .caption")).toContainText("In alpha");
    await expect(page.locator(".status-example")).toHaveCount(slug === "agent-handoff" ? 1 : 0);
  }
});

test("project page preserves engineering rationale and author attribution", async ({ page }) => {
  await page.goto("/project/");
  await expect(page.locator("h1")).toHaveText("About AeroGraph");
  await expect(page.locator(".engineering-choice")).toHaveCount(3);
  await expect(page.locator(".engineering-choice .tradeoff")).toHaveCount(3);
  await expect(page.getByRole("link", { name: "Created by Hunter Evangelista" })).toBeVisible();
  await expect(page.locator(".boundary")).toContainText("In alpha");
});
