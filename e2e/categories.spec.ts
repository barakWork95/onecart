import { expect, test } from "@playwright/test";

const CRON = { Authorization: "Bearer e2e-only-cron-secret-0123456789" };

test.describe("category pages", () => {
  test.beforeAll(async ({ request }) => {
    // Pages read cached results only; the daily cron fills the cache and refreshes them.
    expect((await request.get("/api/cron/warm-trending", { headers: CRON })).status()).toBe(200);
  });

  test("an indexable category shows each product's landed price, breakdown and links", async ({ page }) => {
    const products = page.getByRole("list", { name: "Headphones products" }).getByRole("article");
    // The page is cached HTML: the visit right after the warm-up may still get the old
    // copy while it rebuilds in the background, so reload until the fresh one arrives.
    await expect
      .poll(
        async () => {
          await page.goto("/c/headphones");
          return products.count();
        },
        { timeout: 15_000 },
      )
      .toBeGreaterThanOrEqual(3);
    await expect(
      page.getByRole("heading", { level: 1, name: "Headphones and earbuds: prices in Israel compared" }),
    ).toBeVisible();

    const first = products.first();
    await expect(first.getByLabel(/^Price breakdown on /)).toContainText("Total");
    await expect(first.getByRole("link", { name: /Compare every store/ })).toHaveAttribute(
      "href",
      /^\/search\?q=/,
    );
    await expect(first.getByRole("link", { name: /^View on / })).toHaveAttribute("href", /^\/go\//);
    await expect(page.getByRole("region", { name: "How we compare prices" })).toContainText("over $75");

    // Search-engine metadata: canonical, indexable, structured data without prices.
    await expect(page).toHaveTitle("Headphones and earbuds: prices in Israel compared · OneCart");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      "https://www.onecartapp.com/c/headphones",
    );
    expect(await page.locator('meta[name="robots"]').count()).toBe(0);
    const jsonLd = await page.locator('script[type="application/ld+json"]').textContent();
    expect(jsonLd).toContain('"@type":"BreadcrumbList"');
    expect(jsonLd).toContain('"@type":"ItemList"');
    expect(jsonLd).not.toMatch(/"(offers|price)"/);
  });

  test("a thin category stays out of search engines", async ({ page }) => {
    await page.goto("/c/pillows");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, follow");
  });

  test("an unknown category is a 404", async ({ request }) => {
    expect((await request.get("/c/not-a-category")).status()).toBe(404);
  });

  test("the index lists every category, and the footer links them from any page", async ({ page }) => {
    await page.goto("/c");
    const list = page.getByRole("list", { name: "Categories" });
    await expect(list.getByRole("link", { name: /^Headphones/ })).toHaveAttribute("href", "/c/headphones");
    await expect(list.getByRole("link", { name: /^Pillows/ })).toHaveAttribute("href", "/c/pillows");

    await page.goto("/privacy");
    await expect(
      page
        .getByRole("contentinfo")
        .getByRole("navigation", { name: "Categories" })
        .getByRole("link", { name: "Headphones" }),
    ).toHaveAttribute("href", "/c/headphones");
  });

  test("the sitemap lists indexable category pages only", async ({ request }) => {
    const sitemap = await (await request.get("/sitemap.xml")).text();
    expect(sitemap).toContain("<loc>https://www.onecartapp.com/c</loc>");
    expect(sitemap).toContain("<loc>https://www.onecartapp.com/c/headphones</loc>");
    expect(sitemap).not.toContain("/c/pillows");
  });
});
