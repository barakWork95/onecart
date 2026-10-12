import { matchSearchText } from "@/domain/matching/match-query";

describe("matchSearchText", () => {
  it.each([
    [
      "Sony WH-CH520 Wireless Bluetooth On-Ear Headphones with Microphone, Up to 50 Hours Battery Life",
      "Sony WH-CH520 Wireless Bluetooth On-Ear Headphones",
    ],
    ["Duo 6 Qt 7-in-1 Electric Pressure Cooker, Stainless Steel", "Duo 6 Qt 7-in-1 Electric Pressure Cooker"],
    ["Flip 6 - Portable Waterproof Speaker - Black", "Flip 6"],
    [
      "AirPods Pro (2nd Generation) Wireless Ear Buds with USB-C Charging",
      "AirPods Pro 2nd Generation Wireless Ear Buds",
    ],
    [
      "New JBL Flip 6 Portable Bluetooth Speaker Black Waterproof IP67 Wireless 12H",
      "JBL Flip 6 Portable Bluetooth Speaker Black Waterproof",
    ],
    [
      "BRAND NEW SEALED Apple AirPods Wireless Bluetooth In-Ear Earbuds w/Charging Case",
      "Apple AirPods Wireless Bluetooth In-Ear Earbuds",
    ],
    ["1pcs New for SONY WH-1000XM5 XM5 16-Pin Connector", "for SONY WH-1000XM5 XM5 16-Pin Connector"],
    ["Kindle Paperwhite | 16GB", "Kindle Paperwhite"],
  ])("%p → %p", (title, expected) => {
    expect(matchSearchText(title)).toBe(expected);
  });

  it("falls back to the whole title when the head is too short to search", () => {
    expect(matchSearchText("X, wireless mouse")).toBe("X, wireless mouse");
  });
});
