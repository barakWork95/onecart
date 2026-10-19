import { consoleClickRecorder } from "@/infrastructure/affiliate/console-click-recorder";

describe("consoleClickRecorder", () => {
  it("logs one JSON line per click", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    consoleClickRecorder.record({
      productId: "amazon:B1",
      provider: "amazon",
      affiliated: true,
      at: "2026-10-11T09:00:00.000Z",
      title: null,
      priceAgorot: null,
      bestDeal: false,
      locale: "en",
    });
    expect(JSON.parse(String(warn.mock.calls[0]?.[0]))).toEqual({
      level: "info",
      message: "go: outbound click",
      productId: "amazon:B1",
      provider: "amazon",
      affiliated: true,
      at: "2026-10-11T09:00:00.000Z",
      title: null,
      priceAgorot: null,
      bestDeal: false,
      locale: "en",
    });
    warn.mockRestore();
  });
});
