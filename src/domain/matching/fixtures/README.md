# Recorded marketplace titles

`recorded-results.json` holds real search results recorded on 2026-10-12: the priced Amazon
items (SerpApi `engine=amazon`, `shipping_location=IL`) and eBay items (Browse API, new,
fixed price, delivery to Israel) for seven queries. Titles are verbatim; `item` is the item
price in ₪ (Amazon quotes ILS for Israel; eBay converts from the seller's currency).

They pin the matcher's precision on real data: `recorded-results.test.ts` asserts which
cross-store groups form for each query. Re-record with fresh queries when matching changes,
and add every real mismatch you find as a pair in `product-matcher.test.ts`.
