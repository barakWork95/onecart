import { expect, test, type Page } from "@playwright/test";

const cards = (page: Page) => page.getByRole("list", { name: "Products" }).getByRole("article");

test.describe("search flow", () => {
  test("Hebrew search from the homepage → grouped results → store comparison sheet", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/OneCart/);
    await expect(page.getByRole("heading", { level: 1, name: "Find the best price." })).toBeVisible();

    const box = page.getByRole("searchbox", { name: "Search products" });
    await box.fill("אוזניות אלחוטיות");
    await box.press("Enter");

    await expect(page).toHaveURL(/\/search\?q=/);
    await expect(page.getByText("“wireless earbuds”")).toBeVisible();
    await expect(page.getByText("Demo data")).toBeVisible();
    await expect(page.getByRole("searchbox", { name: "Search products" })).toHaveValue("אוזניות אלחוטיות");

    // Default "best match": the stores' own ranking (Life P3 is #1 at every store).
    await expect(page.getByText(/Best match/)).toBeVisible();
    await expect(cards(page)).toHaveCount(3);
    await expect(cards(page).getByRole("heading", { level: 2 })).toHaveText([
      /Soundcore Life P3/,
      /Soundcore Space A40/,
      /Baseus Bowie M2\+/,
    ]);
    const lifeP3 = cards(page).nth(0);
    await expect(lifeP3.getByText("₪89", { exact: true })).toBeVisible();

    await lifeP3.getByRole("button", { name: /Compare 4 stores/ }).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByRole("heading", { name: /Compare 4 stores:/ })).toBeVisible();

    const rows = sheet.getByRole("listitem");
    await expect(rows).toHaveCount(4);
    await expect(rows.nth(0)).toContainText("AliExpress");
    await expect(rows.nth(0)).toContainText("Best price");
    await expect(rows.nth(0)).toContainText("₪89");
    await expect(rows.nth(1)).toContainText("+₪9 vs best");
    await expect(sheet.getByText("Fastest")).toBeVisible();

    const go = rows.nth(0).getByRole("link", { name: /Go to AliExpress/ });
    await expect(go).toHaveAttribute("href", /^\/go\/aliexpress%3A\d+\?d=/);
    await expect(go).toHaveAttribute("target", "_blank");

    await sheet.getByRole("button", { name: "Close comparison" }).click();
    await expect(sheet).toBeHidden();
  });

  test("results default to best match; a sort chip re-sorts and a second tap clears it", async ({ page }) => {
    await page.goto("/search?q=wireless+earbuds");
    const sortNav = page.getByRole("navigation", { name: "Sort results" });
    await expect(sortNav.locator("[aria-current]")).toHaveCount(0);

    const lowest = sortNav.getByRole("link", { name: "Lowest Price" });
    await lowest.click();
    await expect(page).toHaveURL(/sort=landed_price_asc/);
    await expect(lowest).toHaveAttribute("aria-current", "true");
    await expect(cards(page).getByRole("heading", { level: 2 })).toHaveText([
      /Baseus Bowie M2\+/,
      /Soundcore Life P3/,
      /Soundcore Space A40/,
    ]);

    await lowest.click();
    await expect(page).not.toHaveURL(/sort=/);
    await expect(sortNav.locator("[aria-current]")).toHaveCount(0);
    await expect(cards(page).getByRole("heading", { level: 2 })).toHaveText([
      /Soundcore Life P3/,
      /Soundcore Space A40/,
      /Baseus Bowie M2\+/,
    ]);
  });

  test("navigation: bottom tab bar on phones, header links on desktop", async ({ page }, testInfo) => {
    await page.goto("/search?q=earbuds");
    const headerNav = page.getByRole("banner").getByRole("navigation", { name: "Main", includeHidden: true });
    const tabBar = page.locator("nav.fixed");
    if (testInfo.project.name === "mobile") {
      await expect(tabBar).toBeVisible();
      await expect(headerNav).toBeHidden();
    } else {
      await expect(headerNav).toBeVisible();
      await expect(tabBar).toBeHidden();
      await expect(headerNav.getByRole("link", { name: "Compare" })).toHaveAttribute("aria-current", "page");
    }
  });

  test("results show as a multi-column grid with large square images", async ({ page }) => {
    await page.goto("/search?q=wireless+earbuds");
    await expect(cards(page)).toHaveCount(3);
    const boxes = await cards(page).evaluateAll((els) =>
      els.map((el) => el.getBoundingClientRect().toJSON() as DOMRect),
    );
    // At least two cards share a row (same top) at every viewport we test.
    expect(new Set(boxes.map((b) => Math.round(b.top))).size).toBeLessThan(boxes.length);
    const image = cards(page).first().locator("div.aspect-square");
    const box = await image.boundingBox();
    expect(box && Math.abs(box.width - box.height)).toBeLessThan(2);
    expect(box?.width ?? 0).toBeGreaterThan(140);
  });

  test("sorting by fastest delivery reorders the groups and updates the URL", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Wireless earbuds" }).click();
    await expect(cards(page)).toHaveCount(3);

    await page.getByRole("link", { name: "Fastest Delivery" }).click();
    await expect(page).toHaveURL(/sort=delivery_fastest/);
    await expect(page.getByRole("link", { name: "Fastest Delivery" })).toHaveAttribute(
      "aria-current",
      "true",
    );
    // Amazon delivers Life P3 in 4 days and Space A40 in 5.
    await expect(cards(page).getByRole("heading", { level: 2 })).toHaveText([
      /Soundcore Life P3/,
      /Soundcore Space A40/,
      /Baseus Bowie M2\+/,
    ]);
  });

  test("the comparison sheet works from the keyboard", async ({ page }) => {
    await page.goto("/search?q=wireless+earbuds");
    const trigger = page.getByRole("button", { name: /Compare 4 stores/ });
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
  });

  test("matches the same model across stores despite different spellings", async ({ page }) => {
    await page.goto("/search?q=sony+headphones");
    await expect(cards(page)).toHaveCount(1);
    await expect(page.getByRole("button", { name: /Compare 2 stores/ })).toBeVisible();
  });

  test("single-store results link to the store via /go", async ({ page }) => {
    // Only AliExpress lists the dashboard variant of the car mount.
    await page.goto("/search?q=dashboard+mount");
    await expect(cards(page)).toHaveCount(1);
    await expect(page.getByRole("button", { name: /Compare/ })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /View deal/ })).toHaveAttribute(
      "href",
      /^\/go\/aliexpress%3A/,
    );
  });

  test("shows a helpful empty state when nothing matches", async ({ page }) => {
    await page.goto("/search?q=espresso+machine");
    await expect(page.getByRole("heading", { name: "No matches" })).toBeVisible();
  });

  test("an empty /search shows suggestions instead of results", async ({ page }) => {
    await page.goto("/search");
    await expect(page.getByRole("heading", { name: "Try searching for" })).toBeVisible();
    await expect(page.getByRole("searchbox", { name: "Search products" })).toBeFocused();
  });

  test("bottom navigation marks the current tab and reaches every section", async ({ page }) => {
    await page.goto("/search?q=earbuds");
    const nav = page.getByRole("navigation", { name: "Main" });
    await expect(nav.getByRole("link", { name: "Compare" })).toHaveAttribute("aria-current", "page");
    await nav.getByRole("link", { name: "Saved" }).click();
    await expect(page).toHaveURL(/\/saved$/);
    await expect(nav.getByRole("link", { name: "Saved" })).toHaveAttribute("aria-current", "page");
    await nav.getByRole("link", { name: "Alerts" }).click();
    await expect(page).toHaveURL(/\/alerts$/);
    await nav.getByRole("link", { name: "Discover" }).click();
    await expect(page).toHaveURL(/\/$/);
  });
});

