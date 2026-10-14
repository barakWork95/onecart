# AliExpress fixtures

`search-recorded.json` is **real**: 7 items from live `product.query` calls on 2026-10-14
("jbl flip 6", "soundcore liberty 4 nc"; ship_to_country=IL, ILS), `promotion_link` removed.
It pins the live field types (numeric `product_id`, `tax_rate`, `aliexpress-media.com` photos).

The other files are **synthetic**. Built from the documented `aliexpress.affiliate.product.query` response
shape (field names per the Affiliate API / official SDK), because no app key exists yet.

Replace each file with a trimmed recorded response once credentials are available. Strip
`promotion_link`, tracking ids, and any personal data. Keep the edge cases (bad price,
unsupported currency) by editing the recorded file.
