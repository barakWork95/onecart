import { expect, test } from "@playwright/test";

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