test.describe("outbound redirect (/go)", () => {
  async function goHref(page: Page, store: RegExp): Promise<string> {
    await page.goto("/search?q=wireless+earbuds");
    await page.getByRole("button", { name: /Compare 4 stores/ }).click();
    const href = await page.getByRole("dialog").getByRole("link", { name: store }).getAttribute("href");
    if (!href) throw new Error("missing Go href");
    return href;
  }

  test("redirects to the store with our affiliate tag and safe headers", async ({ page, request }) => {
    const href = await goHref(page, /Go to Amazon/);
    const response = await request.get(href, { maxRedirects: 0 });

    expect(response.status()).toBe(302);
    const location = new URL(response.headers()["location"] ?? "");
    expect(location.hostname).toBe("www.amazon.com");
    expect(location.searchParams.get("tag")).toBe("onecart-e2e-20");
    expect(response.headers()["cache-control"]).toBe("no-store");
    expect(response.headers()["referrer-policy"]).toBe("no-referrer");
    expect(response.headers()["x-robots-tag"]).toBe("noindex, nofollow");
  });

  test("tags eBay links with Partner Network parameters", async ({ page, request }) => {
    const response = await request.get(await goHref(page, /Go to eBay/), { maxRedirects: 0 });
    const location = new URL(response.headers()["location"] ?? "");
    expect(location.hostname).toBe("www.ebay.com");
    expect(location.searchParams.get("campid")).toBe("5338000000");
    expect(location.searchParams.get("mkrid")).toBe("711-53200-19255-0");
  });

  test("passes stores without an affiliate program through untagged", async ({ page, request }) => {
    const response = await request.get(await goHref(page, /Go to AliExpress/), { maxRedirects: 0 });
    expect(response.status()).toBe(302);
    expect(new URL(response.headers()["location"] ?? "").hostname).toBe("www.aliexpress.com");
  });

  test("refuses tampered, re-targeted, or unsigned links with a 404, never a redirect", async ({
    page,
    request,
  }) => {
    const href = await goHref(page, /Go to Amazon/);
    const url = new URL(href, "http://localhost");
    const forgedPayload = Buffer.from(
      JSON.stringify({ v: 1, p: "amazon", u: "https://evil.example/" }),
    ).toString("base64url");

    const attempts = [
      `${url.pathname}?d=${forgedPayload}&s=${url.searchParams.get("s")}`,
      `/go/${encodeURIComponent("amazon:B0OTHER0001")}${url.search}`,
      `${url.pathname}`,
      `/go/anything?url=${encodeURIComponent("https://evil.example/")}`,
    ];
    for (const attempt of attempts) {
      const response = await request.get(attempt, { maxRedirects: 0 });
      expect(response.status(), attempt).toBe(404);
      expect(response.headers()["location"], attempt).toBeUndefined();
    }
  });

  test("clicking Go opens the store in a new tab", async ({ page, context }) => {
    await page.goto("/search?q=wireless+earbuds");
    await page.getByRole("button", { name: /Compare 4 stores/ }).click();
    // Intercept the external store so the test never leaves localhost.
    await context.route("https://www.amazon.com/**", (route) =>
      route.fulfill({ status: 200, body: "store" }),
    );
    const [popup] = await Promise.all([
      context.waitForEvent("page"),
      page
        .getByRole("dialog")
        .getByRole("link", { name: /Go to Amazon/ })
        .click(),
    ]);
    await popup.waitForLoadState();
    expect(new URL(popup.url()).searchParams.get("tag")).toBe("onecart-e2e-20");
  });
});

test("the Amazon Associates disclosure appears on every page", async ({ page }) => {
  for (const route of ["/", "/search?q=wireless+earbuds", "/saved", "/alerts"]) {
    await page.goto(route);
    const footer = page.getByRole("contentinfo");
    await footer.scrollIntoViewIfNeeded();
    await expect(
      footer.getByText("As an Amazon Associate I earn from qualifying purchases.", { exact: true }),
      route,
    ).toBeVisible();
  }
});
