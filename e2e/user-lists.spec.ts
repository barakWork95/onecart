import { expect, test, type Page } from "@playwright/test";

const CRON_SECRET = "e2e-only-cron-secret-0123456789";
const LIFE_P3 = /Soundcore Life P3/;

/** The results card for the Life P3 group (4 stores, best price ₪89 on AliExpress). */
function lifeP3Card(page: Page) {
  return page
    .getByRole("list", { name: "Products" })
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name: LIFE_P3 }) });
}

/**
 * Clicks Save and waits for the server to confirm. The bookmark fills
 * optimistically; the button is disabled until the Server Action returns.
 */
async function saveLifeP3(page: Page) {
  await lifeP3Card(page)
    .getByRole("button", { name: /^Save / })
    .click();
  const saved = lifeP3Card(page).getByRole("button", { name: /Remove .* from Saved/ });
  await expect(saved).toHaveAttribute("aria-pressed", "true");
  await expect(saved).toBeEnabled();
}

/** Creates an alert with the suggested target and waits for the sheet to close (server confirmed). */
async function trackLifeP3(page: Page) {
  await lifeP3Card(page)
    .getByRole("button", { name: /^Track price of / })
    .click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("button", { name: "Create alert" }).click();
  await expect(sheet).toBeHidden();
}

test.describe("Saved (wishlist)", () => {
  test("save from results → listed on Saved → remove → empty state", async ({ page }) => {
    await page.goto("/saved");
    await expect(page.getByRole("heading", { name: "Nothing saved yet" })).toBeVisible();

    await page.goto("/search?q=wireless+earbuds");
    await saveLifeP3(page);

    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Saved" }).click();
    const list = page.getByRole("list", { name: "Saved products" });
    await expect(list.getByRole("listitem")).toHaveCount(1);
    await expect(list).toContainText("SoundCore Life P3 ANC Wireless Earbuds");
    await expect(list).toContainText("₪89 on AliExpress when saved");

    await list.getByRole("button", { name: /Remove .* from Saved/ }).click();
    await expect(page.getByRole("heading", { name: "Nothing saved yet" })).toBeVisible();
  });

  test("saving from a Hebrew search keeps the Hebrew query for re-comparing", async ({ page }) => {
    await page.goto(`/search?q=${encodeURIComponent("אוזניות אלחוטיות")}`);
    await saveLifeP3(page);

    await page.goto("/saved");
    const compare = page.getByRole("link", { name: "Compare today's prices" });
    await expect(compare).toHaveAttribute(
      "href",
      `/search?${new URLSearchParams({ q: "אוזניות אלחוטיות" }).toString()}`,
    );
    await compare.click();
    await expect(page.getByText("“wireless earbuds”")).toBeVisible();
  });

  test("saved state survives reloads and is private to each visitor", async ({ page, browser }) => {
    await page.goto("/search?q=wireless+earbuds");
    await saveLifeP3(page);

    await page.reload();
    await expect(lifeP3Card(page).getByRole("button", { name: /Remove .* from Saved/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    const stranger = await browser.newContext();
    const strangerPage = await stranger.newPage();
    await strangerPage.goto(new URL("/saved", page.url()).toString());
    await expect(strangerPage.getByRole("heading", { name: "Nothing saved yet" })).toBeVisible();
    await stranger.close();
  });

  test("Go links on Saved are signed and redirect to the store", async ({ page, request }) => {
    await page.goto("/search?q=wireless+earbuds");
    await saveLifeP3(page);

    await page.goto("/saved");
    const href = await page.getByRole("link", { name: /Go to AliExpress/ }).getAttribute("href");
    expect(href).toMatch(/^\/go\/aliexpress%3A\d+\?d=/);
    const response = await request.get(href ?? "", { maxRedirects: 0 });
    expect(response.status()).toBe(302);
    expect(new URL(response.headers()["location"] ?? "").hostname).toBe("www.aliexpress.com");
  });
});

test.describe("Price alerts", () => {
  test("create an alert with the suggested target → Alerts tab shows it watching → delete", async ({
    page,
  }) => {
    await page.goto("/alerts");
    await expect(page.getByRole("heading", { name: "No price alerts yet" })).toBeVisible();

    await page.goto("/search?q=wireless+earbuds");
    await lifeP3Card(page)
      .getByRole("button", { name: /^Track price of / })
      .click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByText(/Today's best landed price is ₪89.00/)).toBeVisible();
    await expect(sheet.getByRole("spinbutton")).toHaveValue("80");
    await sheet.getByRole("button", { name: "Create alert" }).click();
    await expect(sheet).toBeHidden();
    await expect(lifeP3Card(page).getByRole("button", { name: /^Change price alert for / })).toBeVisible();

    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Alerts" }).click();
    const list = page.getByRole("list", { name: "Price alerts" });
    await expect(list.getByRole("listitem")).toHaveCount(1);
    await expect(list).toContainText("Watching");
    await expect(list).toContainText("Target ₪80.00");
    await expect(list).toContainText("Now ₪89.00");

    await list.getByRole("button", { name: /Delete price alert/ }).click();
    await expect(page.getByRole("heading", { name: "No price alerts yet" })).toBeVisible();
  });

  test("rejects a target that isn't below today's price, keeping the sheet open", async ({ page }) => {
    await page.goto("/search?q=wireless+earbuds");
    await lifeP3Card(page)
      .getByRole("button", { name: /^Track price of / })
      .click();
    const sheet = page.getByRole("dialog");
    await sheet.getByRole("spinbutton").fill("95");
    await sheet.getByRole("button", { name: "Create alert" }).click();
    await expect(sheet.getByRole("alert")).toHaveText("Pick a target below today's price.");
    await expect(sheet).toBeVisible();

    await page.goto("/alerts");
    await expect(page.getByRole("heading", { name: "No price alerts yet" })).toBeVisible();
  });

  test("the daily checker requires the cron secret and reports what it checked", async ({
    page,
    request,
  }) => {
    await page.goto("/search?q=wireless+earbuds");
    await trackLifeP3(page);

    expect((await request.get("/api/cron/price-alerts")).status()).toBe(401);
    expect(
      (await request.get("/api/cron/price-alerts", { headers: { Authorization: "Bearer wrong" } })).status(),
    ).toBe(401);

    const response = await request.get("/api/cron/price-alerts", {
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
    });
    expect(response.status()).toBe(200);
    const summary = (await response.json()) as Record<string, number>;
    expect(summary.checked).toBeGreaterThanOrEqual(1);
    expect(summary.failedSearches).toBe(0);

    // Demo prices are static, so nothing drops: the alert keeps watching with today's price.
    await page.goto("/alerts");
    await expect(page.getByRole("list", { name: "Price alerts" })).toContainText("Watching");
  });
});
