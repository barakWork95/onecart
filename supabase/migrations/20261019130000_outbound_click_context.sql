-- What the shopper saw on the link they clicked (signed into the /go link) and the page's
-- language, for the internal analytics dashboard. Still nothing that identifies a person.
-- Clicks recorded before this have no title or price, aren't a best deal, and read as English.
alter table public.outbound_clicks
  add column product_title text check (product_title is null or char_length(product_title) between 1 and 200),
  add column price_ils     numeric(10, 2) check (price_ils is null or price_ils > 0),
  add column is_best_deal  boolean not null default false,
  add column locale        text not null default 'en' check (locale in ('en', 'he'));

-- Store breakdowns filter and group by store (the time index already exists).
create index outbound_clicks_provider_idx on public.outbound_clicks (provider);

-- The last 30 days' most-clicked products, each with the latest title it was clicked with.
-- security_invoker keeps the table's RLS (no policies: service role only) in force.
create view public.outbound_click_top_products
with (security_invoker = true) as
select
  product_id,
  provider,
  (array_agg(product_title order by clicked_at desc) filter (where product_title is not null))[1] as title,
  count(*)::int as clicks
from public.outbound_clicks
where clicked_at >= now() - interval '30 days'
group by product_id, provider
order by clicks desc, max(clicked_at) desc;

revoke all on public.outbound_click_top_products from anon, authenticated;
grant select on public.outbound_click_top_products to service_role;
