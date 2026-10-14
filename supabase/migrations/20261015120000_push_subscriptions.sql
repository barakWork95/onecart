-- Web Push subscriptions for price-alert notifications, and when each
-- triggered alert was notified (so every trigger is sent exactly once).

create table public.push_subscriptions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Only the major browsers' push services: the server POSTs to this URL, so it must
  -- never be an arbitrary host (the app checks the same allowlist before saving).
  endpoint         text not null check (
    char_length(endpoint) <= 1000 and endpoint ~ '^https://(fcm\.googleapis\.com|([a-z0-9-]+\.)*push\.services\.mozilla\.com|([a-z0-9-]+\.)*push\.apple\.com|([a-z0-9-]+\.)*notify\.windows\.com)/'
  ),
  p256dh           text not null check (char_length(p256dh) between 20 and 200),
  auth             text not null check (char_length(auth) between 8 and 100),
  created_at       timestamptz not null default now(),
  last_success_at  timestamptz,
  failure_count    integer not null default 0 check (failure_count >= 0),
  -- Per user, not global: a browser whose anonymous session was replaced (cookies
  -- cleared) must be able to subscribe again; RLS hides the old user's row from it.
  unique (user_id, endpoint)
);

create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- Null until the trigger has been pushed (or there was nobody to push to).
alter table public.price_alerts add column notified_at timestamptz;

-- Alerts triggered before notifications existed count as handled: the first run must
-- not push days-old drops.
update public.price_alerts set notified_at = triggered_at where status = 'triggered';

-- The checker looks for triggered alerts not yet notified.
create index price_alerts_unnotified_idx on public.price_alerts (user_id)
  where status = 'triggered' and notified_at is null;

-- Owners manage their own subscriptions; the service role (the cron) reads across users.
alter table public.push_subscriptions enable row level security;

create policy "push_subscriptions: owner can read"   on public.push_subscriptions for select to authenticated using (user_id = (select auth.uid()));
create policy "push_subscriptions: owner can insert" on public.push_subscriptions for insert to authenticated with check (user_id = (select auth.uid()));
create policy "push_subscriptions: owner can update" on public.push_subscriptions for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "push_subscriptions: owner can delete" on public.push_subscriptions for delete to authenticated using (user_id = (select auth.uid()));

revoke all on public.push_subscriptions from anon;
grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant select, insert, update, delete on public.push_subscriptions to service_role;
