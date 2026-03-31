-- student_analytics_screen_v1_rollout_smoke_summary.sql
-- Single-result-set smoke summary for student_analytics_screen_v1 rollout after applying:
--   1) docs/supabase/student_analytics_screen_v1.sql
--
-- Usage: Supabase SQL Editor.
-- All statements are SELECT-only.
-- Expected result: status = OK for all checks, or WARN only when the project has
-- no teacher-student pairs, SQL Editor synthetic auth does not satisfy the access
-- gate, or the visible catalog has no themes/subtopics.

with required_functions as (
  select *
  from (
    values
      ('student_analytics_screen_v1'::text),
      ('student_dashboard_for_teacher_v2'::text),
      ('subtopic_coverage_for_teacher_v1'::text),
      ('student_topic_state_v1'::text)
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
    t.title,
    t.sort_order
  from public.catalog_theme_dim t
  where coalesce(t.is_enabled, true) = true
    and coalesce(t.is_hidden, false) = false
),
visible_subtopics as (
  select
    s.subtopic_id,
    s.theme_id,
    s.title,
    s.sort_order,
    vt.sort_order as theme_sort_order
  from public.catalog_subtopic_dim s
  join visible_themes vt
    on vt.theme_id = s.theme_id
  where coalesce(s.is_enabled, true) = true
    and coalesce(s.is_hidden, false) = false
),
catalog_counts as (
  select
    (select count(*)::int from visible_themes) as visible_theme_count,
    (select count(*)::int from visible_subtopics) as visible_topic_count
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
screen_raw as (
  select
    public.student_analytics_screen_v1(
      'teacher',
      ap.student_id,
      30,
      'all',
      'init'
    ) as payload
  from auth_probe ap
  where ap.effective_uid = ap.teacher_id
    and ap.can_access_student = true
),
screen_one as (
  select payload
  from screen_raw

  union all

  select null::jsonb as payload
  where not exists (select 1 from screen_raw)

  limit 1
),
screen_shape as (
  select
    case
      when so.payload is null then 'null'
      else jsonb_typeof(so.payload)
    end as payload_type,
    coalesce(
      string_agg(req.key, ', ' order by req.key)
        filter (where so.payload is null or not (so.payload ? req.key)),
      'none'
    ) as missing_keys,
    coalesce(so.payload #>> '{screen,mode}', '') as screen_mode,
    case
      when so.payload is not null then jsonb_typeof(so.payload->'sections')
      else null
    end as sections_type,
    case
      when so.payload is not null then jsonb_typeof(so.payload->'topics')
      else null
    end as topics_type,
    case
      when so.payload is not null then jsonb_typeof(so.payload->'variant12')
      else null
    end as variant12_type,
    case
      when so.payload is not null then jsonb_typeof(so.payload->'recommendations')
      else null
    end as recommendations_type,
    case
      when so.payload is not null then jsonb_typeof(so.payload->'warnings')
      else null
    end as warnings_type
  from screen_one so
  cross join (
    values
      ('student'::text),
      ('catalog_version'::text),
      ('screen'::text),
      ('overall'::text),
      ('sections'::text),
      ('topics'::text),
      ('variant12'::text),
      ('recommendations'::text),
      ('warnings'::text),
      ('generated_at'::text)
  ) req(key)
  group by
    so.payload
),
student_block as (
  select
    nullif(so.payload #>> '{student,student_id}', '') as student_id_text,
    nullif(so.payload #>> '{student,viewer_scope}', '') as viewer_scope,
    nullif(so.payload #>> '{student,source}', '') as source_name,
    case
      when coalesce(so.payload #>> '{student,days}', '') ~ '^-?[0-9]+$'
        then (so.payload #>> '{student,days}')::int
      else null::int
    end as days,
    nullif(so.payload #>> '{student,display_name}', '') as display_name,
    nullif(so.payload #>> '{student,last_seen_at}', '') as last_seen_at
  from screen_one so
),
overall_block as (
  select
    case when so.payload is not null then jsonb_typeof(so.payload->'overall') else null end as overall_type,
    nullif(so.payload #>> '{overall,last_seen_at}', '') as last_seen_at,
    case when coalesce(so.payload #>> '{overall,last3,total}', '') ~ '^-?[0-9]+$' then (so.payload #>> '{overall,last3,total}')::int else null::int end as last3_total,
    case when coalesce(so.payload #>> '{overall,last3,correct}', '') ~ '^-?[0-9]+$' then (so.payload #>> '{overall,last3,correct}')::int else null::int end as last3_correct,
    case when coalesce(so.payload #>> '{overall,last10,total}', '') ~ '^-?[0-9]+$' then (so.payload #>> '{overall,last10,total}')::int else null::int end as last10_total,
    case when coalesce(so.payload #>> '{overall,last10,correct}', '') ~ '^-?[0-9]+$' then (so.payload #>> '{overall,last10,correct}')::int else null::int end as last10_correct,
    case when coalesce(so.payload #>> '{overall,period,total}', '') ~ '^-?[0-9]+$' then (so.payload #>> '{overall,period,total}')::int else null::int end as period_total,
    case when coalesce(so.payload #>> '{overall,period,correct}', '') ~ '^-?[0-9]+$' then (so.payload #>> '{overall,period,correct}')::int else null::int end as period_correct,
    case when coalesce(so.payload #>> '{overall,all_time,total}', '') ~ '^-?[0-9]+$' then (so.payload #>> '{overall,all_time,total}')::int else null::int end as all_total,
    case when coalesce(so.payload #>> '{overall,all_time,correct}', '') ~ '^-?[0-9]+$' then (so.payload #>> '{overall,all_time,correct}')::int else null::int end as all_correct
  from screen_one so
),
sections_rows as (
  select
    nullif(trim(x.value->>'theme_id'), '') as theme_id,
    nullif(trim(x.value->>'section_id'), '') as section_id,
    nullif(trim(x.value->>'title'), '') as title,
    nullif(trim(x.value->>'last_seen_at'), '') as last_seen_at,
    case when coalesce(x.value #>> '{last10,total}', '') ~ '^-?[0-9]+$' then (x.value #>> '{last10,total}')::int else null::int end as last10_total,
    case when coalesce(x.value #>> '{last10,correct}', '') ~ '^-?[0-9]+$' then (x.value #>> '{last10,correct}')::int else null::int end as last10_correct,
    case when coalesce(x.value #>> '{period,total}', '') ~ '^-?[0-9]+$' then (x.value #>> '{period,total}')::int else null::int end as period_total,
    case when coalesce(x.value #>> '{period,correct}', '') ~ '^-?[0-9]+$' then (x.value #>> '{period,correct}')::int else null::int end as period_correct,
    case when coalesce(x.value #>> '{all_time,total}', '') ~ '^-?[0-9]+$' then (x.value #>> '{all_time,total}')::int else null::int end as all_total,
    case when coalesce(x.value #>> '{all_time,correct}', '') ~ '^-?[0-9]+$' then (x.value #>> '{all_time,correct}')::int else null::int end as all_correct,
    case when coalesce(x.value #>> '{coverage,unics_attempted}', '') ~ '^-?[0-9]+$' then (x.value #>> '{coverage,unics_attempted}')::int else null::int end as unics_attempted,
    case when coalesce(x.value #>> '{coverage,unics_total}', '') ~ '^-?[0-9]+$' then (x.value #>> '{coverage,unics_total}')::int else null::int end as unics_total,
    case when coalesce(x.value #>> '{coverage,pct}', '') ~ '^-?[0-9]+$' then (x.value #>> '{coverage,pct}')::int else null::int end as coverage_pct
  from screen_one so
  cross join lateral jsonb_array_elements(
    case
      when so.payload is not null and jsonb_typeof(so.payload->'sections') = 'array' then so.payload->'sections'
      else '[]'::jsonb
    end
  ) as x(value)
),
topics_rows as (
  select
    nullif(trim(x.value->>'theme_id'), '') as theme_id,
    nullif(trim(x.value->>'section_id'), '') as section_id,
    nullif(trim(x.value->>'subtopic_id'), '') as subtopic_id,
    nullif(trim(x.value->>'topic_id'), '') as topic_id,
    nullif(trim(x.value->>'title'), '') as title,
    case when coalesce(x.value->>'topic_order', '') ~ '^-?[0-9]+$' then (x.value->>'topic_order')::int else null::int end as topic_order,
    nullif(trim(x.value->>'last_seen_at'), '') as last_seen_at,
    case when coalesce(x.value #>> '{last3,total}', '') ~ '^-?[0-9]+$' then (x.value #>> '{last3,total}')::int else null::int end as last3_total,
    case when coalesce(x.value #>> '{last3,correct}', '') ~ '^-?[0-9]+$' then (x.value #>> '{last3,correct}')::int else null::int end as last3_correct,
    case when coalesce(x.value #>> '{last10,total}', '') ~ '^-?[0-9]+$' then (x.value #>> '{last10,total}')::int else null::int end as last10_total,
    case when coalesce(x.value #>> '{last10,correct}', '') ~ '^-?[0-9]+$' then (x.value #>> '{last10,correct}')::int else null::int end as last10_correct,
    case when coalesce(x.value #>> '{period,total}', '') ~ '^-?[0-9]+$' then (x.value #>> '{period,total}')::int else null::int end as period_total,
    case when coalesce(x.value #>> '{period,correct}', '') ~ '^-?[0-9]+$' then (x.value #>> '{period,correct}')::int else null::int end as period_correct,
    case when coalesce(x.value #>> '{all_time,total}', '') ~ '^-?[0-9]+$' then (x.value #>> '{all_time,total}')::int else null::int end as all_total,
    case when coalesce(x.value #>> '{all_time,correct}', '') ~ '^-?[0-9]+$' then (x.value #>> '{all_time,correct}')::int else null::int end as all_time_correct,
    case when coalesce(x.value #>> '{coverage,unics_attempted}', '') ~ '^-?[0-9]+$' then (x.value #>> '{coverage,unics_attempted}')::int else null::int end as unics_attempted,
    case when coalesce(x.value #>> '{coverage,unics_total}', '') ~ '^-?[0-9]+$' then (x.value #>> '{coverage,unics_total}')::int else null::int end as unics_total,
    case when coalesce(x.value #>> '{coverage,pct}', '') ~ '^-?[0-9]+$' then (x.value #>> '{coverage,pct}')::int else null::int end as coverage_pct,
    nullif(trim(x.value #>> '{derived,coverage_state}'), '') as coverage_state,
    nullif(trim(x.value #>> '{derived,sample_state}'), '') as sample_state,
    nullif(trim(x.value #>> '{derived,performance_state}'), '') as performance_state,
    nullif(trim(x.value #>> '{derived,freshness_state}'), '') as freshness_state
  from screen_one so
  cross join lateral jsonb_array_elements(
    case
      when so.payload is not null and jsonb_typeof(so.payload->'topics') = 'array' then so.payload->'topics'
      else '[]'::jsonb
    end
  ) as x(value)
),
topics_stats as (
  select
    count(*)::int as row_count,
    count(distinct subtopic_id)::int as distinct_topic_count,
    count(*) filter (where theme_id is null or subtopic_id is null or title is null) as invalid_key_count,
    count(*) filter (
      where (
        case when coalesce(unics_total, 0) > 0 and coverage_pct is not distinct from round((coalesce(unics_attempted, 0)::numeric * 100.0) / unics_total::numeric)::int then 0
        when coalesce(unics_total, 0) = 0 and coverage_pct is null then 0
        else 1
        end
      ) = 1
    )::int as coverage_pct_mismatch_count,
    count(*) filter (
      where coverage_state not in ('covered', 'uncovered')
         or sample_state not in ('none', 'low', 'enough')
         or performance_state not in ('weak', 'stable')
         or freshness_state not in ('fresh', 'stale')
    )::int as invalid_derived_count,
    count(*) filter (
      where coverage_state is distinct from
        case when coalesce(unics_attempted, 0) > 0 then 'covered' else 'uncovered' end
    )::int as coverage_state_mismatch_count,
    count(*) filter (
      where sample_state is distinct from
        case
          when coalesce(unics_attempted, 0) = 0 then 'none'
          when coalesce(unics_attempted, 0) < 3 then 'low'
          else 'enough'
        end
    )::int as sample_state_mismatch_count,
    count(*) filter (
      where performance_state is distinct from
        case
          when coalesce(all_total, 0) >= 2
           and ((all_time_correct::numeric / nullif(all_total, 0)::numeric) < 0.7) then 'weak'
          else 'stable'
        end
    )::int as performance_state_mismatch_count
  from topics_rows
),
sections_stats as (
  select
    count(*)::int as row_count,
    count(distinct theme_id)::int as distinct_theme_count,
    count(*) filter (where theme_id is null or title is null) as invalid_key_count,
    count(*) filter (
      where (
        case when coalesce(unics_total, 0) > 0 and coverage_pct is not distinct from round((coalesce(unics_attempted, 0)::numeric * 100.0) / unics_total::numeric)::int then 0
        when coalesce(unics_total, 0) = 0 and coverage_pct is null then 0
        else 1
        end
      ) = 1
    )::int as coverage_pct_mismatch_count
  from sections_rows
),
legacy_dashboard_raw as (
  select
    public.student_dashboard_for_teacher_v2(ap.student_id, 30, 'all') as payload
  from auth_probe ap
  where ap.effective_uid = ap.teacher_id
    and ap.can_access_student = true
),
legacy_dashboard_topics as (
  select
    nullif(trim(x.value->>'topic_id'), '') as topic_id,
    case when coalesce(x.value #>> '{last3,total}', '') ~ '^-?[0-9]+$' then (x.value #>> '{last3,total}')::int else null::int end as last3_total,
    case when coalesce(x.value #>> '{last3,correct}', '') ~ '^-?[0-9]+$' then (x.value #>> '{last3,correct}')::int else null::int end as last3_correct,
    case when coalesce(x.value #>> '{last10,total}', '') ~ '^-?[0-9]+$' then (x.value #>> '{last10,total}')::int else null::int end as last10_total,
    case when coalesce(x.value #>> '{last10,correct}', '') ~ '^-?[0-9]+$' then (x.value #>> '{last10,correct}')::int else null::int end as last10_correct,
    case when coalesce(x.value #>> '{period,total}', '') ~ '^-?[0-9]+$' then (x.value #>> '{period,total}')::int else null::int end as period_total,
    case when coalesce(x.value #>> '{period,correct}', '') ~ '^-?[0-9]+$' then (x.value #>> '{period,correct}')::int else null::int end as period_correct,
    case when coalesce(x.value #>> '{all_time,total}', '') ~ '^-?[0-9]+$' then (x.value #>> '{all_time,total}')::int else null::int end as all_total,
    case when coalesce(x.value #>> '{all_time,correct}', '') ~ '^-?[0-9]+$' then (x.value #>> '{all_time,correct}')::int else null::int end as all_correct
  from legacy_dashboard_raw lr
  cross join lateral jsonb_array_elements(
    case
      when lr.payload is not null and jsonb_typeof(lr.payload->'topics') = 'array' then lr.payload->'topics'
      else '[]'::jsonb
    end
  ) as x(value)
),
legacy_dashboard_compare as (
  select
    count(*)::int as legacy_topic_count,
    count(*) filter (where tr.topic_id is null)::int as missing_topic_rows,
    count(*) filter (
      where tr.topic_id is not null
        and (
          tr.last3_total is distinct from lt.last3_total
          or tr.last3_correct is distinct from lt.last3_correct
          or tr.last10_total is distinct from lt.last10_total
          or tr.last10_correct is distinct from lt.last10_correct
          or tr.period_total is distinct from lt.period_total
          or tr.period_correct is distinct from lt.period_correct
          or tr.all_total is distinct from lt.all_total
          or tr.all_time_correct is distinct from lt.all_correct
        )
    )::int as metric_mismatch_count
  from legacy_dashboard_topics lt
  left join topics_rows tr
    on tr.topic_id = lt.topic_id
),
legacy_coverage_raw as (
  select
    *
  from auth_probe ap
  cross join lateral public.subtopic_coverage_for_teacher_v1(ap.student_id, null::text[]) c
  where ap.effective_uid = ap.teacher_id
    and ap.can_access_student = true
),
legacy_coverage_compare as (
  select
    count(*)::int as legacy_coverage_row_count,
    count(*) filter (where tr.subtopic_id is null)::int as missing_topic_rows,
    count(*) filter (
      where tr.subtopic_id is not null
        and (
          tr.unics_total is distinct from lc.unics_total
          or tr.unics_attempted is distinct from lc.unics_attempted
        )
    )::int as coverage_mismatch_count
  from legacy_coverage_raw lc
  left join topics_rows tr
    on tr.subtopic_id = lc.subtopic_id
),
variant12_uncovered_rows as (
  select
    nullif(trim(x.value->>'theme_id'), '') as theme_id,
    nullif(trim(x.value->>'subtopic_id'), '') as subtopic_id,
    coalesce(x.value->>'picked_fallback', 'false')::boolean as picked_fallback
  from screen_one so
  cross join lateral jsonb_array_elements(
    case
      when so.payload is not null and jsonb_typeof(so.payload #> '{variant12,uncovered,rows}') = 'array'
        then so.payload #> '{variant12,uncovered,rows}'
      else '[]'::jsonb
    end
  ) as x(value)
),
variant12_worst3_rows as (
  select
    nullif(trim(x.value->>'theme_id'), '') as theme_id,
    nullif(trim(x.value->>'subtopic_id'), '') as subtopic_id,
    coalesce(x.value->>'picked_fallback', 'false')::boolean as picked_fallback,
    case when coalesce(x.value #>> '{meta,last3_total}', '') ~ '^-?[0-9]+$' then (x.value #>> '{meta,last3_total}')::int else null::int end as last3_total
  from screen_one so
  cross join lateral jsonb_array_elements(
    case
      when so.payload is not null and jsonb_typeof(so.payload #> '{variant12,worst3,rows}') = 'array'
        then so.payload #> '{variant12,worst3,rows}'
      else '[]'::jsonb
    end
  ) as x(value)
),
variant12_issue_counts as (
  select
    case
      when so.payload is not null and jsonb_typeof(so.payload #> '{variant12,uncovered,issues}') = 'array'
        then jsonb_array_length(so.payload #> '{variant12,uncovered,issues}')
      else 0
    end as uncovered_issue_count,
    case
      when so.payload is not null and jsonb_typeof(so.payload #> '{variant12,worst3,issues}') = 'array'
        then jsonb_array_length(so.payload #> '{variant12,worst3,issues}')
      else 0
    end as worst3_issue_count
  from screen_one so
),
variant12_uncovered_stats as (
  select
    count(*)::int as row_count,
    count(distinct theme_id)::int as distinct_theme_count,
    count(*) filter (where theme_id is null or subtopic_id is null)::int as invalid_key_count,
    count(*) filter (
      where not exists (
        select 1
        from visible_themes vt
        where vt.theme_id = vur.theme_id
      )
    )::int as non_visible_theme_count
  from variant12_uncovered_rows vur
),
variant12_worst3_stats as (
  select
    count(*)::int as row_count,
    count(distinct theme_id)::int as distinct_theme_count,
    count(*) filter (where theme_id is null or subtopic_id is null)::int as invalid_key_count,
    count(*) filter (
      where picked_fallback = false
        and coalesce(last3_total, 0) <= 0
    )::int as invalid_nonfallback_last3_count,
    count(*) filter (
      where not exists (
        select 1
        from visible_themes vt
        where vt.theme_id = vwr.theme_id
      )
    )::int as non_visible_theme_count
  from variant12_worst3_rows vwr
),
checks as (
  select
    '1'::text as check_id,
    'student_analytics_screen_v1 and dependencies exist'::text as check_name,
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
    case when count(*) = 1 then 'OK' else 'WARN' end as status,
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
           else 'SQL Editor synthetic auth did not satisfy access gate; verify live runtime through app session'
         end
      as details
  from auth_meta am

  union all

  select
    '4',
    'init payload top-level shape',
    case
      when not (select is_ready from auth_state) then 'WARN'
      when ss.payload_type = 'object'
       and ss.missing_keys = 'none'
       and ss.screen_mode = 'init'
       and ss.sections_type = 'array'
       and ss.topics_type = 'array'
       and ss.variant12_type = 'object'
       and ss.recommendations_type = 'array'
       and ss.warnings_type = 'array' then 'OK'
      else 'FAIL'
    end as status,
    'payload_type='
      || coalesce(ss.payload_type, 'null')
      || '; screen_mode='
      || coalesce(ss.screen_mode, '')
      || '; missing_keys='
      || ss.missing_keys
      || '; sections_type='
      || coalesce(ss.sections_type, 'null')
      || '; topics_type='
      || coalesce(ss.topics_type, 'null')
      || '; variant12_type='
      || coalesce(ss.variant12_type, 'null')
      as details
  from screen_shape ss

  union all

  select
    '5',
    'student and screen blocks are valid',
    case
      when not (select is_ready from auth_state) then 'WARN'
      when sb.student_id_text = (select student_id::text from sample_pair)
       and sb.viewer_scope = 'teacher'
       and sb.source_name = 'all'
       and sb.days = 30
       and coalesce(sb.display_name, '') <> ''
       and (select screen_mode from screen_shape) = 'init'
       and coalesce((select payload #>> '{screen,supports,variant12}' from screen_one), 'false') = 'true' then 'OK'
      else 'FAIL'
    end as status,
    'student_id='
      || coalesce(sb.student_id_text, 'null')
      || '; viewer_scope='
      || coalesce(sb.viewer_scope, 'null')
      || '; source='
      || coalesce(sb.source_name, 'null')
      || '; days='
      || coalesce(sb.days::text, 'null')
      || '; display_name='
      || case when coalesce(sb.display_name, '') <> '' then 'present' else 'missing' end
      as details
  from student_block sb

  union all

  select
    '6',
    'sections and topics cover visible analytics catalog',
    case
      when cc.visible_theme_count = 0 or cc.visible_topic_count = 0 then 'WARN'
      when not (select is_ready from auth_state) then 'WARN'
      when ss.row_count = cc.visible_theme_count
       and ss.distinct_theme_count = cc.visible_theme_count
       and ts.row_count = cc.visible_topic_count
       and ts.distinct_topic_count = cc.visible_topic_count then 'OK'
      else 'FAIL'
    end as status,
    'visible_sections='
      || cc.visible_theme_count
      || '; section_rows='
      || ss.row_count
      || '; visible_topics='
      || cc.visible_topic_count
      || '; topic_rows='
      || ts.row_count
      as details
  from catalog_counts cc
  cross join sections_stats ss
  cross join topics_stats ts

  union all

  select
    '7',
    'overall block is valid',
    case
      when not (select is_ready from auth_state) then 'WARN'
      when ob.overall_type = 'object'
       and coalesce(ob.last3_total, 0) >= 0
       and coalesce(ob.last3_correct, 0) >= 0
       and coalesce(ob.last10_total, 0) >= 0
       and coalesce(ob.last10_correct, 0) >= 0
       and coalesce(ob.period_total, 0) >= 0
       and coalesce(ob.period_correct, 0) >= 0
       and coalesce(ob.all_total, 0) >= 0
       and coalesce(ob.all_correct, 0) >= 0 then 'OK'
      else 'FAIL'
    end as status,
    'overall_type='
      || coalesce(ob.overall_type, 'null')
      || '; last3='
      || coalesce(ob.last3_correct::text, 'null')
      || '/'
      || coalesce(ob.last3_total::text, 'null')
      || '; last10='
      || coalesce(ob.last10_correct::text, 'null')
      || '/'
      || coalesce(ob.last10_total::text, 'null')
      || '; period='
      || coalesce(ob.period_correct::text, 'null')
      || '/'
      || coalesce(ob.period_total::text, 'null')
      || '; all='
      || coalesce(ob.all_correct::text, 'null')
      || '/'
      || coalesce(ob.all_total::text, 'null')
      as details
  from overall_block ob

  union all

  select
    '8',
    'section and topic block integrity',
    case
      when not (select is_ready from auth_state) then 'WARN'
      when ss.invalid_key_count = 0
       and ss.coverage_pct_mismatch_count = 0
       and ts.invalid_key_count = 0
       and ts.coverage_pct_mismatch_count = 0
       and ts.invalid_derived_count = 0
       and ts.coverage_state_mismatch_count = 0
       and ts.sample_state_mismatch_count = 0
       and ts.performance_state_mismatch_count = 0 then 'OK'
      else 'FAIL'
    end as status,
    'section_invalid='
      || ss.invalid_key_count
      || '; section_cov_mismatch='
      || ss.coverage_pct_mismatch_count
      || '; topic_invalid='
      || ts.invalid_key_count
      || '; topic_cov_mismatch='
      || ts.coverage_pct_mismatch_count
      || '; invalid_derived='
      || ts.invalid_derived_count
      as details
  from sections_stats ss
  cross join topics_stats ts

  union all

  select
    '9',
    'screen topics match legacy dashboard for attempted topics',
    case
      when not (select is_ready from auth_state) then 'WARN'
      when ldc.legacy_topic_count = 0 then 'WARN'
      when ldc.missing_topic_rows = 0
       and ldc.metric_mismatch_count = 0 then 'OK'
      else 'FAIL'
    end as status,
    'legacy_topics='
      || ldc.legacy_topic_count
      || '; missing_topic_rows='
      || ldc.missing_topic_rows
      || '; metric_mismatches='
      || ldc.metric_mismatch_count
      as details
  from legacy_dashboard_compare ldc

  union all

  select
    '10',
    'screen coverage matches legacy coverage rpc',
    case
      when not (select is_ready from auth_state) then 'WARN'
      when lcc.legacy_coverage_row_count = 0 then 'WARN'
      when lcc.missing_topic_rows = 0
       and lcc.coverage_mismatch_count = 0 then 'OK'
      else 'FAIL'
    end as status,
    'legacy_coverage_rows='
      || lcc.legacy_coverage_row_count
      || '; missing_topic_rows='
      || lcc.missing_topic_rows
      || '; coverage_mismatches='
      || lcc.coverage_mismatch_count
      as details
  from legacy_coverage_compare lcc

  union all

  select
    '11',
    'variant12 uncovered block is valid',
    case
      when not (select is_ready from auth_state) then 'WARN'
      when vus.invalid_key_count = 0
       and vus.non_visible_theme_count = 0
       and vus.row_count = vus.distinct_theme_count
       and (vus.row_count + vic.uncovered_issue_count) = cc.visible_theme_count then 'OK'
      else 'FAIL'
    end as status,
    'rows='
      || vus.row_count
      || '; issues='
      || vic.uncovered_issue_count
      || '; visible_sections='
      || cc.visible_theme_count
      || '; invalid_rows='
      || vus.invalid_key_count
      as details
  from variant12_uncovered_stats vus
  cross join variant12_issue_counts vic
  cross join catalog_counts cc

  union all

  select
    '12',
    'variant12 worst3 block is valid',
    case
      when not (select is_ready from auth_state) then 'WARN'
      when vws.invalid_key_count = 0
       and vws.non_visible_theme_count = 0
       and vws.invalid_nonfallback_last3_count = 0
       and vws.row_count = vws.distinct_theme_count
       and (vws.row_count + vic.worst3_issue_count) = cc.visible_theme_count then 'OK'
      else 'FAIL'
    end as status,
    'rows='
      || vws.row_count
      || '; issues='
      || vic.worst3_issue_count
      || '; visible_sections='
      || cc.visible_theme_count
      || '; invalid_nonfallback_last3='
      || vws.invalid_nonfallback_last3_count
      as details
  from variant12_worst3_stats vws
  cross join variant12_issue_counts vic
  cross join catalog_counts cc
),
summary as (
  select
    'summary'::text as check_id,
    'student_analytics_screen_v1 rollout smoke summary'::text as check_name,
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
)
select *
from (
  select * from checks
  union all
  select * from summary
) q
order by
  case when q.check_id = 'summary' then 999 else q.check_id::int end;
