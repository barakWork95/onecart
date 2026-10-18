-- Run by scripts/test-db.sh. Any failed assertion raises and aborts with a non-zero exit.
\set ON_ERROR_STOP on
-- Only NOTICEs and the final \echo are interesting; hide query result tables.
\o /dev/null

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-00000000000b');
-- No test-side grants: the service role's access must come from the migrations alone (a grant
-- added here once hid that production's service role couldn't read price_alerts).

create function pg_temp.act_as(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, false);
  execute 'set role authenticated';
end $$;

create function pg_temp.expect_error(stmt text, label text) returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'FAIL: % — statement succeeded', label;
exception when others then
  if sqlerrm like 'FAIL:%' then raise; end if;
  raise notice 'ok: % (%)', label, sqlstate;
end $$;

-- 1. A user can save and read their own items; user_id defaults to auth.uid().
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
insert into public.saved_items (product_id, provider, title, product_url, price_agorot, search_text)
values ('aliexpress:1', 'aliexpress', 'Life P3', 'https://www.aliexpress.com/item/1.html', 8900, 'wireless earbuds');
insert into public.price_alerts (product_id, provider, title, product_url, search_text, target_agorot, baseline_agorot)
values ('aliexpress:1', 'aliexpress', 'Life P3', 'https://www.aliexpress.com/item/1.html', 'wireless earbuds', 8000, 8900);
do $$ begin
  if (select count(*) from public.saved_items) <> 1 then raise exception 'FAIL: owner should see 1 saved item'; end if;
  if (select user_id from public.saved_items) <> '00000000-0000-0000-0000-00000000000a' then raise exception 'FAIL: user_id default'; end if;
end $$;

-- 2. Another user sees nothing and cannot touch user A's rows.
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
do $$ begin
  if (select count(*) from public.saved_items) <> 0 then raise exception 'FAIL: RLS leak on saved_items'; end if;
  if (select count(*) from public.price_alerts) <> 0 then raise exception 'FAIL: RLS leak on price_alerts'; end if;
end $$;
update public.price_alerts set target_agorot = 1;
delete from public.saved_items;
select pg_temp.expect_error(
  $$insert into public.saved_items (user_id, product_id, provider, title, product_url, price_agorot, search_text)
    values ('00000000-0000-0000-0000-00000000000a', 'ebay:2', 'ebay', 'x', 'https://www.ebay.com/itm/2', 100, 'x')$$,
  'cannot insert rows owned by someone else');

-- 3. Constraints reject bad data.
select pg_temp.expect_error(
  $$insert into public.price_alerts (product_id, provider, title, product_url, search_text, target_agorot, baseline_agorot)
    values ('ebay:3', 'ebay', 'x', 'https://www.ebay.com/itm/3', 'x', 9000, 8900)$$,
  'target must be below baseline');
select pg_temp.expect_error(
  $$insert into public.saved_items (product_id, provider, title, product_url, price_agorot, search_text)
    values ('shein:1', 'shein', 'x', 'https://shein.com/1', 100, 'x')$$,
  'unknown provider rejected');
select pg_temp.expect_error(
  $$insert into public.saved_items (product_id, provider, title, product_url, price_agorot, search_text)
    values ('ebay:4', 'ebay', 'x', 'javascript:alert(1)', 100, 'x')$$,
  'non-https product URL rejected');
select pg_temp.expect_error(
  $$insert into public.price_alerts (product_id, provider, title, product_url, search_text, target_agorot, baseline_agorot, status)
    values ('ebay:5', 'ebay', 'x', 'https://www.ebay.com/itm/5', 'x', 100, 200, 'triggered')$$,
  'triggered alert needs triggered_at');

-- 4. The anon role (no sign-in) has no access at all.
reset role;
set role anon;
select pg_temp.expect_error($$select * from public.saved_items$$, 'anon cannot read saved_items');
reset role;

-- 5. User A's data was untouched by user B's attempts.
do $$ begin
  if (select target_agorot from public.price_alerts) <> 8000 then raise exception 'FAIL: B modified A''s alert'; end if;
  if (select count(*) from public.saved_items) <> 1 then raise exception 'FAIL: B deleted A''s item'; end if;
end $$;

-- 6. The service role (price checker) sees all alerts; updated_at moves on update.
set role service_role;
do $$
declare before timestamptz;
begin
  if (select count(*) from public.price_alerts) <> 1 then raise exception 'FAIL: service role should see all alerts'; end if;
  select updated_at into before from public.price_alerts;
  perform pg_sleep(0.01);
  update public.price_alerts set last_seen_agorot = 7900, status = 'triggered', triggered_at = now(), last_checked_at = now();
  if (select updated_at from public.price_alerts) <= before then raise exception 'FAIL: updated_at not touched'; end if;
end $$;
reset role;

-- 7. Deleting a user cascades to their rows.
delete from auth.users where id = '00000000-0000-0000-0000-00000000000a';
do $$ begin
  if (select count(*) from public.saved_items) + (select count(*) from public.price_alerts) <> 0 then
    raise exception 'FAIL: rows not deleted with user';
  end if;
end $$;

\echo 'ALL DATABASE TESTS PASSED'
