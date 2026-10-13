# Amazon (SerpApi) fixtures

- `recorded-*.json`: real SerpApi `engine=amazon` responses with `shipping_location=IL`,
  recorded 2026-10-12 and trimmed to the fields we read (`api_key` and `serpapi_link`s
  stripped). `-p2` files are page 2. They back the adapter and integration tests and the
  **recorded mode** (`amazon-recorded.ts`) that development and preview deployments use
  instead of live SerpApi.
- `error-quota-exhausted.json`: what SerpApi answers when the month's searches are used up,
  recorded 2026-10-13 with HTTP 429.
- `error-invalid-key.json`, `search-ok.json`, `search-no-results.json`: synthetic, from
  SerpApi's documentation, for edge cases.

To add a recorded query: save its trimmed page responses here and list them in
`RECORDED_AMAZON_SEARCHES`. Each page costs one live search to record.
