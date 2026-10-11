# Amazon (SerpApi) fixtures

**Synthetic.** Built from SerpApi's documented `engine=amazon` response (field names from
serpapi.com/amazon-search-api), because no SerpApi key is configured yet. The delivery lines
follow Amazon's wording; the international variants ("shipping & import fees deposit to Israel")
need confirming against a real response with `shipping_location=IL`.

Replace each file with a trimmed recorded response once a key exists. Strip the `api_key` from
`search_metadata` and any `serpapi_link`, and keep the edge cases.
