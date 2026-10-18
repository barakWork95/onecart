-- The language a browser subscribed in: its price-drop notifications are written in it.
-- Existing subscriptions were all made on the English site, so they default to 'en'.
alter table public.push_subscriptions
  add column locale text not null default 'en' check (locale in ('en', 'he'));
