import type { Category } from "@/domain/deals/category";

export type { Category };

/**
 * The categories. The daily warm-trending cron refreshes every product here on
 * TRENDING_WARM_STORES (eBay and AliExpress by default): 90 searches a day
 * per store, and hashes the generic categories' photos. A product with nothing cached has no card; a page with too few
 * priced products is kept out of search engines until it fills.
 */
export const CATEGORIES: readonly Category[] = [
  {
    slug: "headphones",
    mode: "branded",
    label: "Headphones",
    seoTitle: "Headphones and earbuds: prices in Israel compared",
    description:
      "Sony, Bose, JBL, Soundcore and more: wireless headphones compared across stores by the full price delivered to Israel.",
    intro:
      "Noise-cancelling headphones and wireless earbuds from Sony, Bose, Sennheiser, JBL, Apple, Samsung and Soundcore, each compared across stores by what it actually costs to get to Israel: the item, shipping, and any import VAT or customs.",
    searchQuery: "wireless headphones",
    products: [
      { label: "Sony WH-CH720N", query: "sony wh-ch720n" },
      { label: "Soundcore Liberty 4 NC", query: "soundcore liberty 4 nc" },
      { label: "Bose QuietComfort Ultra", query: "bose quietcomfort ultra" },
      { label: "JBL Tune 520BT", query: "jbl tune 520bt" },
      { label: "Sennheiser Momentum 4", query: "sennheiser momentum 4" },
      { label: "Sony WH-1000XM4", query: "sony wh-1000xm4" },
      { label: "AirPods 4", query: "apple airpods 4" },
      { label: "JBL Tune 770NC", query: "jbl tune 770nc" },
      { label: "Soundcore Space Q45", query: "soundcore space q45" },
      { label: "Galaxy Buds3 Pro", query: "samsung galaxy buds 3 pro" },
    ],
  },
  {
    slug: "speakers",
    mode: "branded",
    label: "Speakers",
    seoTitle: "Bluetooth speakers: prices in Israel compared",
    description:
      "JBL, Bose, Sony and Soundcore portable speakers compared across stores by the full price delivered to Israel.",
    intro:
      "Portable Bluetooth speakers from JBL, Bose, Sony and Soundcore, from pocket-size to party-size, each compared across stores by the full landed price to Israel, shipping and import charges included.",
    searchQuery: "bluetooth speaker",
    products: [
      { label: "JBL Charge 5", query: "jbl charge 5" },
      { label: "Soundcore Motion 300", query: "soundcore motion 300" },
      { label: "Sony SRS-XB100", query: "sony srs-xb100" },
      { label: "Bose SoundLink Flex", query: "bose soundlink flex" },
      { label: "JBL Go 4", query: "jbl go 4" },
      { label: "JBL Flip 7", query: "jbl flip 7" },
      { label: "JBL Clip 5", query: "jbl clip 5" },
      { label: "Bose SoundLink Micro", query: "bose soundlink micro" },
      { label: "Sony SRS-XE300", query: "sony srs-xe300" },
      { label: "Soundcore Boom 2", query: "anker soundcore boom 2" },
    ],
  },
  {
    slug: "smart-home",
    mode: "branded",
    label: "Smart home",
    seoTitle: "Smart home devices: prices in Israel compared",
    description:
      "Security cameras, smart speakers, lighting and robot vacuums compared across stores by the full price delivered to Israel.",
    intro:
      "Wi-Fi cameras, smart speakers and displays, smart lighting and robot vacuums from TP-Link, Xiaomi, Amazon, Google, Philips, Aqara and Roborock, compared across stores by the full landed price to Israel.",
    searchQuery: "smart home",
    products: [
      { label: "Tapo C200 camera", query: "tp-link tapo c200" },
      { label: "Xiaomi Smart Camera C400", query: "xiaomi smart camera c400" },
      { label: "Echo Dot (5th gen)", query: "echo dot 5th gen" },
      { label: "Philips Hue starter kit", query: "philips hue starter kit" },
      { label: "Aqara Hub M2", query: "aqara hub m2" },
      { label: "Tapo C210 camera", query: "tp-link tapo c210" },
      { label: "Echo Show 5", query: "amazon echo show 5" },
      { label: "Google Nest Mini", query: "google nest mini" },
      { label: "Philips Hue Go", query: "philips hue go" },
      { label: "Roborock Q7 Max", query: "roborock q7 max" },
    ],
  },
  {
    slug: "kitchen",
    mode: "branded",
    label: "Kitchen",
    seoTitle: "Kitchen appliances: prices in Israel compared",
    description:
      "Air fryers, coffee machines, blenders and kettles from Ninja, Cosori, Nespresso, Philips and more, compared by the full price delivered to Israel.",
    intro:
      "Air fryers, espresso and capsule machines, blenders, kettles and grills from Ninja, Cosori, Nespresso, Philips, Breville, Tefal and Xiaomi, compared across stores by the full landed price to Israel. Check each listing's plug and voltage before you buy.",
    searchQuery: "kitchen appliances",
    products: [
      { label: "Ninja Air Fryer AF101", query: "ninja air fryer af101" },
      { label: "Cosori Air Fryer", query: "cosori air fryer" },
      { label: "Nespresso Vertuo Next", query: "nespresso vertuo next" },
      { label: "Xiaomi Electric Kettle 2", query: "xiaomi electric kettle 2" },
      { label: "Ninja Professional Blender", query: "ninja professional blender" },
      { label: "Philips Airfryer XXL", query: "philips airfryer xxl" },
      { label: "Nespresso Essenza Mini", query: "nespresso essenza mini" },
      { label: "Breville Barista Express", query: "breville barista express" },
      { label: "Tefal OptiGrill", query: "tefal optigrill" },
      { label: "Ninja Foodi Dual Zone", query: "ninja foodi dual zone" },
    ],
  },
  {
    slug: "phone-accessories",
    mode: "branded",
    label: "Phone accessories",
    seoTitle: "Power banks and phone gadgets: prices in Israel compared",
    description:
      "Power banks, trackers and MagSafe batteries from Anker, Apple, Samsung, Ugreen and Baseus, compared by the full price delivered to Israel.",
    intro:
      "Power banks, MagSafe batteries and item trackers from Anker, Apple, Samsung, Xiaomi, Ugreen, Baseus and Belkin, compared across stores by the full landed price to Israel.",
    searchQuery: "phone accessories",
    products: [
      { label: "Anker 737 Power Bank", query: "anker 737 power bank" },
      { label: "Apple AirTag", query: "apple airtag" },
      { label: "Anker Nano Power Bank", query: "anker nano power bank" },
      { label: "Galaxy SmartTag2", query: "samsung galaxy smarttag2" },
      { label: "Xiaomi Power Bank 20000", query: "xiaomi power bank 20000" },
      { label: "Anker 622 Magnetic Battery", query: "anker 622 magnetic battery" },
      { label: "Ugreen Nexode Power Bank", query: "ugreen nexode power bank" },
      { label: "Baseus Blade Power Bank", query: "baseus blade power bank" },
      { label: "Belkin BoostCharge Pro", query: "belkin boostcharge pro" },
      { label: "Anker MagGo Power Bank", query: "anker maggo power bank" },
    ],
  },
  {
    slug: "gaming",
    mode: "branded",
    label: "Gaming",
    seoTitle: "Gaming consoles and gear: prices in Israel compared",
    description:
      "Consoles, controllers, gaming mice and headsets from Nintendo, Xbox, Sony, Logitech, Razer and more, compared by the full price delivered to Israel.",
    intro:
      "Consoles, controllers, gaming mice and headsets from Nintendo, Microsoft, Sony, Logitech, Razer, SteelSeries and HyperX, compared across stores by the full landed price to Israel.",
    searchQuery: "gaming",
    products: [
      { label: "Nintendo Switch OLED", query: "nintendo switch oled" },
      { label: "Xbox Wireless Controller", query: "xbox wireless controller" },
      { label: "DualSense controller", query: "sony dualsense controller" },
      { label: "Logitech G502 Hero", query: "logitech g502 hero" },
      { label: "Razer Basilisk V3", query: "razer basilisk v3" },
      { label: "Switch Pro Controller", query: "nintendo switch pro controller" },
      { label: "Logitech G Pro X Superlight", query: "logitech g pro x superlight" },
      { label: "SteelSeries Arctis Nova 7", query: "steelseries arctis nova 7" },
      { label: "Razer BlackShark V2", query: "razer blackshark v2" },
      { label: "HyperX Cloud III", query: "hyperx cloud iii" },
    ],
  },

  {
    slug: "kitchen-gadgets",
    mode: "generic",
    label: "Kitchen gadgets",
    seoTitle: "Kitchen gadgets: prices in Israel compared",
    description:
      "Peelers, choppers, scales and spatula sets: everyday kitchen gadgets compared across stores by the full price delivered to Israel.",
    intro:
      "Unbranded kitchen gadgets are sold by dozens of sellers under different titles. We match listings that look identical by their product photo and specs, then show the cheapest landed price to Israel, shipping and import charges included.",
    searchQuery: "kitchen gadgets",
    products: [
      { label: "Vegetable peeler", query: "vegetable peeler" },
      { label: "Garlic press", query: "garlic press" },
      { label: "Silicone spatula set", query: "silicone spatula set" },
      { label: "Digital kitchen scale", query: "digital kitchen scale" },
      { label: "Vegetable chopper", query: "vegetable chopper" },
      { label: "Measuring spoons", query: "measuring spoons set" },
      { label: "Jar opener", query: "jar opener" },
      { label: "Herb scissors", query: "herb scissors" },
      { label: "Silicone baking mat", query: "silicone baking mat" },
      { label: "Handheld milk frother", query: "milk frother handheld" },
    ],
  },
  {
    slug: "car-accessories",
    mode: "generic",
    label: "Car accessories",
    seoTitle: "Car accessories: prices in Israel compared",
    description:
      "Phone holders, chargers, FM transmitters and organizers for the car, compared across stores by the full price delivered to Israel.",
    intro:
      "Phone holders, chargers, FM transmitters, organizers and covers for the car. Many sellers list the same unbranded item; we match look-alikes by product photo and specs and show which one lands in Israel for the least.",
    searchQuery: "car accessories",
    products: [
      { label: "Magnetic car phone holder", query: "magnetic car phone holder" },
      { label: "Bluetooth FM transmitter", query: "car fm transmitter bluetooth" },
      { label: "Dual USB car charger", query: "dual usb car charger" },
      { label: "Car seat gap filler", query: "car seat gap filler" },
      { label: "Digital tire pressure gauge", query: "digital tire pressure gauge" },
      { label: "Car trash can", query: "car trash can" },
      { label: "Windshield sun shade", query: "windshield sun shade" },
      { label: "Interior LED lights", query: "car interior led lights" },
      { label: "Handheld car vacuum", query: "handheld car vacuum" },
      { label: "Steering wheel cover", query: "steering wheel cover" },
    ],
  },
  {
    slug: "desk-gadgets",
    mode: "generic",
    label: "Desk gadgets",
    seoTitle: "Desk gadgets: prices in Israel compared",
    description:
      "Cable clips, laptop stands, desk lamps and organizers for a tidy desk, compared across stores by the full price delivered to Israel.",
    intro:
      "Cable clips, laptop stands, monitor risers, lamps and organizers for the home office. We group listings that look identical by product photo and specs, so you see the best landed price to Israel among sellers of the same item.",
    searchQuery: "desk accessories",
    products: [
      { label: "Cable organizer clips", query: "cable organizer clips" },
      { label: "Adjustable laptop stand", query: "adjustable laptop stand" },
      { label: "Monitor riser", query: "monitor riser" },
      { label: "Cable management box", query: "cable management box" },
      { label: "Large mouse pad", query: "large mouse pad" },
      { label: "LED desk lamp", query: "led desk lamp" },
      { label: "Desk phone stand", query: "desk phone stand" },
      { label: "Desk organizer", query: "desk organizer" },
      { label: "USB desk fan", query: "usb desk fan" },
      { label: "Keyboard wrist rest", query: "keyboard wrist rest" },
    ],
  },
];

