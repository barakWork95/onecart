import { createFxRates } from "@/domain/pricing/fx-rates";
import type { CurrencyCode } from "@/domain/shared/money";
import type { ProviderId } from "@/domain/shared/provider";

/**
 * Hand-written sample listings for local development and E2E tests, served
 * only when ONECART_DEMO_PROVIDERS=true. Prices are illustrative, not live —
 * the UI shows a "Demo data" badge whenever these are in use.
 */
export interface DemoListing {
  readonly provider: ProviderId;
  readonly sku: string;
  readonly title: string;
  /** Extra search terms beyond the title. */
  readonly keywords: readonly string[];
  readonly price: { readonly amount: number; readonly currency: CurrencyCode };
  /** null = store doesn't quote shipping. */
  readonly shipping: { readonly amount: number; readonly currency: CurrencyCode } | null;
  /** Import taxes the store collects at checkout (e.g. Amazon's import fees deposit). */
  readonly taxesAtCheckout?: { readonly amount: number; readonly currency: CurrencyCode };
  readonly originalPrice?: { readonly amount: number; readonly currency: CurrencyCode };
  readonly deliveryDays: readonly [number, number];
  readonly methodLabel: string;
  readonly rating: { readonly average: number; readonly count: number } | null;
  readonly seller: string;
}

/** Fixed rates so demo totals are reproducible in tests. */
export const DEMO_FX = createFxRates(
  { ILS: 1, USD: 3.7, EUR: 4, GBP: 4.7, CNY: 0.51 },
  "2026-10-09T00:00:00.000Z",
);

const EARBUDS = ["wireless", "earbuds", "earphones", "bluetooth", "headphones"];

