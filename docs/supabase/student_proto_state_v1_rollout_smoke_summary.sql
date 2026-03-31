-- student_proto_state_v1_rollout_smoke_summary.sql
-- Single-result-set smoke summary for student_proto_state_v1 rollout after applying:
--   1) docs/supabase/student_proto_state_v1.sql
--
-- Usage: Supabase SQL Editor.
-- All statements are SELECT-only.
-- Expected result: status = OK for all checks, or WARN only when the project has
-- no teacher-student pairs, SQL Editor synthetic auth does not satisfy the access
-- gate, or the visible catalog is empty.

with required_functions as (
  select *
  from (
    values
      ('student_proto_state_v1'::text)
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
    vs.subtopic_sort_order,
    vs.theme_sort_order
  from public.catalog_unic_dim u
  join visible_subtopics vs
    on vs.subtopic_id = u.subtopic_id
   and vs.theme_id = u.theme_id
  where coalesce(u.is_enabled, true) = true
    and coalesce(u.is_hidden, false) = false
),
catalog_counts as (
  select
    count(*)::int as visible_unic_count
  from visible_unics
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
requested_sources as (
  select *
  from (
    values
      ('all'::text),
      ('hw'::text),
      ('test'::text)
  ) v(requested_source)
),
state_all_raw as (
  select
    'all'::text as requested_source,
    s.*
  from auth_probe ap
  cross join lateral public.student_proto_state_v1(ap.student_id, 'all') s
  where ap.effective_uid = ap.teacher_id
    and ap.can_access_student = true
),
state_hw_raw as (
  select
    'hw'::text as requested_source,
    s.*
  from auth_probe ap
  cross join lateral public.student_proto_state_v1(ap.student_id, 'hw') s
  where ap.effective_uid = ap.teacher_id
    and ap.can_access_student = true
),
state_test_raw as (
  select
    'test'::text as requested_source,
    s.*
  from auth_probe ap
  cross join lateral public.student_proto_state_v1(ap.student_id, 'test') s
  where ap.effective_uid = ap.teacher_id
    and ap.can_access_student = true
),
all_states_raw as (
  select * from state_all_raw
  union all
  select * from state_hw_raw
  union all
  select * from state_test_raw
),
source_stats as (
  select
    rs.requested_source,
    coalesce(ss.row_count, 0)::int as row_count,
    coalesce(ss.distinct_unic_count, 0)::int as distinct_unic_count,
    coalesce(ss.wrong_source_count, 0)::int as wrong_source_count,
    coalesce(ss.wrong_student_count, 0)::int as wrong_student_count,
    coalesce(ss.invalid_key_count, 0)::int as invalid_key_count,
    coalesce(ss.duplicate_row_count, 0)::int as duplicate_row_count
  from requested_sources rs
  left join (
    select
      r.requested_source,
      count(*)::int as row_count,
      count(distinct r.unic_id)::int as distinct_unic_count,
      count(*) filter (where r.source <> r.requested_source)::int as wrong_source_count,
      count(*) filter (where r.student_id <> (select student_id from sample_pair))::int as wrong_student_count,
      count(*) filter (
        where r.theme_id is null
           or r.subtopic_id is null
           or r.unic_id is null
      )::int as invalid_key_count,
      (count(*) - count(distinct r.unic_id))::int as duplicate_row_count
    from all_states_raw r
    group by r.requested_source
  ) ss
    on ss.requested_source = rs.requested_source
),
formula_stats as (
  select
    count(*)::int as row_count,
    count(*) filter (
      where covered is distinct from (attempt_count_total > 0)
    )::int as covered_mismatch_count,
    count(*) filter (
      where solved is distinct from has_correct
    )::int as solved_mismatch_count,
    count(*) filter (
      where accuracy is distinct from
        case
          when attempt_count_total > 0
            then (correct_count_total::numeric / attempt_count_total::numeric)
          else null::numeric
        end
    )::int as accuracy_mismatch_count,
    count(*) filter (
      where (
        case when is_not_seen then 1 else 0 end
        + case when is_low_seen then 1 else 0 end
        + case when is_enough_seen then 1 else 0 end
      ) <> 1
    )::int as seen_partition_mismatch_count,
    count(*) filter (
      where is_not_seen is distinct from (unique_question_ids_seen = 0)
    )::int as not_seen_mismatch_count,
    count(*) filter (
      where is_low_seen is distinct from (unique_question_ids_seen = 1)
    )::int as low_seen_mismatch_count,
    count(*) filter (
      where is_enough_seen is distinct from (unique_question_ids_seen >= 2)
    )::int as enough_seen_mismatch_count,
    count(*) filter (
      where is_weak is distinct from (
        attempt_count_total >= 2
        and accuracy < 0.7
      )
    )::int as weak_mismatch_count,
    count(*) filter (
      where has_independent_correct = true
        and has_correct = false
    )::int as independent_without_correct_count,
    count(*) filter (
      where is_stale is distinct from (
        has_independent_correct = true
        and attempt_count_total >= 2
        and not (
          attempt_count_total >= 2
          and accuracy < 0.7
        )
        and last_attempt_at is not null
        and last_attempt_at < now() - interval '30 days'
      )
    )::int as stale_mismatch_count,
    count(*) filter (
      where is_unstable is distinct from (
        has_independent_correct = true
        and attempt_count_total >= 2
        and accuracy < 0.7
      )
    )::int as unstable_mismatch_count,
    count(*) filter (
      where is_stale = true
        and is_unstable = true
    )::int as stale_unstable_overlap_count
  from all_states_raw
),
checks as (
  select
    '1'::text as check_id,
    'student_proto_state_v1 exists'::text as check_name,
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
           else 'SQL Editor synthetic auth did not satisfy access gate; verify live runtime through app session'
         end
      as details
  from auth_meta am

  union all

  select
    '4',
    'all source covers visible catalog',
    case
      when (select visible_unic_count from catalog_counts) = 0 then 'WARN'
      when not (select is_ready from auth_state) then 'WARN'
      when ss.row_count = cc.visible_unic_count
       and ss.distinct_unic_count = cc.visible_unic_count then 'OK'
      else 'FAIL'
    end as status,
    'visible_unics='
      || cc.visible_unic_count
      || '; row_count='
      || ss.row_count
      || '; distinct_unics='
      || ss.distinct_unic_count
      as details
  from source_stats ss
  cross join catalog_counts cc
  where ss.requested_source = 'all'

  union all

  select
    '5',
    'hw source covers visible catalog',
    case
      when (select visible_unic_count from catalog_counts) = 0 then 'WARN'
      when not (select is_ready from auth_state) then 'WARN'
      when ss.row_count = cc.visible_unic_count
       and ss.distinct_unic_count = cc.visible_unic_count then 'OK'
      else 'FAIL'
    end as status,
    'visible_unics='
      || cc.visible_unic_count
      || '; row_count='
      || ss.row_count
      || '; distinct_unics='
      || ss.distinct_unic_count
      as details
  from source_stats ss
  cross join catalog_counts cc
  where ss.requested_source = 'hw'

  union all

  select
    '6',
    'test source covers visible catalog',
    case
      when (select visible_unic_count from catalog_counts) = 0 then 'WARN'
      when not (select is_ready from auth_state) then 'WARN'
      when ss.row_count = cc.visible_unic_count
       and ss.distinct_unic_count = cc.visible_unic_count then 'OK'
      else 'FAIL'
    end as status,
    'visible_unics='
      || cc.visible_unic_count
      || '; row_count='
      || ss.row_count
      || '; distinct_unics='
      || ss.distinct_unic_count
      as details
  from source_stats ss
  cross join catalog_counts cc
  where ss.requested_source = 'test'

  union all

  select
    '7',
    'identity and source columns are consistent',
    case
      when (select visible_unic_count from catalog_counts) = 0 then 'WARN'
      when not (select is_ready from auth_state) then 'WARN'
      when sum(ss.wrong_source_count + ss.wrong_student_count + ss.invalid_key_count + ss.duplicate_row_count) = 0 then 'OK'
      else 'FAIL'
    end as status,
    'wrong_source='
      || sum(ss.wrong_source_count)
      || '; wrong_student='
      || sum(ss.wrong_student_count)
      || '; invalid_keys='
      || sum(ss.invalid_key_count)
      || '; duplicate_rows='
      || sum(ss.duplicate_row_count)
      as details
  from source_stats ss

  union all

  select
    '8',
    'seen-state partition is valid',
    case
      when (select visible_unic_count from catalog_counts) = 0 then 'WARN'
      when not (select is_ready from auth_state) then 'WARN'
      when fs.seen_partition_mismatch_count = 0
       and fs.not_seen_mismatch_count = 0
       and fs.low_seen_mismatch_count = 0
       and fs.enough_seen_mismatch_count = 0 then 'OK'
      else 'FAIL'
    end as status,
    'partition_mismatch='
      || fs.seen_partition_mismatch_count
      || '; not_seen_mismatch='
      || fs.not_seen_mismatch_count
      || '; low_seen_mismatch='
      || fs.low_seen_mismatch_count
      || '; enough_seen_mismatch='
      || fs.enough_seen_mismatch_count
      as details
  from formula_stats fs

  union all

  select
    '9',
    'covered solved and accuracy formulas are valid',
    case
      when (select visible_unic_count from catalog_counts) = 0 then 'WARN'
      when not (select is_ready from auth_state) then 'WARN'
      when fs.covered_mismatch_count = 0
       and fs.solved_mismatch_count = 0
       and fs.accuracy_mismatch_count = 0 then 'OK'
      else 'FAIL'
    end as status,
    'covered_mismatch='
      || fs.covered_mismatch_count
      || '; solved_mismatch='
      || fs.solved_mismatch_count
      || '; accuracy_mismatch='
      || fs.accuracy_mismatch_count
      as details
  from formula_stats fs

  union all

  select
    '10',
    'weak stale and unstable formulas are valid',
    case
      when (select visible_unic_count from catalog_counts) = 0 then 'WARN'
      when not (select is_ready from auth_state) then 'WARN'
      when fs.weak_mismatch_count = 0
       and fs.stale_mismatch_count = 0
       and fs.unstable_mismatch_count = 0 then 'OK'
      else 'FAIL'
    end as status,
    'weak_mismatch='
      || fs.weak_mismatch_count
      || '; stale_mismatch='
      || fs.stale_mismatch_count
      || '; unstable_mismatch='
      || fs.unstable_mismatch_count
      as details
  from formula_stats fs

  union all

  select
    '11',
    'stale and unstable are mutually exclusive',
    case
      when (select visible_unic_count from catalog_counts) = 0 then 'WARN'
      when not (select is_ready from auth_state) then 'WARN'
      when fs.stale_unstable_overlap_count = 0 then 'OK'
      else 'FAIL'
    end as status,
    'overlap_count=' || fs.stale_unstable_overlap_count as details
  from formula_stats fs

  union all

  select
    '12',
    'independent success implies correct',
    case
      when (select visible_unic_count from catalog_counts) = 0 then 'WARN'
      when not (select is_ready from auth_state) then 'WARN'
      when fs.independent_without_correct_count = 0 then 'OK'
      else 'FAIL'
    end as status,
    'independent_without_correct=' || fs.independent_without_correct_count as details
  from formula_stats fs
),
summary as (
  select
    'summary'::text as check_id,
    'student_proto_state_v1 rollout smoke summary'::text as check_name,
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
