-- The service role (the daily price checker, push notifications and the status page)
-- reads and updates every user's price alerts. The table was created granting only
-- `authenticated`, and production's default privileges gave the service role no SELECT,
-- so those reads failed with "permission denied". RLS still keeps users to their own rows.
grant select, insert, update, delete on public.price_alerts to service_role;