export const DEMO_CATALOG: readonly DemoListing[] = [
  // Soundcore Life P3 — sold by all four stores
  {
    provider: "aliexpress",
    sku: "1005006271234567",
    title: "SoundCore Life P3 ANC Wireless Earbuds",
    keywords: [...EARBUDS, "anker", "anc"],
    price: { amount: 89, currency: "ILS" },
    shipping: { amount: 0, currency: "ILS" },
    originalPrice: { amount: 143.55, currency: "ILS" },
    deliveryDays: [10, 12],
    methodLabel: "AliExpress Standard Shipping",
    rating: { average: 4.8, count: 1420 },
    seller: "Soundcore Official Store",
  },
  {
    provider: "temu",
    sku: "601099512345",
    title: "Soundcore Life P3 Noise Cancelling Earbuds",
    keywords: [...EARBUDS, "anker"],
    price: { amount: 26.49, currency: "USD" },
    shipping: { amount: 0, currency: "USD" },
    deliveryDays: [8, 10],
    methodLabel: "Temu Standard",
    rating: { average: 4.6, count: 312 },
    seller: "Temu Global",
  },
  {
    provider: "amazon",
    sku: "B08KW1KR5H",
    title: "Anker Soundcore Life P3 Noise Cancelling Earbuds",
    keywords: [...EARBUDS],
    price: { amount: 29.99, currency: "USD" },
    shipping: { amount: 8.4, currency: "USD" },
    deliveryDays: [4, 4],
    methodLabel: "Priority door-to-door",
    rating: { average: 4.5, count: 3150 },
    seller: "Amazon.com",
  },
  {
    provider: "ebay",
    sku: "395012345678",
    title: "Soundcore Life P3 Earbuds Black",
    keywords: [...EARBUDS, "anker"],
    price: { amount: 34.5, currency: "USD" },
    shipping: { amount: 6.9, currency: "USD" },
    deliveryDays: [14, 18],
    methodLabel: "Global Shipping Program",
    rating: null,
    seller: "techdeals_us",
  },

  // Baseus Bowie M2+ — Temu and AliExpress
  {
    provider: "temu",
    sku: "601099598765",
    title: "Baseus Bowie M2+ ANC Earbuds",
    keywords: [...EARBUDS, "anc"],
    price: { amount: 19.5, currency: "USD" },
    shipping: { amount: 0, currency: "USD" },
    deliveryDays: [7, 12],
    methodLabel: "Temu Standard",
    rating: { average: 4.6, count: 980 },
    seller: "Temu Global",
  },
  {
    provider: "aliexpress",
    sku: "1005005987654321",
    title: "Baseus Bowie M2+ Wireless Earbuds ANC",
    keywords: [...EARBUDS],
    price: { amount: 84, currency: "ILS" },
    shipping: { amount: 0, currency: "ILS" },
    deliveryDays: [10, 15],
    methodLabel: "AliExpress Standard Shipping",
    rating: { average: 4.7, count: 640 },
    seller: "Baseus Official Store",
  },

  // Anker Soundcore Space A40 — three stores
  {
    provider: "amazon",
    sku: "B0B5VFDSB9",
    title: "Anker Soundcore Space A40 Adaptive ANC Earbuds",
    keywords: [...EARBUDS],
    price: { amount: 49.99, currency: "USD" },
    shipping: { amount: 9.99, currency: "USD" },
    deliveryDays: [3, 5],
    methodLabel: "Priority door-to-door",
    rating: { average: 4.9, count: 2410 },
    seller: "Amazon.com",
  },
  {
    provider: "aliexpress",
    sku: "1005005111122223",
    title: "Soundcore Space A40 ANC Wireless Earbuds",
    keywords: [...EARBUDS, "anker"],
    price: { amount: 189, currency: "ILS" },
    shipping: { amount: 0, currency: "ILS" },
    deliveryDays: [9, 14],
    methodLabel: "AliExpress Standard Shipping",
    rating: { average: 4.7, count: 205 },
    seller: "Soundcore Official Store",
  },
  {
    provider: "ebay",
    sku: "395087654321",
    title: "Anker Soundcore Space A40 Earbuds",
    keywords: [...EARBUDS],
    price: { amount: 54, currency: "USD" },
    shipping: { amount: 0, currency: "USD" },
    deliveryDays: [10, 14],
    methodLabel: "Standard International",
    rating: null,
    seller: "anker_outlet",
  },

  // Sony WH-CH720N — over the $75 VAT exemption
  {
    provider: "amazon",
    sku: "B0BS1QCFHX",
    title: "Sony WH-CH720N Noise Canceling Wireless Headphones",
    keywords: ["wireless", "headphones", "over-ear", "bluetooth", "noise", "cancelling"],
    price: { amount: 89.99, currency: "USD" },
    shipping: { amount: 12, currency: "USD" },
    taxesAtCheckout: { amount: 18.36, currency: "USD" },
    deliveryDays: [4, 6],
    methodLabel: "Priority door-to-door",
    rating: { average: 4.7, count: 3150 },
    seller: "Amazon.com",
  },
  {
    provider: "ebay",
    sku: "395011112222",
    title: "Sony WHCH720N Wireless Noise Cancelling Headphones Black",
    keywords: ["headphones", "over-ear", "bluetooth"],
    price: { amount: 79, currency: "USD" },
    shipping: { amount: 15, currency: "USD" },
    deliveryDays: [12, 16],
    methodLabel: "Standard International",
    rating: null,
    seller: "sony_refurb",
  },

  // Home & tech staples used by the homepage suggestions
  {
    provider: "ebay",
    sku: "395033334444",
    title: "Keychron K2 75% Wireless Mechanical Keyboard",
    keywords: ["mechanical", "keyboard", "bluetooth"],
    price: { amount: 45.4, currency: "USD" },
    shipping: { amount: 0, currency: "USD" },
    deliveryDays: [9, 13],
    methodLabel: "Standard International",
    rating: { average: 4.6, count: 1210 },
    seller: "keychron_store",
  },
  {
    provider: "aliexpress",
    sku: "1005004555566667",
    title: "Keychron K2 Wireless Mechanical Keyboard 75%",
    keywords: ["mechanical", "keyboard"],
    price: { amount: 159, currency: "ILS" },
    shipping: { amount: 0, currency: "ILS" },
    deliveryDays: [12, 18],
    methodLabel: "AliExpress Standard Shipping",
    rating: { average: 4.8, count: 530 },
    seller: "Keychron Official Store",
  },
  {
    provider: "amazon",
    sku: "B07RRKLMXN",
    title: "Cervical Memory Foam Pillow",
    keywords: ["pillow", "memory", "foam", "bed", "sleep"],
    price: { amount: 32.16, currency: "USD" },
    shipping: { amount: 0, currency: "USD" },
    deliveryDays: [5, 7],
    methodLabel: "Prime landed",
    rating: { average: 4.4, count: 8900 },
    seller: "Amazon.com",
  },
  {
    provider: "temu",
    sku: "601077788899",
    title: "Memory Foam Pillow Cervical",
    keywords: ["pillow", "memory", "foam", "sleep"],
    price: { amount: 22, currency: "USD" },
    shipping: { amount: 0, currency: "USD" },
    deliveryDays: [8, 12],
    methodLabel: "Temu Standard",
    rating: { average: 4.2, count: 410 },
    seller: "Temu Global",
  },
  {
    provider: "temu",
    sku: "601055566677",
    title: "Magnetic Car Phone Mount 360 Rotation",
    keywords: ["car", "phone", "mount", "holder", "magnetic"],
    price: { amount: 9.75, currency: "USD" },
    shipping: { amount: 3.25, currency: "USD" },
    deliveryDays: [7, 11],
    methodLabel: "Temu Standard",
    rating: { average: 4.3, count: 2200 },
    seller: "Temu Global",
  },
  {
    provider: "aliexpress",
    sku: "1005003222233334",
    title: "Magnetic Car Phone Mount 360 Rotation Dashboard",
    keywords: ["car", "phone", "mount", "holder", "magnetic"],
    price: { amount: 39.9, currency: "ILS" },
    shipping: { amount: 0, currency: "ILS" },
    deliveryDays: [10, 16],
    methodLabel: "AliExpress Standard Shipping",
    rating: { average: 4.5, count: 760 },
    seller: "Car Gadgets Store",
  },
  ...generatedCables(),
];

