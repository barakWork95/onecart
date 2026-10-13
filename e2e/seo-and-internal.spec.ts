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
