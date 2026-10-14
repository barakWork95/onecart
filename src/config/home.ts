import type { TrendingQuery } from "@/domain/deals/trending-query";

/** A homepage category row: one comparison card per product, from cached results only. */
export interface HomeCategory {
  /** Stable id for anchors and keys, e.g. "headphones". */
  readonly slug: string;
  readonly label: string;
  /** "See all" runs this search (a live, user-initiated search). */
  readonly searchQuery: string;
  /**
   * Specific products (brand + model), so each card is the product itself, not
   * a category's mix. Never a trending query: those have their own grid.
   */
  readonly products: readonly TrendingQuery[];
}

/**
 * The homepage category rows. The daily warm-trending cron refreshes every
 * product here on TRENDING_WARM_STORES (eBay and AliExpress by default); a
 * product with nothing cached simply has no card, and an empty row is hidden.
 */
export const HOME_CATEGORIES: readonly HomeCategory[] = [
  {
    slug: "headphones",
    label: "Headphones",
    searchQuery: "wireless headphones",
    products: [
      { label: "Sony WH-CH720N", query: "sony wh-ch720n" },
      { label: "Soundcore Liberty 4 NC", query: "soundcore liberty 4 nc" },
      { label: "Bose QuietComfort Ultra", query: "bose quietcomfort ultra" },
      { label: "JBL Tune 520BT", query: "jbl tune 520bt" },
      { label: "Sennheiser Momentum 4", query: "sennheiser momentum 4" },
    ],
  },
  {
    slug: "speakers",
    label: "Speakers",
    searchQuery: "bluetooth speaker",
    products: [
      { label: "JBL Charge 5", query: "jbl charge 5" },
      { label: "Soundcore Motion 300", query: "soundcore motion 300" },
      { label: "Sony SRS-XB100", query: "sony srs-xb100" },
      { label: "Bose SoundLink Flex", query: "bose soundlink flex" },
      { label: "JBL Go 4", query: "jbl go 4" },
    ],
  },
  {
    slug: "smart-home",
    label: "Smart home",
    searchQuery: "smart home",
    products: [
      { label: "Tapo C200 camera", query: "tp-link tapo c200" },
      { label: "Xiaomi Smart Camera C400", query: "xiaomi smart camera c400" },
      { label: "Echo Dot (5th gen)", query: "echo dot 5th gen" },
      { label: "Philips Hue starter kit", query: "philips hue starter kit" },
      { label: "Aqara Hub M2", query: "aqara hub m2" },
    ],
  },
  {
    slug: "kitchen",
    label: "Kitchen",
    searchQuery: "kitchen appliances",
    products: [
      { label: "Ninja Air Fryer AF101", query: "ninja air fryer af101" },
      { label: "Cosori Air Fryer", query: "cosori air fryer" },
      { label: "Nespresso Vertuo Next", query: "nespresso vertuo next" },
      { label: "Xiaomi Electric Kettle 2", query: "xiaomi electric kettle 2" },
      { label: "Ninja Professional Blender", query: "ninja professional blender" },
    ],
  },
  {
    slug: "phone-accessories",
    label: "Phone accessories",
    searchQuery: "phone accessories",
    products: [
      { label: "Anker 737 Power Bank", query: "anker 737 power bank" },
      { label: "Apple AirTag", query: "apple airtag" },
      { label: "Anker Nano Power Bank", query: "anker nano power bank" },
      { label: "Galaxy SmartTag2", query: "samsung galaxy smarttag2" },
      { label: "Xiaomi Power Bank 20000", query: "xiaomi power bank 20000" },
    ],
  },
  {
    slug: "gaming",
    label: "Gaming",
    searchQuery: "gaming",
    products: [
      { label: "Nintendo Switch OLED", query: "nintendo switch oled" },
      { label: "Xbox Wireless Controller", query: "xbox wireless controller" },
      { label: "DualSense controller", query: "sony dualsense controller" },
      { label: "Logitech G502 Hero", query: "logitech g502 hero" },
      { label: "Razer Basilisk V3", query: "razer basilisk v3" },
    ],
  },
];

/** The demo catalog's equivalent (local demo runs and E2E): its one non-trending product. */
export const DEMO_HOME_CATEGORIES: readonly HomeCategory[] = [
  {
    slug: "headphones",
    label: "Headphones",
    searchQuery: "wireless earbuds",
    products: [{ label: "Soundcore Space A40", query: "soundcore space a40" }],
  },
];
