-- catalog_stage2_rollout_smoke.sql
-- Smoke checks for Stage 2 rollout after applying:
--   1) docs/supabase/catalog_migration_v1.sql
--   2) docs/supabase/catalog_upsert_v1.sql
--   3) docs/supabase/catalog_subtopic_unics_v1.sql
--   4) docs/supabase/catalog_question_lookup_v1.sql
--
-- Usage: Supabase SQL Editor.
-- All statements are SELECT-only.
-- Expected result: each check returns OK, or WARN only when the catalog is empty.

-- ============================================================
-- 1. manifest_path column exists in catalog_question_dim
-- ============================================================

select
  'catalog_question_dim.manifest_path exists' as check_name,
  case
    when exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'catalog_question_dim'
        and column_name = 'manifest_path'
        and data_type = 'text'
    ) then 'OK'
    else 'FAIL - manifest_path column is missing'
  end as result;

-- ============================================================
-- 2. Stage-2 functions exist
-- ============================================================

select
  routine_name,
  case when count(*) = 1 then 'OK' else 'FAIL - function missing' end as result
from information_schema.routines
where specific_schema = 'public'
  and routine_name in (
    'catalog_subtopic_unics_v1',
    'catalog_question_lookup_v1'
  )
group by routine_name
order by routine_name;

-- ============================================================
-- 3. visible catalog has questions with manifest_path
-- ============================================================

select
  'visible questions without manifest_path' as check_name,
  count(*) as missing_count,
  case
    when count(*) = 0 then 'OK'
    else 'FAIL - visible questions returned without manifest_path'
  end as result
from public.catalog_question_dim q
join public.catalog_unic_dim u
  on u.unic_id = q.unic_id
 and u.subtopic_id = q.subtopic_id
 and u.theme_id = q.theme_id
join public.catalog_subtopic_dim s
  on s.subtopic_id = q.subtopic_id
 and s.theme_id = q.theme_id
join public.catalog_theme_dim t
  on t.theme_id = q.theme_id
where coalesce(t.is_enabled, true) = true
  and coalesce(t.is_hidden, false) = false
  and coalesce(s.is_enabled, true) = true
  and coalesce(s.is_hidden, false) = false
  and coalesce(u.is_enabled, true) = true
  and coalesce(u.is_hidden, false) = false
  and coalesce(q.is_enabled, true) = true
  and coalesce(q.is_hidden, false) = false
  and nullif(trim(q.manifest_path), '') is null;

-- ============================================================
-- 4. catalog_subtopic_unics_v1 returns rows for visible sample subtopics
-- ============================================================

with sample_subtopics as (
  select array_agg(subtopic_id order by theme_id, sort_order, subtopic_id) as ids
  from (
    select s.subtopic_id, s.theme_id, s.sort_order
    from public.catalog_subtopic_dim s
    join public.catalog_theme_dim t
      on t.theme_id = s.theme_id
    where coalesce(t.is_enabled, true) = true
      and coalesce(t.is_hidden, false) = false
      and coalesce(s.is_enabled, true) = true
      and coalesce(s.is_hidden, false) = false
    order by s.theme_id, s.sort_order, s.subtopic_id
    limit 3
  ) src
),
rpc_rows as (
  select *
  from public.catalog_subtopic_unics_v1((select ids from sample_subtopics))
)
select
  'catalog_subtopic_unics_v1 sample rows' as check_name,
  count(*) as row_count,
  case
    when count(*) > 0 then 'OK'
    else 'WARN - no rows returned (empty visible catalog?)'
  end as result
from rpc_rows;

-- ============================================================
-- 5. catalog_subtopic_unics_v1 matches layer-2 count for sample subtopics
-- ============================================================

with sample_subtopics as (
  select array_agg(subtopic_id order by theme_id, sort_order, subtopic_id) as ids
  from (
    select s.subtopic_id, s.theme_id, s.sort_order
    from public.catalog_subtopic_dim s
    join public.catalog_theme_dim t
      on t.theme_id = s.theme_id
    where coalesce(t.is_enabled, true) = true
      and coalesce(t.is_hidden, false) = false
      and coalesce(s.is_enabled, true) = true
      and coalesce(s.is_hidden, false) = false
    order by s.theme_id, s.sort_order, s.subtopic_id
    limit 3
  ) src
),
expected as (
  select count(*) as cnt
  from public.catalog_unic_dim u
  join public.catalog_subtopic_dim s
    on s.subtopic_id = u.subtopic_id
   and s.theme_id = u.theme_id
  join public.catalog_theme_dim t
    on t.theme_id = u.theme_id
  where coalesce(t.is_enabled, true) = true
    and coalesce(t.is_hidden, false) = false
    and coalesce(s.is_enabled, true) = true
    and coalesce(s.is_hidden, false) = false
    and coalesce(u.is_enabled, true) = true
    and coalesce(u.is_hidden, false) = false
    and u.subtopic_id = any(coalesce((select ids from sample_subtopics), '{}'::text[]))
),
actual as (
  select count(*) as cnt
  from public.catalog_subtopic_unics_v1((select ids from sample_subtopics))
)
select
  'catalog_subtopic_unics_v1 count matches layer-2' as check_name,
  expected.cnt as expected_count,
  actual.cnt as actual_count,
  case
    when expected.cnt = actual.cnt then 'OK'
    else 'FAIL - RPC count does not match layer-2 visible rows'
  end as result
