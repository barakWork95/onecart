-- Run by scripts/test-db.sh. Any failed assertion raises and aborts with a non-zero exit.
\set ON_ERROR_STOP on
\o /dev/null

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000c1'),
  ('00000000-0000-0000-0000-0000000000c2');
grant select, insert, update, delete on public.price_alerts to service_role;

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

-- 1. A user subscribes; user_id defaults to auth.uid().
select pg_temp.act_as('00000000-0000-0000-0000-0000000000c1');
insert into public.push_subscriptions (endpoint, p256dh, auth)
values ('https://fcm.googleapis.com/fcm/send/abc', repeat('k', 87), repeat('a', 22));
insert into public.push_subscriptions (endpoint, p256dh, auth)
values ('https://updates.push.services.mozilla.com/wpush/v2/xyz', repeat('k', 87), repeat('a', 22));
insert into public.push_subscriptions (endpoint, p256dh, auth)
values ('https://web.push.apple.com/QGuQ', repeat('k', 87), repeat('a', 22));
do $$ begin
  if (select count(*) from public.push_subscriptions) <> 3 then raise exception 'FAIL: owner sees own subscriptions'; end if;
end $$;

-- 2. Only the major push services' hosts are accepted.
select pg_temp.expect_error(
  $$insert into public.push_subscriptions (endpoint, p256dh, auth) values ('https://evil.example/push', repeat('k', 87), repeat('a', 22))$$,
  'arbitrary host rejected');
select pg_temp.expect_error(
  $$insert into public.push_subscriptions (endpoint, p256dh, auth) values ('https://fcm.googleapis.com.evil.example/x', repeat('k', 87), repeat('a', 22))$$,
  'look-alike host rejected');
select pg_temp.expect_error(
  $$insert into public.push_subscriptions (endpoint, p256dh, auth) values ('http://fcm.googleapis.com/fcm/send/x', repeat('k', 87), repeat('a', 22))$$,
  'plain http rejected');
select pg_temp.expect_error(
  $$insert into public.push_subscriptions (endpoint, p256dh, auth) values ('https://fcm.googleapis.com/fcm/send/abc', repeat('k', 87), repeat('a', 22))$$,
  'one row per endpoint per user');

-- 3. Another user sees nothing and can't add rows for someone else.
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000c2');
do $$ begin
  if (select count(*) from public.push_subscriptions) <> 0 then raise exception 'FAIL: RLS leak on push_subscriptions'; end if;
end $$;
delete from public.push_subscriptions;
-- The same browser under a new anonymous user can subscribe again.
insert into public.push_subscriptions (endpoint, p256dh, auth)
values ('https://fcm.googleapis.com/fcm/send/abc', repeat('k', 87), repeat('a', 22));
select pg_temp.expect_error(
  $$insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
    values ('00000000-0000-0000-0000-0000000000c1', 'https://fcm.googleapis.com/fcm/send/new', repeat('k', 87), repeat('a', 22))$$,
  'cannot subscribe on behalf of someone else');
reset role;

-- 4. Anonymous key alone: no access.
set role anon;
select pg_temp.expect_error($$select * from public.push_subscriptions$$, 'anon cannot read');
reset role;

-- 5. The service role reads across users; deleting the user removes their subscriptions.
set role service_role;
do $$ begin
  if (select count(*) from public.push_subscriptions) <> 4 then raise exception 'FAIL: service role reads all'; end if;
end $$;
reset role;
delete from auth.users where id = '00000000-0000-0000-0000-0000000000c1';
do $$ begin
  if (select count(*) from public.push_subscriptions) <> 1 then raise exception 'FAIL: subscriptions not deleted with user'; end if;
end $$;

-- 6. price_alerts gained notified_at, null by default.
do $$ begin
  if not exists (select 1 from information_schema.columns
                 where table_name = 'price_alerts' and column_name = 'notified_at' and is_nullable = 'YES')
    then raise exception 'FAIL: price_alerts.notified_at'; end if;
end $$;

\o
\echo 'push_subscriptions: all assertions passed'
