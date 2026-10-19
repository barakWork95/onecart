-- Run by scripts/test-db.sh. Any failed assertion raises and aborts with a non-zero exit.
\set ON_ERROR_STOP on
\o /dev/null

create function pg_temp.expect_error(stmt text, label text) returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'FAIL: % — statement succeeded', label;
exception when others then
  if sqlerrm like 'FAIL:%' then raise; end if;
  raise notice 'ok: % (%)', label, sqlstate;
end $$;

set role service_role;
-- 1. A click made before the context columns existed reads with their defaults.
insert into public.outbound_clicks (product_id, provider, affiliated) values ('ebay:old', 'ebay', true);
do $$ begin
  if (select (product_title, price_ils, is_best_deal, locale)::text from public.outbound_clicks where product_id = 'ebay:old')
     <> '(,,f,en)' then raise exception 'FAIL: context defaults'; end if;
end $$;

-- 2. Clicks carry what the shopper saw; the view ranks the last 30 days' products.
insert into public.outbound_clicks (product_id, provider, affiliated, product_title, price_ils, is_best_deal, locale, clicked_at) values
  ('aliexpress:clips', 'aliexpress', true, 'Cable clips',       12.40, true,  'he', now() - interval '1 day'),
  ('aliexpress:clips', 'aliexpress', true, 'Cable clips (new)', 11.90, true,  'he', now() - interval '1 hour'),
  ('ebay:jbl',         'ebay',       true, 'JBL Charge 5',      612.12, false, 'en', now() - interval '2 days'),
  ('ebay:stale',       'ebay',       true, 'Old favourite',     50.00, false, 'en', now() - interval '40 days'),
  ('ebay:stale',       'ebay',       true, 'Old favourite',     50.00, false, 'en', now() - interval '41 days');
do $$
declare top record;
begin
  select * into top from public.outbound_click_top_products limit 1;
  if top.product_id <> 'aliexpress:clips' or top.clicks <> 2 or top.title <> 'Cable clips (new)'
    then raise exception 'FAIL: top product (most clicks, latest title): %', top; end if;
  if exists (select 1 from public.outbound_click_top_products where product_id = 'ebay:stale')
    then raise exception 'FAIL: clicks older than 30 days are left out'; end if;
  if (select title from public.outbound_click_top_products where product_id = 'ebay:old') is not null
    then raise exception 'FAIL: a product clicked without a title has none'; end if;
end $$;

-- 3. Bad context is rejected.
select pg_temp.expect_error(
  $$insert into public.outbound_clicks (product_id, provider, affiliated, locale) values ('ebay:9', 'ebay', true, 'fr')$$,
  'unknown locale rejected');
select pg_temp.expect_error(
  $$insert into public.outbound_clicks (product_id, provider, affiliated, price_ils) values ('ebay:9', 'ebay', true, 0)$$,
  'non-positive price rejected');
select pg_temp.expect_error(
  $$insert into public.outbound_clicks (product_id, provider, affiliated, product_title) values ('ebay:9', 'ebay', true, repeat('x', 201))$$,
  'overlong title rejected');
reset role;

-- 4. Visitors can't read the ranking.
set role anon;
select pg_temp.expect_error($$select * from public.outbound_click_top_products$$, 'anon cannot read top products');
reset role;
set role authenticated;
select pg_temp.expect_error($$select * from public.outbound_click_top_products$$, 'authenticated cannot read top products');
reset role;

-- 5. The store index exists.
do $$ begin
  if not exists (select 1 from pg_indexes where indexname = 'outbound_clicks_provider_idx')
    then raise exception 'FAIL: provider index'; end if;
end $$;

\o
\echo 'outbound_click_context: all assertions passed'