from expected, actual;

-- ============================================================
-- 6. catalog_question_lookup_v1 works for question_id lookup
-- ============================================================

with sample_questions as (
  select array_agg(question_id order by theme_id, subtopic_id, unic_id, sort_order, question_id) as ids
  from (
    select q.question_id, q.theme_id, q.subtopic_id, q.unic_id, q.sort_order
    from public.catalog_question_dim q
    join public.catalog_unic_dim u
      on u.unic_id = q.unic_id
     and u.subtopic_id = q.subtopic_id
     and u.theme_id = q.theme_id
    join public.catalog_subtopic_dim s
      on s.subtopic_id = q.subtopic_id
     and s.theme_id = q.theme_id
    join public.catalog_theme_dim t
      on t.theme_id = q.theme_id
    where coalesce(t.is_enabled, true) = true
      and coalesce(t.is_hidden, false) = false
      and coalesce(s.is_enabled, true) = true
      and coalesce(s.is_hidden, false) = false
      and coalesce(u.is_enabled, true) = true
      and coalesce(u.is_hidden, false) = false
      and coalesce(q.is_enabled, true) = true
      and coalesce(q.is_hidden, false) = false
    order by q.theme_id, q.subtopic_id, q.unic_id, q.sort_order, q.question_id
    limit 5
  ) src
),
rpc_rows as (
  select *
  from public.catalog_question_lookup_v1((select ids from sample_questions), null)
)
select
  'catalog_question_lookup_v1 by question_id' as check_name,
  count(*) as row_count,
  case
    when count(*) > 0 then 'OK'
    else 'WARN - no rows returned (empty visible catalog?)'
  end as result
from rpc_rows;

-- ============================================================
-- 7. question_id lookup returns non-empty manifest_path
-- ============================================================

with sample_questions as (
  select array_agg(question_id order by theme_id, subtopic_id, unic_id, sort_order, question_id) as ids
  from (
    select q.question_id, q.theme_id, q.subtopic_id, q.unic_id, q.sort_order
    from public.catalog_question_dim q
    join public.catalog_unic_dim u
      on u.unic_id = q.unic_id
     and u.subtopic_id = q.subtopic_id
     and u.theme_id = q.theme_id
    join public.catalog_subtopic_dim s
      on s.subtopic_id = q.subtopic_id
     and s.theme_id = q.theme_id
    join public.catalog_theme_dim t
      on t.theme_id = q.theme_id
    where coalesce(t.is_enabled, true) = true
      and coalesce(t.is_hidden, false) = false
      and coalesce(s.is_enabled, true) = true
      and coalesce(s.is_hidden, false) = false
      and coalesce(u.is_enabled, true) = true
      and coalesce(u.is_hidden, false) = false
      and coalesce(q.is_enabled, true) = true
      and coalesce(q.is_hidden, false) = false
    order by q.theme_id, q.subtopic_id, q.unic_id, q.sort_order, q.question_id
    limit 5
  ) src
),
rpc_rows as (
  select *
  from public.catalog_question_lookup_v1((select ids from sample_questions), null)
)
select
  'catalog_question_lookup_v1 manifest_path non-empty' as check_name,
  count(*) filter (where nullif(trim(manifest_path), '') is null) as blank_manifest_count,
  case
    when count(*) filter (where nullif(trim(manifest_path), '') is null) = 0 then 'OK'
    else 'FAIL - lookup returned blank manifest_path'
  end as result
from rpc_rows;

-- ============================================================
-- 8. catalog_question_lookup_v1 works for unic_id lookup
-- ============================================================

with sample_unics as (
  select array_agg(unic_id order by theme_id, subtopic_id, sort_order, unic_id) as ids
  from (
    select u.unic_id, u.theme_id, u.subtopic_id, u.sort_order
    from public.catalog_unic_dim u
    join public.catalog_subtopic_dim s
      on s.subtopic_id = u.subtopic_id
     and s.theme_id = u.theme_id
    join public.catalog_theme_dim t
      on t.theme_id = u.theme_id
    where coalesce(t.is_enabled, true) = true
      and coalesce(t.is_hidden, false) = false
      and coalesce(s.is_enabled, true) = true
      and coalesce(s.is_hidden, false) = false
      and coalesce(u.is_enabled, true) = true
      and coalesce(u.is_hidden, false) = false
    order by u.theme_id, u.subtopic_id, u.sort_order, u.unic_id
    limit 3
  ) src
),
rpc_rows as (
  select *
  from public.catalog_question_lookup_v1(null, (select ids from sample_unics))
)
select
  'catalog_question_lookup_v1 by unic_id' as check_name,
  count(*) as row_count,
  case
    when count(*) > 0 then 'OK'
    else 'WARN - no rows returned (empty visible catalog?)'
  end as result
from rpc_rows;

-- ============================================================
-- 9. catalog_question_lookup_v1 returns empty set for empty request
-- ============================================================

select
  'catalog_question_lookup_v1 empty request' as check_name,
  count(*) as row_count,
  case
    when count(*) = 0 then 'OK'
    else 'FAIL - empty request should not dump visible catalog'
  end as result
from public.catalog_question_lookup_v1(null, null);

