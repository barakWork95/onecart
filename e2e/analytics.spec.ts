import { expect, test, type Page } from "@playwright/test";

type Recorded = { name: string; data: Record<string, unknown> };

/**
 * Stands in for the Vercel Web Analytics script (not loaded outside Vercel): `track()`
 * hands each event to `window.va`, so recording it shows exactly what would be sent.
 */
async function recordEvents(page: Page) {
  await page.addInitScript(() => {
    const events: unknown[] = [];
    Object.assign(window, {
      __events: events,
      va: (kind: string, payload: unknown) => {
        if (kind === "event") events.push(payload);
      },
    });
  });
}

const events = (page: Page) => page.evaluate(() => (window as unknown as { __events: Recorded[] }).__events);

test.describe("analytics events", () => {
  test("search, comparison and a store click are recorded, and the click still opens the store", async ({
    page,
    context,
  }) => {
    await recordEvents(page);
    // Answer /go locally: the click must reach it, but never a real store.
    await context.route("**/go/**", (route) =>
      route.fulfill({ status: 200, contentType: "text/plain", body: "store" }),
    );

    await page.goto("/he");
    await page.getByRole("searchbox", { name: "חיפוש מוצרים" }).fill("wireless earbuds");
    await page.getByRole("searchbox", { name: "חיפוש מוצרים" }).press("Enter");
    await expect(page).toHaveURL(/\/he\/search\?q=wireless\+earbuds/);

    const card = page
      .getByRole("list", { name: "מוצרים" })
      .getByRole("article")
      .filter({ hasText: "Soundcore Life P3" })
      .first();
    await card.getByRole("button", { name: /^השוואה בין \d+ חנויות עבור/ }).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();

    const [popup] = await Promise.all([
      context.waitForEvent("page"),
      sheet
        .getByRole("link", { name: /^מעבר ל-/ })
        .first()
        .click(),
    ]);
    await expect(popup.getByText("store")).toBeVisible();

    const recorded = await events(page);
    expect(recorded.map((e) => e.name)).toEqual(["search_query", "view_comparison", "outbound_click"]);
    expect(recorded[0]?.data).toEqual({ query: "wireless earbuds", locale: "he", source: "input" });
    expect(recorded[1]?.data).toMatchObject({ locale: "he", store_count: expect.any(Number) });
    expect(recorded[2]?.data).toMatchObject({
      store: expect.stringMatching(/^(aliexpress|ebay|amazon|temu)$/),
      price_ils: expect.any(Number),
      is_best_deal: true,
      locale: "he",
    });
  });

  test("a popular-search pill and a save are recorded", async ({ page }) => {
    await recordEvents(page);
    await page.goto("/");
    await page.getByRole("link", { name: "JBL Flip 6" }).click();
    await expect(page).toHaveURL(/\/search\?q=jbl\+flip\+6/);
    // The pill navigates client-side; read its event before the full page load below resets the recorder.
    expect(await events(page)).toEqual([
      { name: "search_query", data: { query: "jbl flip 6", locale: "en", source: "trending_pill" } },
    ]);
    // The demo catalog's earbuds have Save buttons (a direct visit: not a tracked search).
    await page.goto("/search?q=wireless+earbuds");
    const card = page
      .getByRole("list", { name: "Products" })
      .getByRole("article")
      .filter({ hasText: "Soundcore Life P3" })
      .first();
    await card.getByRole("button", { name: /^Save / }).click();
    await expect(card.getByRole("button", { name: /^Remove .* from Saved$/ })).toBeVisible();

    await expect.poll(async () => (await events(page)).map((e) => e.name)).toEqual(["save_item"]);
    expect((await events(page))[0]?.data).toEqual({
      product_title: expect.stringContaining("Soundcore Life P3"),
      price_ils: expect.any(Number),
      locale: "en",
    });
  });
});
