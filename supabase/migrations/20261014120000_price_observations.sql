-- Daily landed prices of the products the homepage may feature, written by the
-- warm-trending cron (service role) and read back to detect real price drops.
-- One row per product per Israeli day; nothing about visitors is stored.

create table public.price_observations (
  product_id    text    not null check (char_length(product_id) between 3 and 200),
  provider      text    not null check (provider in ('amazon', 'aliexpress', 'temu', 'ebay')),
  observed_on   date    not null,
  total_agorot  integer not null check (total_agorot > 0),
  item_agorot   integer not null check (item_agorot > 0),
  query         text    not null check (char_length(query) between 1 and 200),
  title         text    not null check (char_length(title) between 1 and 300),
  observed_at   timestamptz not null default now(),
  primary key (product_id, observed_on)
);

-- Pruning and "since day X" reads scan by day.
create index price_observations_observed_on_idx on public.price_observations (observed_on);

-- RLS on with no policies: only the service role (the cron) reads or writes.
alter table public.price_observations enable row level security;

revoke all on public.price_observations from anon, authenticated;
grant select, insert, update, delete on public.price_observations to service_role;
