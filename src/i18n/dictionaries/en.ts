/**
 * Interface text in English: the source of truth for the dictionary's shape. Every
 * other language must provide the same keys (`Dictionary`), so a missing translation
 * is a type error. Store titles are never translated: they're the stores' own words.
 * Counts are functions, so each language picks its own plural forms.
 */
const plural = (n: number, one: string, other: string) => `${n} ${n === 1 ? one : other}`;

export const en = {
  meta: {
    title: "OneCart — Find the best price",
    description:
      "Compare Amazon, eBay and AliExpress by the real landed price to Israel: shipping, import VAT and customs included.",
    searchTitle: "Compare prices",
    savedTitle: "Saved",
    alertsTitle: "Price alerts",
  },
  language: {
    /** The switcher names the other language in that language. */
    switchTo: "עברית",
    switchLabel: "View this page in Hebrew",
    /** Shown on English pages to visitors whose browser prefers Hebrew, so it's in Hebrew. */
    suggestion: "OneCart זמין גם בעברית",
    suggestionCta: "מעבר לעברית",
    suggestionDismiss: "סגירה",
  },
  nav: {
    main: "Main",
    discover: "Discover",
    compare: "Compare",
    saved: "Saved",
    alerts: "Alerts",
    home: "OneCart home",
    tagline: "Compare",
    currencyTitle: "All prices are shown in Israeli shekels, delivered to Israel",
    theme: "Toggle dark mode",
  },
  footer: {
    categories: "Categories",
    legal: "Legal",
    privacy: "Privacy Policy",
    terms: "Terms of Use",
    affiliate:
      "OneCart is a participant in affiliate programs including the eBay Partner Network, Amazon Associates and the AliExpress Affiliate Program. We may earn a commission on qualifying purchases at no additional cost to you.",
  },
  home: {
    title: "Find the best price.",
    subtitle: "Compare Amazon, eBay and AliExpress by the price you'll actually pay in Israel.",
    trendingSearches: "Trending searches",
    valueProps: {
      stores: {
        title: "Every store, one search",
        body: "Amazon, eBay and AliExpress side by side, sellers grouped per product.",
      },
      landed: {
        title: "The real price to Israel",
        body: "Shipping, import VAT and duty added before we compare.",
      },
      trust: { title: "Buy where you trust", body: "We send you to the store's own checkout." },
    },
    trending: {
      heading: "Trending comparisons",
      subtitle: "Landed prices to Israel, checked daily. Tap for every store.",
      list: "Trending products",
    },
    drops: {
      heading: "Price drops",
      subtitle: "The lowest landed price in 30 days, against prices we check ourselves every day.",
      list: "Price drops",
      onStore: (store: string) => `on ${store}`,
      typically: (price: string, days: number) => `Typically ${price} over the last ${days} days we checked.`,
      view: (store: string) => `View on ${store}`,
      priceAsOf: "Price as of",
    },
    savings: {
      heading: "Cheaper on another store",
      subtitle: "The same item, landed in Israel, for clearly less at one store than the next.",
      list: "Cross-store savings",
      save: (amount: string, store: string) => `Save ${amount} vs ${store}`,
      lookAlike: (amount: string, store: string) => `Looks identical, ${amount} less on ${store}`,
    },
    rows: {
      seeAll: "See all",
      products: (category: string) => `${category} products`,
    },
  },
  card: {
    from: "From",
    onStore: (store: string) => `on ${store}`,
    stores: (n: number) => plural(n, "store", "stores"),
    listings: (n: number) => plural(n, "listing", "listings"),
    storesList: "Stores",
    noOffer: (store: string) => `${store}: no offer to Israel`,
    pricesAsOf: "Prices as of",
    perPiece: (price: string) => `${price} per piece`,
  },
  search: {
    heading: "Compare prices across stores",
    trySearching: "Try searching for",
    box: {
      placeholderShort: "Search products…",
      placeholderFull: "Search products, brands or models…",
      label: "Search products",
      clear: "Clear search",
    },
    results: {
      label: "Search results",
      loading: "Loading results",
      offers: (n: number) => plural(n, "offer", "offers"),
      stores: (n: number) => plural(n, "store", "stores"),
      bestMatch: "Best match",
      demo: "Demo data",
      vatIncluded: "Import VAT included",
      translationFailed:
        "We couldn't translate your Hebrew search, so stores were searched with the original text. Try English for better results.",
      showingFor: "Showing results for",
      translatedFromHebrew: ", translated from Hebrew",
      someWordsUntranslated: " (some words couldn't be translated)",
      status: { timeout: "timed out", error: "unavailable", circuit_open: "temporarily paused" },
      partial: (stores: string) =>
        `Some stores are unavailable right now: ${stores}. Showing results from the rest`,
      partialChecks: (checks: string) => `; ${checks} on a card searches that store for the item.`,
      checkQuoted: (store: string) => `“Check ${store}”`,
      pricesAsOf: (store: string) => `${store} prices as of`,
      pricesMayHaveChanged: ". Prices may have changed since; the store shows the current one.",
      samples: (stores: string) => `${stores} results here are recorded samples, not live prices.`,
      noStoresTitle: "No stores are connected yet",
      noStoresBody: "Store API keys aren't configured on this server, so there's nothing to search.",
      downTitle: "Stores aren't responding",
      downBodyWithLinks:
        "We couldn't reach any store just now. You can search them directly, or try again in a minute.",
      downBody: "We couldn't reach any store just now. Please try again in a minute.",
      searchDirectly: "Search the stores directly",
      searchStore: (store: string) => `Search ${store}`,
      noMatchesTitle: "No matches",
      noMatchesBody: (query: string) =>
        `No store had results for “${query}”. Try fewer or more general words.`,
      products: "Products",
      showing: (n: number) => `Showing ${plural(n, "product", "products")}`,
      everything: " — that's everything the stores returned",
    },
    sort: {
      label: "Sort results",
      landed_price_asc: "Lowest Price",
      delivery_fastest: "Fastest Delivery",
      rating_desc: "Top Rated",
      clear: (sort: string) => `Clear "${sort}" — back to best match`,
      by: (sort: string) => `Sort by ${sort.toLowerCase()}`,
    },
    loadMore: { idle: "Load more", loading: "Loading more…" },
  },
  group: {
    lookAlikeBadge: "Looks identical · Best value",
    sameItem: "Same item",
    similarItem: "Similar item",
    looksIdentical: "Looks identical",
    stores: (n: number) => plural(n, "store", "stores"),
    listings: (n: number) => plural(n, "listing", "listings"),
    shippingNotQuoted: "Shipping not quoted",
    freeDelivery: (days: number | null) => `Free${days !== null ? ` ${days}-day` : ""} delivery`,
    totalLanded: "total landed",
    plusShipping: "+ shipping",
    averageRating: "average rating",
    viewDeal: (price: string) => `View deal ${price}`,
    check: (store: string) => `Check ${store}`,
    checkLabel: (store: string, title: string) => `Check ${store} for ${title}`,
    findOn: (store: string) => `Find on ${store}`,
    findOnOthers: "Find on other stores",
    findLabel: (label: string, title: string) => `${label}: search for ${title}`,
    perPiece: (price: string) => `${price} per piece`,
    comparison: {
      availableOn: (n: number) => `Available on ${n} stores`,
      comparedOn: (n: number) => `Compared on ${n} stores`,
      bestDeal: (store: string) => `Best deal on ${store}`,
      onlyShips: (store: string) => `Only ${store} ships it to Israel`,
      listingsOn: (n: number, store: string) => `${n} listings on ${store}`,
      fromTo: (from: string, to: string) => `from ${from} to ${to}`,
      storePrice: (store: string, price: string) => `${store} ${price}`,
      storeFrom: (store: string, price: string, n: number) => `${store} from ${price} (${n} listings)`,
      noOffer: (store: string) => `${store}: no offer to Israel`,
      more: (n: number) => ` +${n} more`,
      versus: " vs ",
    },
    caveat: {
      photo: (sellers: string) =>
        ` Matched by product photo and specs, sold by different sellers${sellers ? ` (${sellers})` : ""}. Check the listing details before you buy.`,
      moreSellers: (names: string, more: number) => `${names} and ${more} more`,
      title: " Matched by similar titles — check the listing before buying.",
    },
  },
  compare: {
    triggerListings: (n: number) => `${n} listings`,
    triggerCompare: (n: number) => `Compare (${n})`,
    triggerListingsLabel: (n: number, store: string, title: string) =>
      `See ${n} ${store} listings for ${title}`,
    triggerCompareLabel: (n: number, title: string) => `Compare ${n} stores for ${title}`,
    heading: "Landed breakdown",
    deliveryToIsrael: "Delivery to Israel",
    titleListings: (n: number, store: string, title: string) => `${n} ${store} listings: ${title}`,
    titleCompare: (n: number, title: string) => `Compare ${n} stores: ${title}`,
    description: "Shipping, estimated import VAT and duty included where stores quote them.",
    close: "Close comparison",
    offer: (store: string) => `${store} offer`,
    bestPrice: "Best price",
    fastest: "Fastest",
    deliveryUnknown: "Delivery time not quoted",
    freeShipping: "Free shipping",
    shipping: (price: string) => `${price} shipping`,
    shippingNotQuoted: "Shipping not quoted",
    totalLanded: "Total landed",
    plusShipping: "+ shipping",
    vsBest: (price: string) => `+${price} vs best`,
    goTo: (store: string, price: string) => `Go to ${store} — ${price}`,
    goToListing: (store: string, price: string, title: string) => `Go to ${store} — ${price}: ${title}`,
    go: "Go",
    breakdown: {
      item: (price: string) => `Item ${price}`,
      shipping: (price: string) => `shipping ${price}`,
      importFees: (price: string) => `import fees ${price}`,
      vatAndDuty: (price: string) => `est. VAT & duty ${price}`,
      noImportTax: "no import tax",
      clearance: (price: string) => `clearance ${price}`,
    },
    unavailableLabel: (store: string) => `${store}: no offer to Israel`,
    unavailableBody: "Listed, but no offer ships it to Israel",
    view: "View",
    viewLabel: (store: string) => `View on ${store} (no offer to Israel)`,
    trayAll: (n: number, store: string) => `All ${n} ${store} listings`,
    trayList: (store: string) => `${store} listings`,
    soldBy: (seller: string) => `Sold by ${seller}`,
  },
  lists: {
    save: (title: string) => `Save ${title}`,
    unsave: (title: string) => `Remove ${title} from Saved`,
    track: (title: string) => `Track price of ${title}`,
    changeAlert: (title: string) => `Change price alert for ${title}`,
    alertSetBelow: (price: string) => `Alert set below ${price}`,
    alertHeading: "Price alert",
    alertDescription: (price: string) =>
      `Today's best landed price is ${price}. We check prices daily and show a drop on your Alerts tab.`,
    closeAlert: "Close price alert",
    alertWhen: "Alert me when the price drops to",
    saving: "Saving…",
    updateAlert: "Update alert",
    createAlert: "Create alert",
  },
};

/** A language's text: the same keys, any wording (functions keep their arguments). */
type Widen<T> = {
  readonly [K in keyof T]: T[K] extends string
    ? string
    : T[K] extends (...args: infer A) => string
      ? (...args: A) => string
      : Widen<T[K]>;
};
export type Dictionary = Widen<typeof en>;
