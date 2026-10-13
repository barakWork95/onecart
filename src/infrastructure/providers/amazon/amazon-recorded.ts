import { normalizeQueryText } from "@/domain/search/search-query";
import airpodsPro from "@/infrastructure/providers/amazon/fixtures/recorded-airpods-pro.json";
import airpodsProP2 from "@/infrastructure/providers/amazon/fixtures/recorded-airpods-pro-p2.json";
import instantPotDuo from "@/infrastructure/providers/amazon/fixtures/recorded-instant-pot-duo.json";
import instantPotDuoP2 from "@/infrastructure/providers/amazon/fixtures/recorded-instant-pot-duo-p2.json";
import jblFlip6 from "@/infrastructure/providers/amazon/fixtures/recorded-jbl-flip-6.json";
import jblFlip6P2 from "@/infrastructure/providers/amazon/fixtures/recorded-jbl-flip-6-p2.json";
import kindlePaperwhite from "@/infrastructure/providers/amazon/fixtures/recorded-kindle-paperwhite.json";
import kitchen from "@/infrastructure/providers/amazon/fixtures/recorded-kitchen.json";
import sonyXm5 from "@/infrastructure/providers/amazon/fixtures/recorded-sony-wh-1000xm5.json";
import sonyXm5P2 from "@/infrastructure/providers/amazon/fixtures/recorded-sony-wh-1000xm5-p2.json";
import wirelessHeadphones from "@/infrastructure/providers/amazon/fixtures/recorded-wireless-headphones.json";
import wirelessHeadphonesP2 from "@/infrastructure/providers/amazon/fixtures/recorded-wireless-headphones-p2.json";

/**
 * Real SerpApi `engine=amazon` responses (shipping to Israel, recorded
 * 2026-10-12), by normalized query, page 1 first. Development and preview
 * deployments search these instead of SerpApi, so working on OneCart never
 * spends the 250-a-month search quota. Add a query by saving its trimmed
 * responses under `fixtures/` (strip `api_key`) and listing them here.
 */
export const RECORDED_AMAZON_SEARCHES: Readonly<Record<string, readonly unknown[]>> = {
  "sony wh-1000xm5": [sonyXm5, sonyXm5P2],
  "instant pot duo": [instantPotDuo, instantPotDuoP2],
  "jbl flip 6": [jblFlip6, jblFlip6P2],
  "airpods pro": [airpodsPro, airpodsProP2],
  "wireless headphones": [wirelessHeadphones, wirelessHeadphonesP2],
  "kindle paperwhite": [kindlePaperwhite],
  kitchen: [kitchen],
};

/** What SerpApi answers for a query with no results; the adapter reads it as "0 results". */
const NO_RESULTS = { error: "Amazon hasn't returned any results for this query." };

/**
 * A `fetch` for the Amazon adapter that answers from recorded responses and
 * never touches the network. Unknown queries and pages past the recording get
 * SerpApi's own "no results" answer, so they read as an empty store, not an outage.
 */
export function createRecordedSerpApiFetch(
  searches: Readonly<Record<string, readonly unknown[]>> = RECORDED_AMAZON_SEARCHES,
): typeof fetch {
  return async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const pages = searches[normalizeQueryText(url.searchParams.get("k") ?? "")] ?? [];
    const page = Number(url.searchParams.get("page") ?? "1");
    const body = pages[page - 1] ?? NO_RESULTS;
    return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
  };
}

/** The recorded queries, for the UI to suggest while Amazon runs on samples. */
export const RECORDED_AMAZON_QUERIES: readonly string[] = Object.keys(RECORDED_AMAZON_SEARCHES);
