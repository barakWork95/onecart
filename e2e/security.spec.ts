import { expect, test } from "@playwright/test";

test.describe("security headers", () => {
  test("every kind of response carries the hardening headers", async ({ request }) => {
    for (const path of ["/", "/search?q=jbl", "/he/c/headphones", "/robots.txt", "/go/not-a-real-link"]) {
      const response = await request.get(path, { maxRedirects: 0 });
      const h = response.headers();
      expect(h["x-frame-options"], path).toBe("DENY");
      expect(h["x-content-type-options"], path).toBe("nosniff");
      expect(h["permissions-policy"], path).toBe("camera=(), microphone=(), geolocation=()");
      expect(h["strict-transport-security"], path).toContain("max-age=");
      expect(h["content-security-policy"], path).toContain("frame-ancestors 'none'");
      expect(h["content-security-policy"], path).not.toContain("unsafe-eval");
      expect(h["referrer-policy"], path).toBe(
        path.startsWith("/go/") ? "no-referrer" : "strict-origin-when-cross-origin",
      );
    }
  });

  test("pages run under the CSP without a single violation", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.addInitScript(() => {
      document.addEventListener("securitypolicyviolation", (e) => {
        console.error(`CSP violation: ${e.violatedDirective} ${e.blockedURI}`);
      });
    });
    for (const path of [
      "/",
      "/search?q=wireless+earbuds",
      "/c/headphones",
      "/he",
      "/he/search?q=jbl",
      "/saved",
      "/alerts",
    ]) {
      await page.goto(path, { waitUntil: "load" });
      await expect(page.locator("main")).toBeVisible();
    }
    // Hydrated: a client-side interaction still works under the policy.
    await page.getByRole("banner").getByRole("button", { name: "Toggle dark mode" }).click();
    // Only the policy is under test here (a local-only prefetch 404 of /privacy can log too).
    expect(errors.filter((e) => /CSP violation|Content Security Policy/i.test(e))).toEqual([]);
  });
});

test.describe("search input sanitization", () => {
  test("markup in a query is stripped before searching and never runs", async ({ page }) => {
    let dialog = false;
    page.on("dialog", async (d) => {
      dialog = true;
      await d.dismiss();
    });
    await page.goto(
      `/search?q=${encodeURIComponent('<img src=x onerror="alert(1)"><script>alert(2)</script>earbuds')}`,
    );
    const box = page.getByRole("searchbox");
    await expect(box).toHaveValue("alert(2) earbuds");
    await expect(page.locator("main img[src='x']")).toHaveCount(0);
    expect(dialog).toBe(false);
  });

  test("an overlong query is cut to 100 characters", async ({ page }) => {
    await page.goto(`/search?q=${"wireless ".repeat(30)}earbuds`);
    const value = await page.getByRole("searchbox").inputValue();
    expect(value.length).toBeLessThanOrEqual(100);
    expect(value.startsWith("wireless wireless")).toBe(true);
  });
});
