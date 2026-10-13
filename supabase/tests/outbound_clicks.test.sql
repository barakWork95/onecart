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

-- 1. The service role records clicks; the view counts them per Israeli day and store.
set role service_role;
insert into public.outbound_clicks (product_id, provider, affiliated, clicked_at) values
  ('ebay:1',   'ebay',   true,  '2026-10-12 20:30:00+00'), -- 23:30 Oct 12 in Israel
  ('ebay:2',   'ebay',   false, '2026-10-12 21:30:00+00'), -- 00:30 Oct 13 in Israel
  ('amazon:1', 'amazon', true,  '2026-10-13 09:00:00+00'),
  ('amazon:2', 'amazon', true,  '2026-10-13 10:00:00+00');
do $$ begin
  if (select clicks from public.outbound_clicks_daily where day = '2026-10-12' and provider = 'ebay') <> 1
    then raise exception 'FAIL: 23:30 Israel time belongs to Oct 12'; end if;
  if (select clicks from public.outbound_clicks_daily where day = '2026-10-13' and provider = 'ebay') <> 1
    then raise exception 'FAIL: 00:30 Israel time belongs to Oct 13'; end if;
  if (select (clicks, affiliated) from public.outbound_clicks_daily where day = '2026-10-13' and provider = 'amazon') <> (2, 2)
    then raise exception 'FAIL: amazon daily totals'; end if;
end $$;

-- 2. Constraints reject bad data.
select pg_temp.expect_error(
  $$insert into public.outbound_clicks (product_id, provider, affiliated) values ('shein:1', 'shein', true)$$,
  'unknown provider rejected');
select pg_temp.expect_error(
  $$insert into public.outbound_clicks (product_id, provider, affiliated) values ('x', 'ebay', true)$$,
  'product id too short');
reset role;

-- 3. Visitors (signed in or not) can neither write nor read clicks.
set role anon;
select pg_temp.expect_error($$insert into public.outbound_clicks (product_id, provider, affiliated) values ('ebay:9', 'ebay', true)$$, 'anon cannot insert');
select pg_temp.expect_error($$select * from public.outbound_clicks$$, 'anon cannot read clicks');
select pg_temp.expect_error($$select * from public.outbound_clicks_daily$$, 'anon cannot read the daily view');
reset role;
set role authenticated;
select pg_temp.expect_error($$insert into public.outbound_clicks (product_id, provider, affiliated) values ('ebay:9', 'ebay', true)$$, 'authenticated cannot insert');
select pg_temp.expect_error($$select * from public.outbound_clicks_daily$$, 'authenticated cannot read the daily view');
reset role;

\o
\echo 'outbound_clicks: all assertions passed'
