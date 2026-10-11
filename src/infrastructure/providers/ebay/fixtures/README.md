# eBay (Browse API) fixtures

**Synthetic.** Built from eBay's published OpenAPI spec for the Browse API
(`buy_browse_v1_oas3.json`, `ItemSummary` / `ShippingOptionSummary` / `ConvertedAmount`),
because no eBay developer keys are configured yet.

Replace with trimmed recorded responses (requested with
`X-EBAY-C-ENDUSERCTX: contextualLocation=country%3DIL`) once keys exist. Strip
`itemAffiliateWebUrl` and seller user ids; keep the edge cases.
