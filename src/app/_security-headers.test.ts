import { contentSecurityPolicy, securityHeaderRules } from "./_security-headers";

const directives = (csp: string) =>
  Object.fromEntries(
    csp.split(";").map((d) => {
      const [name, ...values] = d.trim().split(/\s+/);
      return [name, values];
    }),
  );

describe("contentSecurityPolicy", () => {
  const prod = directives(contentSecurityPolicy({ dev: false }));

  it("locks everything to our own origin by default and forbids framing, plugins and base/form hijacks", () => {
    expect(prod["default-src"]).toEqual(["'self'"]);
    expect(prod["frame-ancestors"]).toEqual(["'none'"]);
    expect(prod["object-src"]).toEqual(["'none'"]);
    expect(prod["base-uri"]).toEqual(["'self'"]);
    expect(prod["form-action"]).toEqual(["'self'"]);
    expect(prod["connect-src"]).toEqual(["'self'"]);
    expect(prod).toHaveProperty("upgrade-insecure-requests");
  });

  it("allows only the store image CDNs for remote images", () => {
    expect(prod["img-src"]).toEqual(
      expect.arrayContaining([
        "'self'",
        "data:",
        "https://*.alicdn.com",
        "https://*.aliexpress-media.com",
        "https://m.media-amazon.com",
        "https://i.ebayimg.com",
      ]),
    );
    expect(prod["img-src"]).not.toContain("https:");
    expect(prod["img-src"]).not.toContain("*");
  });

  it("never allows eval in production, only in dev (React's dev tooling needs it)", () => {
    expect(prod["script-src"]).not.toContain("'unsafe-eval'");
    expect(directives(contentSecurityPolicy({ dev: true }))["script-src"]).toContain("'unsafe-eval'");
    expect(prod["script-src"]).not.toContain("https:");
  });
});

describe("securityHeaderRules", () => {
  const rules = securityHeaderRules({ dev: false });
  const forPath = (path: string) => {
    const out: Record<string, string> = {};
    for (const rule of rules)
      if (new RegExp(`^${rule.source.replace("/:path*", "(/.*)?")}$`).test(path))
        for (const h of rule.headers) out[h.key] = h.value;
    return out;
  };

  it("sends the hardening headers on pages", () => {
    const h = forPath("/search");
    expect(h["X-Frame-Options"]).toBe("DENY");
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["Permissions-Policy"]).toBe("camera=(), microphone=(), geolocation=()");
    expect(h["Strict-Transport-Security"]).toMatch(/^max-age=\d{8,}; includeSubDomains$/);
    expect(h["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
  });

  it("keeps /go links from leaking the search page as referrer", () => {
    expect(forPath("/go/abc")["Referrer-Policy"]).toBe("no-referrer");
    expect(forPath("/go/abc")["X-Frame-Options"]).toBe("DENY");
  });

  it("keeps the service worker's stricter policy", () => {
    expect(forPath("/sw.js")["Content-Security-Policy"]).toBe("default-src 'self'; script-src 'self'");
  });
});
