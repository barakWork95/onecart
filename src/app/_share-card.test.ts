import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LOGO_SVG } from "@/app/_share-card";

describe("share card", () => {
  it("inlines the current app icon", () => {
    expect(LOGO_SVG).toBe(readFileSync(join(process.cwd(), "src/app/icon.svg"), "utf8").trim());
  });
});