/**
 * 30 distinct cables per store at Amazon and eBay, so "usb cable" spans more
 * than one store page and exercises "Load more" in demo mode and E2E.
 */
function generatedCables(): DemoListing[] {
  const cables: DemoListing[] = [];
  for (let i = 0; i < 30; i++) {
    const feet = 1 + (i % 6);
    cables.push(
      {
        provider: "amazon",
        sku: `B0CABLE${String(i).padStart(3, "0")}`,
        title: `Braided USB-C Charging Cable AC${100 + i}, ${feet} ft`,
        keywords: ["usb", "cable", "charger", "charging"],
        price: { amount: 6 + i * 0.5, currency: "USD" },
        shipping: { amount: 4.99, currency: "USD" },
        deliveryDays: [6, 10],
        methodLabel: "AmazonGlobal Standard",
        rating: { average: 4.1 + (i % 9) / 10, count: 120 + i * 37 },
        seller: "Amazon.com",
      },
      {
        provider: "ebay",
        sku: `40${String(1000 + i)}`,
        title: `USB C Fast Charge Cable EC${200 + i} ${feet}ft Nylon`,
        keywords: ["usb", "cable", "charger", "charging"],
        price: { amount: 4 + i * 0.4, currency: "USD" },
        shipping: { amount: 0, currency: "USD" },
        deliveryDays: [9, 16],
        methodLabel: "eBay International Standard",
        rating: null,
        seller: "cables-direct",
      },
    );
  }
  return cables;
}
