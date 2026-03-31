-- teacher_picking_screen_v1_rollout_smoke_summary.sql
-- Single-result-set smoke summary for Stage 3 init rollout after applying:
--   1) docs/supabase/teacher_picking_screen_v1.sql
--
-- Usage: Supabase SQL Editor.
-- All statements are SELECT-only.
-- Expected result: status = OK for all checks, or WARN only when the project has
-- no teacher-student pairs or no visible catalog yet.

with required_functions as (
  select *
  from (
    values
      ('teacher_picking_screen_v1'::text)
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
    t.catalog_version
  from public.catalog_theme_dim t
  where coalesce(t.is_enabled, true) = true
    and coalesce(t.is_hidden, false) = false
),
visible_subtopics as (
  select
    s.subtopic_id,
    s.theme_id,
    s.catalog_version
  from public.catalog_subtopic_dim s
  join visible_themes t
    on t.theme_id = s.theme_id
  where coalesce(s.is_enabled, true) = true
    and coalesce(s.is_hidden, false) = false
),
catalog_counts as (
  select
    (select count(*) from visible_themes) as visible_theme_count,
    (select count(*) from visible_subtopics) as visible_subtopic_count,
    coalesce((
      select max(v.catalog_version)
      from (
        select catalog_version from visible_themes
        union all
        select catalog_version from visible_subtopics
      ) v
    ), '') as expected_catalog_version
),
sample_pair as (
  select
    ts.teacher_id,
    ts.student_id
  from public.teacher_students ts
  join public.profiles p
    on p.id = ts.teacher_id
   and lower(coalesce(p.role, '')) = 'teacher'
  join auth.users au
    on au.id = ts.teacher_id
  join public.teachers tw
    on lower(tw.email) = lower(coalesce(au.email, ''))
   and coalesce(tw.approved, true) = true
  order by ts.teacher_id, ts.student_id
  limit 1
),
auth_applied as materialized (
  select
    sp.teacher_id,
    sp.student_id,
    set_config('request.jwt.claim.sub', sp.teacher_id::text, true) as jwt_sub,
    set_config('request.jwt.claim.role', 'authenticated', true) as jwt_role,
    set_config(
      'request.jwt.claims',
      jsonb_build_object(
        'sub', sp.teacher_id::text,
        'role', 'authenticated'
      )::text,
      true
    ) as jwt_claims
  from sample_pair sp
),
auth_probe as (
  select
    aa.teacher_id,
    aa.student_id,
    auth.uid() as effective_uid,
    public.is_teacher_for_student(aa.student_id) as can_access_student
  from auth_applied aa
),
auth_meta as (
  select
    ap.teacher_id,
    ap.student_id,
    ap.effective_uid,
    ap.can_access_student
  from auth_probe ap

  union all

  select
    null::uuid as teacher_id,
    null::uuid as student_id,
    null::uuid as effective_uid,
    false as can_access_student
  where not exists (select 1 from auth_probe)

  limit 1
),
auth_state as (
  select
    case
      when am.teacher_id is not null
       and am.effective_uid = am.teacher_id
       and am.can_access_student = true then true
      else false
    end as is_ready
  from auth_meta am
),
payload_raw as (
  select
    public.teacher_picking_screen_v1(
      ap.student_id,
      'init',
      30,
      'all',
      '{}'::jsonb,
      '{}'::jsonb,
      null::text[]
    ) as payload
  from auth_probe ap
  where ap.effective_uid = ap.teacher_id
    and ap.can_access_student = true
),
payload_one as (
  select payload
  from payload_raw

  union all

  select null::jsonb as payload
  where not exists (select 1 from payload_raw)

  limit 1
),
payload_meta as (
  select
    p.payload,
    case
      when p.payload is null then 'null'
      else coalesce(jsonb_typeof(p.payload), 'null')
    end as payload_type,
    coalesce(p.payload->>'catalog_version', '') as catalog_version,
    coalesce(p.payload #>> '{screen,mode}', '') as screen_mode,
    lower(coalesce(p.payload #>> '{screen,can_pick}', 'false')) = 'true' as can_pick,
    coalesce(p.payload #>> '{screen,source_contract}', '') as source_contract,
    case
      when jsonb_typeof(p.payload->'sections') = 'array'
        then jsonb_array_length(p.payload->'sections')
      else 0
    end as section_count,
    case
      when jsonb_typeof(p.payload->'picked_questions') = 'array'
        then jsonb_array_length(p.payload->'picked_questions')
      else 0
    end as picked_question_count,
    case
      when jsonb_typeof(p.payload->'recommendations') = 'array'
        then jsonb_array_length(p.payload->'recommendations')
      else 0
    end as recommendation_count,
    case
      when jsonb_typeof(p.payload->'dashboard') = 'object'
        then 'object'
      else coalesce(jsonb_typeof(p.payload->'dashboard'), 'null')
    end as dashboard_type,
    coalesce(jsonb_typeof(p.payload #> '{selection,normalized}'), 'null') as selection_type
  from payload_one p
),
section_rows as (
  select s.obj
  from payload_one p
  cross join lateral jsonb_array_elements(coalesce(p.payload->'sections', '[]'::jsonb)) as s(obj)
),
topic_rows as (
  select t.obj
  from section_rows s
  cross join lateral jsonb_array_elements(coalesce(s.obj->'topics', '[]'::jsonb)) as t(obj)
),
recommendation_rows as (
  select r.obj
  from payload_one p
  cross join lateral jsonb_array_elements(coalesce(p.payload->'recommendations', '[]'::jsonb)) as r(obj)
),
required_top_keys as (
  select *
  from (
    values
      ('student'::text),
      ('catalog_version'::text),
      ('screen'::text),
      ('sections'::text),
      ('recommendations'::text),
      ('selection'::text),
      ('picked_questions'::text),
      ('dashboard'::text),
      ('generated_at'::text)
  ) v(key_name)
),
missing_top_keys as (
  select
    count(*) filter (where not coalesce((select payload from payload_one) ? rk.key_name, false)) as missing_count,
    coalesce(
      string_agg(rk.key_name, ', ' order by rk.key_name)
        filter (where not coalesce((select payload from payload_one) ? rk.key_name, false)),
      'none'
    ) as missing_keys
  from required_top_keys rk
),
recommendation_reason_stats as (
  select
    count(*) as row_count,
    count(*) filter (
      where coalesce(nullif(trim(obj->>'reason'), ''), 'missing')
        not in ('weak', 'low', 'uncovered', 'stale')
    ) as invalid_reason_count
  from recommendation_rows
),
checks as (
  select
    '1'::text as check_id,
    'teacher_picking_screen_v1 exists'::text as check_name,
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
    '2',
    'sample teacher/student pair',
    case
      when count(*) = 1 then 'OK'
      else 'WARN'
    end as status,
    'pair_count='
      || count(*)
      || '; teacher_id='
      || coalesce(min(sp.teacher_id::text), 'none')
      || '; student_id='
      || coalesce(min(sp.student_id::text), 'none')
      as details
  from sample_pair sp

  union all

  select
    '3',
    'SQL editor auth context works',
    case
      when (select count(*) from sample_pair) = 0 then 'WARN'
      when am.effective_uid = am.teacher_id
       and am.can_access_student = true then 'OK'
      else 'WARN'
    end as status,
    'effective_uid='
      || coalesce(am.effective_uid::text, 'none')
      || '; teacher_id='
      || coalesce(am.teacher_id::text, 'none')
      || '; can_access_student='
      || case when am.can_access_student then 'true' else 'false' end
      || '; note='
      || case
           when am.effective_uid = am.teacher_id and am.can_access_student = true
             then 'synthetic auth ok'
           else 'SQL Editor synthetic auth did not satisfy access gate; verify real runtime via browser smoke'
         end
      as details
  from auth_meta am

  union all

  select
    '4',
    'teacher_picking_screen_v1 returns json object',
    case
      when (select count(*) from sample_pair) = 0 then 'WARN'
      when not (select is_ready from auth_state) then 'WARN'
      when pm.payload_type = 'object' then 'OK'
      else 'FAIL'
    end as status,
    'payload_type=' || pm.payload_type as details
  from payload_meta pm

  union all

  select
    '5',
    'payload top-level keys present',
    case
      when (select count(*) from sample_pair) = 0 then 'WARN'
      when not (select is_ready from auth_state) then 'WARN'
      when m.missing_count = 0 then 'OK'
      else 'FAIL'
    end as status,
    'missing_count=' || m.missing_count || '; missing_keys=' || m.missing_keys as details
  from missing_top_keys m

  union all

  select
    '6',
    'catalog_version matches visible catalog',
    case
      when (select count(*) from sample_pair) = 0 then 'WARN'
      when not (select is_ready from auth_state) then 'WARN'
      when cc.visible_theme_count = 0 then 'WARN'
      when pm.catalog_version = cc.expected_catalog_version then 'OK'
      else 'FAIL'
    end as status,
    'expected='
      || coalesce(cc.expected_catalog_version, '')
      || '; actual='
      || coalesce(pm.catalog_version, '')
      as details
  from payload_meta pm
  cross join catalog_counts cc

  union all

  select
    '7',
    'sections count matches visible themes',
    case
      when (select count(*) from sample_pair) = 0 then 'WARN'
      when not (select is_ready from auth_state) then 'WARN'
      when cc.visible_theme_count = 0 then 'WARN'
      when pm.section_count = cc.visible_theme_count then 'OK'
      else 'FAIL'
    end as status,
    'expected=' || cc.visible_theme_count || '; actual=' || pm.section_count as details
  from payload_meta pm
  cross join catalog_counts cc

  union all

  select
    '8',
    'topics count matches visible subtopics',
    case
      when (select count(*) from sample_pair) = 0 then 'WARN'
      when not (select is_ready from auth_state) then 'WARN'
      when cc.visible_subtopic_count = 0 then 'WARN'
      when (select count(*) from topic_rows) = cc.visible_subtopic_count then 'OK'
      else 'FAIL'
    end as status,
    'expected='
      || cc.visible_subtopic_count
      || '; actual='
      || (select count(*) from topic_rows)
      as details
  from catalog_counts cc

  union all

  select
    '9',
    'init screen block is valid',
    case
      when (select count(*) from sample_pair) = 0 then 'WARN'
      when not (select is_ready from auth_state) then 'WARN'
      when pm.screen_mode = 'init'
       and pm.can_pick = true
       and pm.source_contract = '' then 'OK'
      else 'FAIL'
    end as status,
    'mode='
      || coalesce(pm.screen_mode, '')
      || '; can_pick='
      || case when pm.can_pick then 'true' else 'false' end
      || '; source_contract='
      || case when pm.source_contract = '' then 'none' else pm.source_contract end
      as details
  from payload_meta pm

  union all

  select
    '10',
    'init picked_questions is empty',
    case
      when (select count(*) from sample_pair) = 0 then 'WARN'
      when not (select is_ready from auth_state) then 'WARN'
      when pm.picked_question_count = 0 then 'OK'
      else 'FAIL'
    end as status,
    'picked_question_count=' || pm.picked_question_count as details
  from payload_meta pm

  union all

  select
    '11',
    'recommendations reasons are valid',
    case
      when (select count(*) from sample_pair) = 0 then 'WARN'
      when not (select is_ready from auth_state) then 'WARN'
      when rs.invalid_reason_count = 0 then 'OK'
      else 'FAIL'
    end as status,
    'row_count='
      || rs.row_count
      || '; invalid_reason_count='
      || rs.invalid_reason_count
      as details
  from recommendation_reason_stats rs

  union all

  select
    '12',
    'dashboard block present',
    case
      when (select count(*) from sample_pair) = 0 then 'WARN'
      when not (select is_ready from auth_state) then 'WARN'
      when pm.dashboard_type = 'object' then 'OK'
      else 'FAIL'
    end as status,
    'dashboard_type=' || pm.dashboard_type as details
  from payload_meta pm

  union all

  select
    '13',
    'selection.normalized is an object',
    case
      when (select count(*) from sample_pair) = 0 then 'WARN'
      when not (select is_ready from auth_state) then 'WARN'
      when pm.selection_type = 'object' then 'OK'
      else 'FAIL'
    end as status,
    'selection_type=' || pm.selection_type as details
  from payload_meta pm
),
summary as (
  select
    'summary'::text as check_id,
    'Stage 3 teacher-picking init rollout smoke summary'::text as check_name,
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
order by sort_key;
