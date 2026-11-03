import { expect, test } from "@playwright/test";

for (const locale of ["en", "he"] as const) {
  test(`${locale}: Amazon remains a direct destination without prices or alerts`, async ({
    page,
    request,
  }, testInfo) => {
    const prefix = locale === "he" ? "/he" : "";
    await page.goto(`${prefix}/search?q=soundcore+life+p3`);
    const card = page.getByRole("article").first();
    const amazon = card.getByRole("link", {
      name: locale === "he" ? "בדוק מחיר ב-Amazon" : "Check price on Amazon",
    });
    await expect(amazon).toHaveAttribute("href", /https:\/\/www\.amazon\.com\/s\?.*tag=onecart-e2e-20/);
    await expect(page.locator('a[href*="/go/amazon"]')).toHaveCount(0);
    await expect(page.locator('img[src*="media-amazon.com"]')).toHaveCount(0);
    await expect(card.getByRole("button", { name: /Track price|מעקב מחיר/ })).toHaveCount(0);
    await expect(page.getByText(/Amazon serves recorded|Amazon מציגה נתונים מוקלטים/)).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath("amazon-interim.png"), fullPage: true });
    await page.goto(`${prefix}/alerts`);
    await expect(
      page.getByText(locale === "he" ? /ההתראות הקיימות נשמרות/ : /Existing alerts are kept/),
    ).toBeVisible();
    const cron = await request.get("/api/cron/price-alerts", {
      headers: { Authorization: "Bearer e2e-only-cron-secret-0123456789" },
    });
    expect(cron.status()).toBe(200);
    expect(await cron.json()).toMatchObject({ ok: true, paused: true });
    await page.goto(`${prefix}/c/headphones`);
    await expect(page.locator('a[href*="/go/amazon"]')).toHaveCount(0);
    await expect(page.locator('img[src*="media-amazon.com"]')).toHaveCount(0);
  });
}
