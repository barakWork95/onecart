import { consoleLogger } from "@/infrastructure/logging/console-logger";

describe("consoleLogger", () => {
  it("writes one JSON line per warning", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    consoleLogger.warn("search: provider failed", { provider: "ebay" });
    expect(warn).toHaveBeenCalledWith(
      '{"level":"warn","message":"search: provider failed","provider":"ebay"}',
    );
    warn.mockRestore();
  });
});
