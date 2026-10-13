import { expect, test } from "@playwright/test";

const CRON = { Authorization: "Bearer e2e-only-cron-secret-0123456789" };

test.describe("homepage trending showcase", () => {
  test.beforeAll(async ({ request }) => {
    // The grid reads cached results only; the daily cron is what fills the cache.
    const warmed = await request.get("/api/cron/warm-trending", { headers: CRON });
    expect(warmed.status()).toBe(200);
  });

  test("shows trending comparisons with prices, stores and a snapshot time", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "Find the best price." })).toBeVisible();
    const grid = page.getByRole("list", { name: "Trending products" });
    await expect(grid.getByRole("article")).toHaveCount(5);

    const lifeP3 = grid
      .getByRole("article")
      .filter({ has: page.getByRole("link", { name: "Soundcore Life P3" }) });
    await expect(lifeP3).toContainText("From₪89on AliExpress");
    await expect(lifeP3.getByText("4 stores")).toBeVisible();
    await expect(lifeP3.getByRole("list", { name: "Stores" }).getByRole("listitem")).toHaveCount(4);
    await expect(lifeP3.getByText(/^Prices as of /)).toBeVisible();
  });

  test("a card opens the full comparison for its product", async ({ page }) => {
    await page.goto("/");
    await page
      .getByRole("list", { name: "Trending products" })
      .getByRole("link", { name: "Soundcore Life P3" })
      .click();
    await expect(page).toHaveURL(/\/search\?q=soundcore\+life\+p3/);
    await expect(page.getByRole("button", { name: /Compare 4 stores/ })).toBeVisible();
  });

  test("keeps trending search chips under the search box", async ({ page }) => {
    await page.goto("/");
    const chips = page.getByRole("region", { name: "Trending searches" });
    await expect(chips.getByRole("link", { name: "Sony WH-1000XM5" })).toHaveAttribute(
      "href",
      "/search?q=sony+wh-1000xm5",
    );
    await expect(chips.getByRole("link", { name: "אוזניות אלחוטיות" })).toBeVisible();
  });

  test("the warm-trending cron requires the cron secret", async ({ request }) => {
    expect((await request.get("/api/cron/warm-trending")).status()).toBe(401);
  });
});

test.describe("compliance", () => {
  test("every page discloses both affiliate programs and links the legal pages", async ({ page }) => {
    for (const path of ["/", "/search?q=wireless+earbuds", "/saved", "/privacy", "/terms"]) {
      await page.goto(path);
      const footer = page.getByRole("contentinfo");
      await expect(footer).toContainText(
        "OneCart is a participant in affiliate programs including the eBay Partner Network and Amazon Associates. We may earn a commission on qualifying purchases at no additional cost to you.",
      );
      await expect(footer).toContainText("As an Amazon Associate I earn from qualifying purchases.");
      const legal = footer.getByRole("navigation", { name: "Legal" });
      await expect(legal.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/privacy");
      await expect(legal.getByRole("link", { name: "Terms of Use" })).toHaveAttribute("href", "/terms");
    }
  });

  test("privacy policy and terms show the configured contact address", async ({ page }) => {
    for (const path of ["/privacy", "/terms"]) {
      await page.goto(path);
      await expect(page.getByRole("link", { name: "legal@example.com" }), path).toHaveAttribute(
        "href",
        "mailto:legal@example.com",
      );
    }
  });

  test("the site has the OneCart cart icon, not the framework default", async ({ page, request }) => {
    await page.goto("/");
    const icons = await page.locator('link[rel="icon"], link[rel="apple-touch-icon"]').evaluateAll((links) =>
      links.map((l) => ({
        rel: l.getAttribute("rel"),
        type: l.getAttribute("type"),
        href: l.getAttribute("href"),
      })),
    );
    expect(icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rel: "icon", href: expect.stringMatching(/^\/favicon\.ico/) }),
        expect.objectContaining({
          rel: "icon",
          type: "image/svg+xml",
          href: expect.stringMatching(/^\/icon\.svg/),
        }),
        expect.objectContaining({
          rel: "apple-touch-icon",
          href: expect.stringMatching(/^\/apple-icon\.png/),
        }),
      ]),
    );
    const svg = await request.get(icons.find((i) => i.type === "image/svg+xml")?.href ?? "");
    expect(svg.headers()["content-type"]).toContain("image/svg+xml");
    expect(await svg.text()).toContain('id="oc-blue"');
  });

  test("privacy policy and terms are reachable from the footer", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("contentinfo").getByRole("link", { name: "Privacy Policy" }).click();
    await expect(page).toHaveURL(/\/privacy$/);
    await expect(page.getByRole("heading", { level: 1, name: "Privacy Policy" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Affiliate links and the stores you visit" }),
    ).toBeVisible();

    await page.getByRole("contentinfo").getByRole("link", { name: "Terms of Use" }).click();
    await expect(page).toHaveURL(/\/terms$/);
    await expect(page.getByRole("heading", { level: 1, name: "Terms of Use" })).toBeVisible();
    await expect(page.getByText(/eBay and the eBay logo are trademarks of eBay Inc\./)).toBeVisible();
  });
});
