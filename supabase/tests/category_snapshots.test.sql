-- Run by scripts/test-db.sh. Any failed assertion raises and aborts with a non-zero exit.
\set ON_ERROR_STOP on
\o /dev/null

create function pg_temp.expect_error(stmt text, label text) returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'FAIL: % — statement succeeded', label;
exception when others then
  if sqlerrm like 'FAIL:%' then raise; end if;
  raise notice 'ok: % (%)', label, sqlstate;
end $$;

-- 1. The service role keeps one snapshot per category; a later save replaces it.
set role service_role;
insert into public.category_snapshots (slug, page, saved_at)
values ('headphones', '{"indexable": true, "products": []}', '2026-10-30T07:31:00Z');
insert into public.category_snapshots (slug, page, saved_at)
values ('headphones', '{"indexable": true, "products": [1]}', '2026-10-31T07:31:00Z')
on conflict (slug) do update set page = excluded.page, saved_at = excluded.saved_at;
do $$ begin
  if (select count(*) from public.category_snapshots) <> 1 then raise exception 'FAIL: one row per slug'; end if;
  if (select saved_at from public.category_snapshots where slug = 'headphones') <> '2026-10-31T07:31:00Z'
    then raise exception 'FAIL: a later save replaces the row'; end if;
end $$;

-- 2. Constraints reject bad data.
select pg_temp.expect_error(
  $$insert into public.category_snapshots (slug, page) values ('', '{}')$$, 'empty slug rejected');
select pg_temp.expect_error(
  $$insert into public.category_snapshots (slug, page) values ('Bad Slug!', '{}')$$, 'non-slug rejected');
select pg_temp.expect_error(
  $$insert into public.category_snapshots (slug, page) values ('speakers', '[]')$$, 'non-object page rejected');
reset role;

-- 3. Visitors have no access at all.
set role anon;
select pg_temp.expect_error($$select * from public.category_snapshots$$, 'anon cannot read');
reset role;
set role authenticated;
select pg_temp.expect_error($$select * from public.category_snapshots$$, 'authenticated cannot read');
select pg_temp.expect_error(
  $$insert into public.category_snapshots (slug, page) values ('speakers', '{}')$$, 'authenticated cannot insert');
reset role;

\o
\echo 'category_snapshots: all assertions passed'
