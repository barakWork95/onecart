import { attributeConflict, extractAttributes } from "@/domain/matching/item-attributes";

const attrs = (title: string) =>
  Object.fromEntries([...extractAttributes(title)].map(([k, v]) => [k, [...v].sort()]));

describe("extractAttributes", () => {
  it.each<[string, Record<string, string[]>]>([
    ["5M LED Strip Lights RGB 5050 USB Powered", { length_mm: ["5000"] }],
    ["LED Strip 16.4ft RGB Bluetooth App Control", { length_mm: ["5000"] }],
    ["Desk Mat 80 x 30 cm Waterproof Leather Mouse Pad", { length_mm: ["300", "800"] }],
    ["Magnetic Car Phone Holder 15W Wireless Charger Mount", { power_w: ["15"] }],
    ["Car Charger 2 Port 36W PD QC3.0 12V 24V", { power_w: ["36"], voltage_v: ["12", "24"] }],
    ["20000mAh Power Bank 22.5W", { capacity_mah: ["20000"], power_w: ["22.5"] }],
    ["Kitchen Scale 5kg 0.1g Digital", { weight_g: ["0.1", "5000"] }],
    ["Glass Food Storage Containers 1.5L Set of 4", { volume_ml: ["1500"], pack: ["4"] }],
    ["Vegetable Peeler 3 Pcs Stainless Steel", { pack: ["3"] }],
    ["2-Pack Cable Organizer Clips Black/White", { pack: ["2"], color: ["black", "white"] }],
    ["USB C Cable 2m 3A Fast Charging Grey", { length_mm: ["2000"], current_a: ["3"], color: ["gray"] }],
    ["Silicone Spatula Set Heat Resistant", {}],
  ])("%p", (title, expected) => {
    expect(attrs(title)).toEqual(expected);
  });

  it("doesn't read model-like codes or spec words as quantities", () => {
    // "5050" is an LED chip type, "QC3.0" a protocol, "2025" a year.
    expect(attrs("2025 New RGB 5050 QC3.0 Strip")).toEqual({});
  });
});

describe("attributeConflict", () => {
  const conflict = (a: string, b: string) => attributeConflict(extractAttributes(a), extractAttributes(b));

  it.each<[string, string, string | null]>([
    ["LED Strip 5M RGB", "RGB LED Strip Lights 10M", "length_mm"],
    ["LED Strip 5M RGB", "LED Strip Lights 16.4ft RGB", null],
    ["LED Strip 500cm", "LED strip 5 m", null],
    ["Peeler 2 Pcs", "Peeler Set of 3", "pack"],
    ["Car Charger 36W", "Car Charger 20W", "power_w"],
    ["Organizer Clips Black", "Organizer Clips White", "color"],
    // A listing offering several colours overlaps with either.
    ["Organizer Clips Black/White/Pink", "Organizer Clips White", null],
    // One side silent is not a conflict.
    ["Phone Holder 15W", "Phone Holder for Car Dashboard", null],
  ])("%p vs %p → %p (either order)", (a, b, expected) => {
    expect(conflict(a, b)).toBe(expected);
    expect(conflict(b, a)).toBe(expected);
  });
});
