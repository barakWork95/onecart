import { expect, test, type Page } from "@playwright/test";

test.describe("languages: English unprefixed, Hebrew under /he", () => {
  test("English keeps its URLs, left to right, linked to its Hebrew version", async ({ page }) => {
    await page.goto("/c");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/c$/);
    await expect(page.locator('link[rel="alternate"][hreflang="he"]')).toHaveAttribute("href", /\/he\/c$/);
    await expect(page.locator('link[rel="alternate"][hreflang="x-default"]')).toHaveAttribute("href", /\/c$/);
  });

  test("/en/… redirects to the one English URL", async ({ request }) => {
    const redirects: [string, string][] = [
      ["/en/c", "/c"],
      ["/en", "/"],
    ];
    for (const [from, to] of redirects) {
      const response = await request.get(from, { maxRedirects: 0 });
      expect([from, response.status()]).toEqual([from, 308]);
      expect(response.headers()["location"]).toBe(to);
    }
  });

  test("Hebrew pages read right to left in Hebrew's font, with their own canonical", async ({ page }) => {
    await page.goto("/he/c/headphones");
    await expect(page.locator("html")).toHaveAttribute("lang", "he");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/he\/c\/headphones$/);
    await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute(
      "href",
      /\/c\/headphones$/,
    );
    const font = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
    expect(font.toLowerCase()).toContain("heebo");
  });

  test("the switcher moves between the same page in each language", async ({ page }) => {
    await page.goto("/c/headphones");
    await page.getByRole("link", { name: "View this page in Hebrew" }).click();
    await expect(page).toHaveURL(/\/he\/c\/headphones$/);
    await page.getByRole("link", { name: "הצגת הדף באנגלית" }).click();
    await expect(page).toHaveURL(/\/c\/headphones$/);
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  });

  test("unknown languages, pages and categories are real 404s", async ({ request }) => {
    for (const path of ["/fr", "/no-such-page", "/he/c/not-a-category"]) {
      expect([path, (await request.get(path)).status()]).toEqual([path, 404]);
    }
  });

  test("a Hebrew page fits a phone right to left, no sideways scroll", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/he/c/headphones");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe("Saved and Alerts in Hebrew", () => {
  const lifeP3 = (page: Page) => page.getByRole("article").filter({ hasText: "Soundcore Life P3" }).first();

  test("save from a Hebrew search, see it on the Hebrew Saved page, remove it", async ({ page }) => {
    await page.goto("/he/saved");
    await expect(page.getByRole("heading", { level: 1, name: "שמורים" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "עדיין לא שמרתם כלום" })).toBeVisible();

    await page.goto("/he/search?q=wireless+earbuds");
    await lifeP3(page)
      .getByRole("button", { name: /^שמירת / })
      .click();
    await expect(lifeP3(page).getByRole("button", { name: /^הסרת .* מהשמורים$/ })).toBeVisible();

    await page.getByRole("navigation", { name: "ראשי" }).getByRole("link", { name: "שמורים" }).click();
    await expect(page).toHaveURL(/\/he\/saved$/);
    const list = page.getByRole("list", { name: "מוצרים שמורים" });
    await expect(list).toContainText("בזמן השמירה");
    await expect(list.getByRole("link", { name: "השוואת המחירים של היום" })).toHaveAttribute(
      "href",
      /^\/he\/search\?/,
    );
    await list.getByRole("button", { name: /^הסרת .* מהשמורים$/ }).click();
    await expect(page.getByRole("heading", { name: "עדיין לא שמרתם כלום" })).toBeVisible();
  });

  test("a refused alert is explained in Hebrew by the server", async ({ page }) => {
    await page.goto("/he/search?q=wireless+earbuds");
    await lifeP3(page)
      .getByRole("button", { name: /^מעקב מחיר עבור / })
      .click();
    const sheet = page.getByRole("dialog");
    await sheet.getByRole("spinbutton").fill("95");
    await sheet.getByRole("button", { name: "יצירת התראה" }).click();
    await expect(sheet.getByRole("alert")).toHaveText("בחרו מחיר יעד נמוך מהמחיר של היום.");

    await page.goto("/he/alerts");
    await expect(page.getByRole("heading", { level: 1, name: "התראות מחיר" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "עדיין אין התראות מחיר" })).toBeVisible();
  });
});
