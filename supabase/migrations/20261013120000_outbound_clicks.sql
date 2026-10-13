-- Outbound store clicks (/go redirects), for the internal click report.
-- Nothing identifying is stored: no user, session or IP. Only the server
-- (service role) writes and reads; visitors have no access at all.

create table public.outbound_clicks (
  id          bigint generated always as identity primary key,
  product_id  text not null check (char_length(product_id) between 3 and 200),
  provider    text not null check (provider in ('amazon', 'aliexpress', 'temu', 'ebay')),
  affiliated  boolean not null,
  clicked_at  timestamptz not null default now()
);

create index outbound_clicks_clicked_at_idx on public.outbound_clicks (clicked_at);

-- RLS on with no policies: anon and authenticated are denied even if a grant slips in.
alter table public.outbound_clicks enable row level security;

-- One row per Israeli calendar day and store. security_invoker keeps the
-- table's RLS in force for whoever queries the view.
create view public.outbound_clicks_daily
with (security_invoker = true) as
select
  (clicked_at at time zone 'Asia/Jerusalem')::date as day,
  provider,
  count(*)::int                              as clicks,
  (count(*) filter (where affiliated))::int  as affiliated
from public.outbound_clicks
group by 1, 2;

revoke all on public.outbound_clicks, public.outbound_clicks_daily from anon, authenticated;
grant select, insert on public.outbound_clicks to service_role;
grant select on public.outbound_clicks_daily to service_role;
