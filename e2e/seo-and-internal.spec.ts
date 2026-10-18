import { expect, test } from "@playwright/test";

const ADMIN = { username: "admin", password: "e2e-only-admin-password-0123" };
const basic = (user: string, pass: string) => `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;

test.describe("share previews and sitemap", () => {
  test("pages carry a large share card that renders", async ({ page, request }) => {
    await page.goto("/");
    const og = await page.locator('meta[property="og:image"]').getAttribute("content");
    expect(og).toMatch(/^https:\/\/www\.onecartapp\.com\/opengraph-image/);
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute("content", "summary_large_image");

    // Fetched from this server: the absolute URL points at production.
    const image = await request.get(new URL(og ?? "").pathname);
    expect(image.status()).toBe(200);
    expect(image.headers()["content-type"]).toBe("image/png");

    // Pages with their own Open Graph tags keep the card too, in every language.
    for (const path of ["/c", "/c/headphones", "/privacy", "/he/c/headphones"]) {
      await page.goto(path);
      await expect(page.locator('meta[property="og:image"]'), path).toHaveAttribute(
        "content",
        /\/opengraph-image/,
      );
      await expect(page.locator('meta[name="twitter:image"]'), path).toHaveAttribute(
        "content",
        /\/twitter-image/,
      );
    }
  });

  test("the sitemap lists the static pages and robots.txt points to it", async ({ request }) => {
    const sitemap = await (await request.get("/sitemap.xml")).text();
    expect(sitemap).toContain("<loc>https://www.onecartapp.com/privacy</loc>");
    expect(sitemap).not.toContain("/search");
    expect(await (await request.get("/robots.txt")).text()).toContain(
      "Sitemap: https://www.onecartapp.com/sitemap.xml",
    );
  });
});

test.describe("internal click report", () => {
  test("asks for the password and refuses a wrong one", async ({ request }) => {
    const anonymous = await request.get("/internal/clicks");
    expect(anonymous.status()).toBe(401);
    expect(anonymous.headers()["www-authenticate"]).toContain("Basic");

    const wrong = await request.get("/internal/clicks", {
      headers: { authorization: basic("admin", "nope") },
    });
    expect(wrong.status()).toBe(401);
  });

  test("opens with the password (no click storage in E2E)", async ({ browser }) => {
    const context = await browser.newContext({ httpCredentials: ADMIN });
    const page = await context.newPage();
    const response = await page.goto("/internal/clicks");
    expect(response?.headers()["x-robots-tag"]).toBe("noindex, nofollow");
    await expect(page.getByRole("heading", { level: 1, name: "Outbound clicks" })).toBeVisible();
    await expect(page.getByText(/Click storage isn.t configured/)).toBeVisible();
    await context.close();
  });
});

test.describe("internal status", () => {
  const CRON = { Authorization: "Bearer e2e-only-cron-secret-0123456789" };

  test("crons record their runs, which the password-protected status page shows", async ({
    browser,
    request,
  }) => {
    const warmed = await request.get("/api/cron/warm-trending", { headers: CRON });
    const body = (await warmed.json()) as { ok: boolean; problems: string[]; alerts: unknown };
    expect(body.ok).toBe(true);
    expect(body.problems).toEqual([]);
    expect(body.alerts).toMatchObject({ delivered: 0 });

    expect((await request.get("/internal/status")).status()).toBe(401);
    const context = await browser.newContext({ httpCredentials: ADMIN });
    const page = await context.newPage();
    await page.goto("/internal/status");
    await expect(page.getByRole("heading", { level: 1, name: "Status" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Cron runs" })).toContainText("warm-trending ok");
    // Demo data: no live store quotas, no database.
    await expect(page.getByRole("region", { name: "Quotas" })).toContainText(
      "No live stores configured here.",
    );
    await expect(page.getByRole("region", { name: "Price history (rows per day)" })).toContainText(
      "Not configured here.",
    );
    // Push is configured (test keys): the ops alert switch is there (blocked in headless Chromium).
    await expect(page.getByRole("region", { name: "Ops alerts" })).toBeVisible();
    await page.getByRole("button", { name: "Send a test alert" }).click();
    await expect(page.getByRole("status").filter({ hasText: "No browser is listed yet" })).toBeVisible();
    await context.close();
  });
});
