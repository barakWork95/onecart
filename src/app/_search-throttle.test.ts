import { clientIp, isSearchRequest } from "@/app/_search-throttle";

describe("clientIp", () => {
  it("prefers x-real-ip, then the first x-forwarded-for hop", () => {
    expect(clientIp(new Headers({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "1.1.1.1" }))).toBe(
      "203.0.113.7",
    );
    expect(clientIp(new Headers({ "x-forwarded-for": " 198.51.100.2 , 10.0.0.1" }))).toBe("198.51.100.2");
    expect(clientIp(new Headers())).toBeNull();
    expect(clientIp(new Headers({ "x-forwarded-for": " " }))).toBeNull();
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
