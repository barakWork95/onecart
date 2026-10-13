import { config } from "@/proxy";

describe("proxy matcher", () => {
  it("keeps router prefetches of /search out of the proxy (Next strips their headers from the request)", () => {
    expect(config.matcher[0]).toEqual({
      source: "/search",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    });
  });
});
