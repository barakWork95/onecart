import { amazonCheckUrl } from "@/domain/affiliate/amazon-check";

it("creates a direct Amazon search with the affiliate tag, never a price or redirect", () => {
  const url = new URL(amazonCheckUrl("Sony WH-1000XM5 & case", "onecart-test-20"));
  expect(url.origin).toBe("https://www.amazon.com");
  expect(url.pathname).toBe("/s");
  expect(Object.fromEntries(url.searchParams)).toEqual({
    k: "Sony WH-1000XM5 & case",
    tag: "onecart-test-20",
  });
});
it("handles empty queries and unconfigured tags", () => {
  expect(new URL(amazonCheckUrl(" ")).searchParams.get("k")).toBe("headphones");
  expect(new URL(amazonCheckUrl("x", " ")).searchParams.has("tag")).toBe(false);
  expect(new URL(amazonCheckUrl("x".repeat(500))).searchParams.get("k")).toHaveLength(200);
});
