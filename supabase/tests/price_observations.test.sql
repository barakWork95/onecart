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

-- 1. The service role records one row per product per day; a later run that day replaces it.
set role service_role;
insert into public.price_observations (product_id, provider, observed_on, total_agorot, item_agorot, query, title)
values ('ebay:1', 'ebay', '2026-10-14', 30000, 25000, 'jbl charge 5', 'JBL Charge 5');
insert into public.price_observations (product_id, provider, observed_on, total_agorot, item_agorot, query, title)
values ('ebay:1', 'ebay', '2026-10-14', 29000, 24000, 'jbl charge 5', 'JBL Charge 5')
on conflict (product_id, observed_on) do update set total_agorot = excluded.total_agorot;
insert into public.price_observations (product_id, provider, observed_on, total_agorot, item_agorot, query, title)
values ('ebay:1', 'ebay', '2026-10-15', 28000, 23000, 'jbl charge 5', 'JBL Charge 5');
do $$ begin
  if (select count(*) from public.price_observations where product_id = 'ebay:1') <> 2
    then raise exception 'FAIL: one row per product per day'; end if;
  if (select total_agorot from public.price_observations where observed_on = '2026-10-14') <> 29000
    then raise exception 'FAIL: the day''s row is replaced'; end if;
end $$;

-- 2. Constraints reject bad data.
select pg_temp.expect_error(
  $$insert into public.price_observations (product_id, provider, observed_on, total_agorot, item_agorot, query, title)
    values ('ebay:2', 'ebay', '2026-10-14', 0, 1, 'q', 't')$$,
  'non-positive total rejected');
select pg_temp.expect_error(
  $$insert into public.price_observations (product_id, provider, observed_on, total_agorot, item_agorot, query, title)
    values ('shein:1', 'shein', '2026-10-14', 100, 100, 'q', 't')$$,
  'unknown provider rejected');

-- 3. Pruning by day works.
delete from public.price_observations where observed_on < '2026-10-15';
do $$ begin
  if (select count(*) from public.price_observations) <> 1 then raise exception 'FAIL: prune by day'; end if;
end $$;
reset role;

-- 4. Visitors have no access at all.
set role anon;
select pg_temp.expect_error($$select * from public.price_observations$$, 'anon cannot read');
reset role;
set role authenticated;
select pg_temp.expect_error($$select * from public.price_observations$$, 'authenticated cannot read');
select pg_temp.expect_error(
  $$insert into public.price_observations (product_id, provider, observed_on, total_agorot, item_agorot, query, title)
    values ('ebay:9', 'ebay', '2026-10-14', 100, 100, 'q', 't')$$,
  'authenticated cannot insert');
reset role;

\o
\echo 'price_observations: all assertions passed'