/**
 * The demo catalog's equivalent (local demo runs and E2E). It may reuse
 * trending products: the demo has few, and a category page needs three priced
 * ones to be indexable.
 */
export const DEMO_CATEGORIES: readonly Category[] = [
  {
    slug: "headphones",
    mode: "branded",
    label: "Headphones",
    seoTitle: "Headphones and earbuds: prices in Israel compared",
    description: "Demo headphones compared by the full price delivered to Israel.",
    intro: "Demo earbuds and headphones, compared across the demo stores by the full landed price to Israel.",
    searchQuery: "wireless earbuds",
    products: [
      { label: "Soundcore Space A40", query: "soundcore space a40" },
      { label: "Soundcore Life P3", query: "soundcore life p3" },
      { label: "Sony WH-CH720N", query: "sony wh-ch720n" },
      { label: "Baseus Bowie M2+", query: "baseus bowie m2" },
    ],
  },
  {
    slug: "pillows",
    mode: "generic",
    label: "Pillows",
    seoTitle: "Pillows: prices in Israel compared",
    description: "Demo pillows compared by the full price delivered to Israel.",
    intro: "A demo category with a single product: too thin to be indexed.",
    searchQuery: "pillow",
    products: [{ label: "Memory foam pillow", query: "memory foam pillow" }],
  },
];
