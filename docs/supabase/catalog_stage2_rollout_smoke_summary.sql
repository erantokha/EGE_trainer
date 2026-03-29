-- catalog_stage2_rollout_smoke_summary.sql
-- Single-result-set smoke summary for Stage 2 rollout after applying:
--   1) docs/supabase/catalog_migration_v1.sql
--   2) docs/supabase/catalog_upsert_v1.sql
--   3) docs/supabase/catalog_subtopic_unics_v1.sql
--   4) docs/supabase/catalog_question_lookup_v1.sql
--
-- Usage: Supabase SQL Editor.
-- All statements are SELECT-only.
-- Expected result: status = OK for all checks, or WARN only when the visible catalog is empty.

with required_functions as (
  select *
  from (
    values
      ('catalog_subtopic_unics_v1'::text),
      ('catalog_question_lookup_v1'::text)
  ) v(routine_name)
),
function_presence as (
  select
    rf.routine_name,
    count(r.routine_name) as found_count
  from required_functions rf
  left join information_schema.routines r
    on r.specific_schema = 'public'
   and r.routine_name = rf.routine_name
  group by rf.routine_name
),
visible_themes as (
  select
    t.theme_id,
    t.sort_order as theme_sort_order
  from public.catalog_theme_dim t
  where coalesce(t.is_enabled, true) = true
    and coalesce(t.is_hidden, false) = false
),
visible_subtopics as (
  select
    s.subtopic_id,
    s.theme_id,
    s.sort_order as subtopic_sort_order,
    vt.theme_sort_order
  from public.catalog_subtopic_dim s
  join visible_themes vt
    on vt.theme_id = s.theme_id
  where coalesce(s.is_enabled, true) = true
    and coalesce(s.is_hidden, false) = false
),
visible_unics as (
  select
    u.unic_id,
    u.subtopic_id,
    u.theme_id,
    u.sort_order as unic_sort_order,
    vs.theme_sort_order,
    vs.subtopic_sort_order
  from public.catalog_unic_dim u
  join visible_subtopics vs
    on vs.subtopic_id = u.subtopic_id
   and vs.theme_id = u.theme_id
  where coalesce(u.is_enabled, true) = true
    and coalesce(u.is_hidden, false) = false
),
visible_questions as (
  select
    q.question_id,
    q.unic_id,
    q.subtopic_id,
    q.theme_id,
    q.sort_order,
    q.manifest_path,
    q.catalog_version,
    vu.theme_sort_order,
    vu.subtopic_sort_order,
    vu.unic_sort_order
  from public.catalog_question_dim q
  join visible_unics vu
    on vu.unic_id = q.unic_id
   and vu.subtopic_id = q.subtopic_id
   and vu.theme_id = q.theme_id
  where coalesce(q.is_enabled, true) = true
    and coalesce(q.is_hidden, false) = false
),
sample_subtopics as (
  select
    array_agg(subtopic_id order by theme_sort_order, theme_id, subtopic_sort_order, subtopic_id) as ids,
    count(*) as sample_count
  from (
    select
      vs.subtopic_id,
      vs.theme_id,
      vs.subtopic_sort_order,
      vs.theme_sort_order
    from visible_subtopics vs
    order by
      vs.theme_sort_order,
      vs.theme_id,
      vs.subtopic_sort_order,
      vs.subtopic_id
    limit 3
  ) src
),
sample_unics as (
  select
    array_agg(unic_id order by theme_sort_order, theme_id, subtopic_sort_order, subtopic_id, unic_sort_order, unic_id) as ids,
    count(*) as sample_count
  from (
    select
      vu.unic_id,
      vu.theme_id,
      vu.subtopic_id,
      vu.unic_sort_order,
      vu.subtopic_sort_order,
      vu.theme_sort_order
    from visible_unics vu
    order by
      vu.theme_sort_order,
      vu.theme_id,
      vu.subtopic_sort_order,
      vu.subtopic_id,
      vu.unic_sort_order,
      vu.unic_id
    limit 3
  ) src
),
sample_questions as (
  select
    array_agg(question_id order by theme_sort_order, theme_id, subtopic_sort_order, subtopic_id, unic_sort_order, unic_id, sort_order, question_id) as ids,
    count(*) as sample_count
  from (
    select
      vq.question_id,
      vq.theme_id,
      vq.subtopic_id,
      vq.unic_id,
      vq.sort_order,
      vq.unic_sort_order,
      vq.subtopic_sort_order,
      vq.theme_sort_order
    from visible_questions vq
    order by
      vq.theme_sort_order,
      vq.theme_id,
      vq.subtopic_sort_order,
      vq.subtopic_id,
      vq.unic_sort_order,
      vq.unic_id,
      vq.sort_order,
      vq.question_id
    limit 5
  ) src
),
subtopic_unics_rpc as (
  select *
  from public.catalog_subtopic_unics_v1((select ids from sample_subtopics))
),
question_lookup_by_ids_rpc as (
  select *
  from public.catalog_question_lookup_v1((select ids from sample_questions), null)
),
question_lookup_by_unics_rpc as (
  select *
  from public.catalog_question_lookup_v1(null, (select ids from sample_unics))
),
checks as (
  select
    '1'::text as check_id,
    'catalog_question_dim.manifest_path exists'::text as check_name,
    case
      when exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'catalog_question_dim'
          and column_name = 'manifest_path'
          and data_type = 'text'
      ) then 'OK'
      else 'FAIL'
    end as status,
    case
      when exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'catalog_question_dim'
          and column_name = 'manifest_path'
          and data_type = 'text'
      ) then 'public.catalog_question_dim.manifest_path:text'
      else 'manifest_path column is missing'
    end as details

  union all

  select
    '2',
    'Stage-2 functions exist',
    case
      when sum(case when fp.found_count = 1 then 1 else 0 end) = count(*) then 'OK'
      else 'FAIL'
    end as status,
    'present='
      || sum(case when fp.found_count = 1 then 1 else 0 end)
      || '/'
      || count(*)
      || '; missing='
      || coalesce(string_agg(fp.routine_name, ', ' order by fp.routine_name) filter (where fp.found_count <> 1), 'none')
      as details
  from function_presence fp

  union all

  select
    '3',
    'visible questions without manifest_path',
    case
      when counts.visible_question_count = 0 then 'WARN'
      when counts.missing_manifest_count = 0 then 'OK'
      else 'FAIL'
    end as status,
    'visible_questions='
      || counts.visible_question_count
      || '; missing_count='
      || counts.missing_manifest_count
      as details
  from (
    select
      (select count(*) from visible_questions) as visible_question_count,
      (select count(*) from visible_questions where nullif(trim(manifest_path), '') is null) as missing_manifest_count
  ) counts

  union all

  select
    '4',
    'catalog_subtopic_unics_v1 sample rows',
    case
      when sample.sample_count = 0 then 'WARN'
      when rpc.row_count > 0 then 'OK'
      else 'WARN'
    end as status,
    'sample_subtopics='
      || sample.sample_count
      || '; row_count='
      || rpc.row_count
      as details
  from
    (select sample_count from sample_subtopics) sample,
    (select count(*) as row_count from subtopic_unics_rpc) rpc

  union all

  select
    '5',
    'catalog_subtopic_unics_v1 count matches layer-2',
    case
      when sample.sample_count = 0 then 'WARN'
      when expected.expected_count = actual.actual_count then 'OK'
      else 'FAIL'
    end as status,
    'sample_subtopics='
      || sample.sample_count
      || '; expected='
      || expected.expected_count
      || '; actual='
      || actual.actual_count
      as details
  from
    (select sample_count from sample_subtopics) sample,
    (
      select count(*) as expected_count
      from visible_unics
      where subtopic_id = any(coalesce((select ids from sample_subtopics), '{}'::text[]))
    ) expected,
    (
      select count(*) as actual_count
      from subtopic_unics_rpc
    ) actual

  union all

  select
    '6',
    'catalog_question_lookup_v1 by question_id',
    case
      when sample.sample_count = 0 then 'WARN'
      when rpc.row_count > 0 then 'OK'
      else 'WARN'
    end as status,
    'sample_questions='
      || sample.sample_count
      || '; row_count='
      || rpc.row_count
      as details
  from
    (select sample_count from sample_questions) sample,
    (select count(*) as row_count from question_lookup_by_ids_rpc) rpc

  union all

  select
    '7',
    'catalog_question_lookup_v1 manifest_path non-empty',
    case
      when sample.sample_count = 0 then 'WARN'
      when rpc.row_count = 0 then 'WARN'
      when rpc.blank_manifest_count = 0 then 'OK'
      else 'FAIL'
    end as status,
    'sample_questions='
      || sample.sample_count
      || '; row_count='
      || rpc.row_count
      || '; blank_manifest_count='
      || rpc.blank_manifest_count
      as details
  from
    (select sample_count from sample_questions) sample,
    (
      select
        count(*) as row_count,
        count(*) filter (where nullif(trim(manifest_path), '') is null) as blank_manifest_count
      from question_lookup_by_ids_rpc
    ) rpc

  union all

  select
    '8',
    'catalog_question_lookup_v1 by unic_id',
    case
      when sample.sample_count = 0 then 'WARN'
      when rpc.row_count > 0 then 'OK'
      else 'WARN'
    end as status,
    'sample_unics='
      || sample.sample_count
      || '; row_count='
      || rpc.row_count
      as details
  from
    (select sample_count from sample_unics) sample,
    (select count(*) as row_count from question_lookup_by_unics_rpc) rpc

  union all

  select
    '9',
    'catalog_question_lookup_v1 empty request',
    case
      when count(*) = 0 then 'OK'
      else 'FAIL'
    end as status,
    'row_count=' || count(*) as details
  from public.catalog_question_lookup_v1(null, null)
),
summary as (
  select
    'summary'::text as check_id,
    'Stage 2 rollout smoke summary'::text as check_name,
    case
      when count(*) filter (where status = 'FAIL') > 0 then 'FAIL'
      when count(*) filter (where status = 'WARN') > 0 then 'WARN'
      else 'OK'
    end as status,
    'ok='
      || count(*) filter (where status = 'OK')
      || '; warn='
      || count(*) filter (where status = 'WARN')
      || '; fail='
      || count(*) filter (where status = 'FAIL')
      as details
  from checks
),
all_rows as (
  select
    check_id,
    check_name,
    status,
    details,
    check_id::integer as sort_key
  from checks

  union all

  select
    check_id,
    check_name,
    status,
    details,
    999 as sort_key
  from summary
)
select
  check_id,
  check_name,
  status,
  details
from all_rows

order by
  sort_key;
