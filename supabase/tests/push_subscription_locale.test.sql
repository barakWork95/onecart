-- Run by scripts/test-db.sh. Any failed assertion raises and aborts with a non-zero exit.
\set ON_ERROR_STOP on
\o /dev/null

insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000d1');

-- 1. A subscription made before languages existed reads as English.
insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
values ('00000000-0000-0000-0000-0000000000d1', 'https://fcm.googleapis.com/fcm/send/en1', repeat('k', 87), repeat('a', 22));
do $$ begin
  if (select locale from public.push_subscriptions where endpoint like '%/en1') <> 'en'
    then raise exception 'FAIL: locale defaults to en'; end if;
end $$;

-- 2. A Hebrew browser keeps its language; only known languages are accepted.
insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, locale)
values ('00000000-0000-0000-0000-0000000000d1', 'https://fcm.googleapis.com/fcm/send/he1', repeat('k', 87), repeat('a', 22), 'he');
do $$ begin
  if (select locale from public.push_subscriptions where endpoint like '%/he1') <> 'he'
    then raise exception 'FAIL: locale he kept'; end if;
  begin
    insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, locale)
    values ('00000000-0000-0000-0000-0000000000d1', 'https://fcm.googleapis.com/fcm/send/fr1', repeat('k', 87), repeat('a', 22), 'fr');
    raise exception 'FAIL: unknown locale accepted';
  exception when check_violation then null;
  end;
  begin
    update public.push_subscriptions set locale = null where endpoint like '%/he1';
    raise exception 'FAIL: null locale accepted';
  exception when not_null_violation then null;
  end;
end $$;

delete from auth.users where id = '00000000-0000-0000-0000-0000000000d1';

\o
\echo 'push_subscription_locale: all assertions passed'
