import { NextRequest } from "next/server";
import { hebrewOff } from "@/proxy";

let hebrew = "false";
jest.mock("@/config/env", () => ({ env: () => ({ HEBREW_UI: hebrew === "true" }) }));

const request = (path: string) => new NextRequest(new URL(path, "https://www.onecartapp.com"));

describe("hebrewOff", () => {
  it("answers every /he page with a 404 while the Hebrew interface is off", () => {
    hebrew = "false";
    for (const path of ["/he", "/he/c/headphones", "/he/search?q=jbl"]) {
      expect([path, hebrewOff(request(path))?.status]).toEqual([path, 404]);
    }
    expect(hebrewOff(request("/c/headphones"))).toBeNull();
    // A path merely starting with the letters "he" is an English page.
    expect(hebrewOff(request("/headphones"))).toBeNull();
  });

  it("lets /he through once it's on", () => {
    hebrew = "true";
    expect(hebrewOff(request("/he/c/headphones"))).toBeNull();
  });
});
