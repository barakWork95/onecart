-- Wishlist ("Saved") and price-drop alerts.
-- Every row belongs to an auth user (anonymous users included). Row-level
-- security limits each user to their own rows; only the service role (the
-- daily price checker) reads across users.

create table public.saved_items (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  product_id   text not null check (char_length(product_id) between 3 and 200),
  provider     text not null check (provider in ('amazon', 'aliexpress', 'temu', 'ebay')),
  title        text not null check (char_length(title) between 1 and 300),
  image_url    text check (image_url is null or image_url like 'https://%'),
  product_url  text not null check (product_url like 'https://%'),
  price_agorot integer not null check (price_agorot > 0),
  search_text  text not null check (char_length(search_text) between 1 and 200),
  created_at   timestamptz not null default now(),
  unique (user_id, product_id)
);

create table public.price_alerts (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  product_id       text not null check (char_length(product_id) between 3 and 200),
  provider         text not null check (provider in ('amazon', 'aliexpress', 'temu', 'ebay')),
  title            text not null check (char_length(title) between 1 and 300),
  image_url        text check (image_url is null or image_url like 'https://%'),
  product_url      text not null check (product_url like 'https://%'),
  search_text      text not null check (char_length(search_text) between 1 and 200),
  target_agorot    integer not null check (target_agorot > 0),
  baseline_agorot  integer not null check (baseline_agorot > 0),
  last_seen_agorot integer check (last_seen_agorot is null or last_seen_agorot > 0),
  last_checked_at  timestamptz,
  status           text not null default 'active' check (status in ('active', 'triggered')),
  triggered_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (user_id, product_id),
  -- An alert is for a price *drop*.
  constraint target_below_baseline check (target_agorot < baseline_agorot),
  constraint triggered_has_time check ((status = 'triggered') = (triggered_at is not null))
);

-- The checker scans active alerts, grouped by search text.
create index price_alerts_active_idx on public.price_alerts (search_text) where status = 'active';

create function public.touch_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger price_alerts_touch_updated_at
before update on public.price_alerts
for each row execute function public.touch_updated_at();

-- Row-level security: own rows only. `(select auth.uid())` is evaluated once per statement.
alter table public.saved_items enable row level security;
alter table public.price_alerts enable row level security;

create policy "saved_items: owner can read"   on public.saved_items for select to authenticated using (user_id = (select auth.uid()));
create policy "saved_items: owner can insert" on public.saved_items for insert to authenticated with check (user_id = (select auth.uid()));
create policy "saved_items: owner can update" on public.saved_items for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "saved_items: owner can delete" on public.saved_items for delete to authenticated using (user_id = (select auth.uid()));

create policy "price_alerts: owner can read"   on public.price_alerts for select to authenticated using (user_id = (select auth.uid()));
create policy "price_alerts: owner can insert" on public.price_alerts for insert to authenticated with check (user_id = (select auth.uid()));
create policy "price_alerts: owner can update" on public.price_alerts for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "price_alerts: owner can delete" on public.price_alerts for delete to authenticated using (user_id = (select auth.uid()));

-- Explicit grants: signed-in users (incl. anonymous) only; never the anon key on its own.
revoke all on public.saved_items, public.price_alerts from anon;
grant select, insert, update, delete on public.saved_items, public.price_alerts to authenticated;
