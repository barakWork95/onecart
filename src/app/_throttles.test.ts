import { clientIp, isSearchRequest, throttleBucket } from "@/app/_throttles";

describe("clientIp", () => {
  it("prefers x-real-ip, then the first x-forwarded-for hop", () => {
    expect(clientIp(new Headers({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "1.1.1.1" }))).toBe(
      "203.0.113.7",
    );
    expect(clientIp(new Headers({ "x-forwarded-for": " 198.51.100.2 , 10.0.0.1" }))).toBe("198.51.100.2");
    expect(clientIp(new Headers())).toBeNull();
    expect(clientIp(new Headers({ "x-forwarded-for": " " }))).toBeNull();
  });

  it("treats loopback as no client IP: `next start` forwards it on local runs and E2E", () => {
    for (const ip of ["::1", "127.0.0.1", "::ffff:127.0.0.1", "127.8.9.10"])
      expect([ip, clientIp(new Headers({ "x-forwarded-for": ip }))]).toEqual([ip, null]);
    expect(clientIp(new Headers({ "x-real-ip": "::1", "x-forwarded-for": "203.0.113.7" }))).toBeNull();
  });
});

describe("isSearchRequest", () => {
  const url = (path: string) => new URL(path, "https://onecartapp.com");

  it("counts a GET of /search with a query", () => {
    expect(isSearchRequest("GET", url("/search?q=jbl+flip+6"))).toBe(true);
    expect(isSearchRequest("GET", url("/search?q=jbl&page=3"))).toBe(true);
    // The Hebrew interface's search spends the same store quota.
    expect(isSearchRequest("GET", url("/he/search?q=jbl"))).toBe(true);
  });

  it("ignores the empty search page, other pages and Server Actions", () => {
    expect(isSearchRequest("GET", url("/search"))).toBe(false);
    expect(isSearchRequest("GET", url("/search?q=%20"))).toBe(false);
    expect(isSearchRequest("GET", url("/saved?q=x"))).toBe(false);
    expect(isSearchRequest("POST", url("/search?q=jbl"))).toBe(false);
  });
});

describe("throttleBucket", () => {
  const url = (path: string) => new URL(path, "https://onecartapp.com");
  const action = new Headers({ "next-action": "7f00ab" });

  it("sorts requests into the limit that applies to them", () => {
    expect(throttleBucket("GET", url("/search?q=jbl"), new Headers())).toBe("search");
    expect(throttleBucket("GET", url("/go/abc.def"), new Headers())).toBe("go");
    // Server Actions (Save, Alerts) POST to whichever page shows them.
    expect(throttleBucket("POST", url("/search?q=jbl"), action)).toBe("action");
    expect(throttleBucket("POST", url("/he/alerts"), action)).toBe("action");
    expect(throttleBucket("POST", url("/"), action)).toBe("action");
  });

  it("leaves plain page views alone", () => {
    expect(throttleBucket("GET", url("/saved"), new Headers())).toBeNull();
    expect(throttleBucket("GET", url("/c/headphones"), new Headers())).toBeNull();
    expect(throttleBucket("GET", url("/google"), new Headers())).toBeNull();
    expect(throttleBucket("POST", url("/saved"), new Headers())).toBeNull();
  });
});
