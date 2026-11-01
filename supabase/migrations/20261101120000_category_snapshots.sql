-- The last indexable copy of each category page, written by the warm-trending cron
-- (service role). A thin build (Redis down, results expired before the warm-up) falls
-- back to it for up to 14 days, so a temporary outage never flips a page to noindex.

create table public.category_snapshots (
  slug      text        primary key check (slug ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
  page      jsonb       not null check (jsonb_typeof(page) = 'object'),
  saved_at  timestamptz not null default now()
);

-- RLS on with no policies: only the service role (the cron and page builds) reads or writes.
alter table public.category_snapshots enable row level security;

revoke all on public.category_snapshots from anon, authenticated;
grant select, insert, update, delete on public.category_snapshots to service_role;
