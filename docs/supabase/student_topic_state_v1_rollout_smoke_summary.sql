-- student_topic_state_v1_rollout_smoke_summary.sql
-- Single-result-set smoke summary for student_topic_state_v1 rollout after applying:
--   1) docs/supabase/student_proto_state_v1.sql
--   2) docs/supabase/student_topic_state_v1.sql
--
-- Usage: Supabase SQL Editor.
-- All statements are SELECT-only.
-- Expected result: status = OK for all checks, or WARN only when the project has
-- no teacher-student pairs, SQL Editor synthetic auth does not satisfy the access
-- gate, or the visible topic catalog is empty.

with required_functions as (
  select *
  from (
    values
      ('student_proto_state_v1'::text),
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
    u.theme_id
  from public.catalog_unic_dim u
  join visible_subtopics vs
    on vs.subtopic_id = u.subtopic_id
   and vs.theme_id = u.theme_id
  where coalesce(u.is_enabled, true) = true
    and coalesce(u.is_hidden, false) = false
),
visible_topics as (
  select distinct
    vs.theme_id,
    vs.subtopic_id
  from visible_subtopics vs
  join visible_unics vu
    on vu.subtopic_id = vs.subtopic_id
   and vu.theme_id = vs.theme_id
),
catalog_counts as (
  select
    count(*)::int as visible_topic_count
  from visible_topics
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
proto_all_raw as (
  select
    'all'::text as requested_source,
    s.*
  from auth_probe ap
  cross join lateral public.student_proto_state_v1(ap.student_id, 'all') s
  where ap.effective_uid = ap.teacher_id
    and ap.can_access_student = true
),
proto_hw_raw as (
  select
    'hw'::text as requested_source,
    s.*
  from auth_probe ap
  cross join lateral public.student_proto_state_v1(ap.student_id, 'hw') s
  where ap.effective_uid = ap.teacher_id
    and ap.can_access_student = true
),
proto_test_raw as (
  select
    'test'::text as requested_source,
    s.*
  from auth_probe ap
  cross join lateral public.student_proto_state_v1(ap.student_id, 'test') s
  where ap.effective_uid = ap.teacher_id
    and ap.can_access_student = true
),
all_proto_raw as (
  select * from proto_all_raw
  union all
  select * from proto_hw_raw
  union all
  select * from proto_test_raw
),
topic_all_raw as (
  select
    'all'::text as requested_source,
    s.*
  from auth_probe ap
  cross join lateral public.student_topic_state_v1(ap.student_id, 'all') s
  where ap.effective_uid = ap.teacher_id
    and ap.can_access_student = true
),
topic_hw_raw as (
  select
    'hw'::text as requested_source,
    s.*
  from auth_probe ap
  cross join lateral public.student_topic_state_v1(ap.student_id, 'hw') s
  where ap.effective_uid = ap.teacher_id
    and ap.can_access_student = true
),
topic_test_raw as (
  select
    'test'::text as requested_source,
    s.*
  from auth_probe ap
  cross join lateral public.student_topic_state_v1(ap.student_id, 'test') s
  where ap.effective_uid = ap.teacher_id
    and ap.can_access_student = true
),
all_topic_raw as (
  select * from topic_all_raw
  union all
  select * from topic_hw_raw
  union all
  select * from topic_test_raw
),
source_stats as (
  select
    rs.requested_source,
    coalesce(ss.row_count, 0)::int as row_count,
    coalesce(ss.distinct_topic_count, 0)::int as distinct_topic_count,
    coalesce(ss.wrong_source_count, 0)::int as wrong_source_count,
    coalesce(ss.wrong_student_count, 0)::int as wrong_student_count,
    coalesce(ss.invalid_key_count, 0)::int as invalid_key_count,
    coalesce(ss.duplicate_row_count, 0)::int as duplicate_row_count
  from requested_sources rs
  left join (
    select
      r.requested_source,
      count(*)::int as row_count,
      count(distinct r.subtopic_id)::int as distinct_topic_count,
      count(*) filter (where r.source <> r.requested_source)::int as wrong_source_count,
      count(*) filter (where r.student_id <> (select student_id from sample_pair))::int as wrong_student_count,
      count(*) filter (
        where r.theme_id is null
           or r.subtopic_id is null
      )::int as invalid_key_count,
      (count(*) - count(distinct r.subtopic_id))::int as duplicate_row_count
    from all_topic_raw r
    group by r.requested_source
  ) ss
    on ss.requested_source = rs.requested_source
),
topic_formula_stats as (
  select
    count(*)::int as row_count,
    count(*) filter (
      where accuracy is distinct from
        case
          when attempt_count_total > 0
            then (correct_count_total::numeric / attempt_count_total::numeric)
          else null::numeric
        end
    )::int as accuracy_mismatch_count,
    count(*) filter (
      where mastered_accuracy is distinct from
        case
          when mastered_attempt_count_total > 0
            then (mastered_correct_count_total::numeric / mastered_attempt_count_total::numeric)
          else null::numeric
        end
    )::int as mastered_accuracy_mismatch_count,
    count(*) filter (
      where (
        case when is_not_seen then 1 else 0 end
        + case when is_low_seen then 1 else 0 end
        + case when is_enough_seen then 1 else 0 end
      ) <> 1
    )::int as seen_partition_mismatch_count,
    count(*) filter (
      where visible_proto_count <> (not_seen_proto_count + low_seen_proto_count + enough_seen_proto_count)
    )::int as visible_count_partition_mismatch_count,
    count(*) filter (
      where covered_proto_count <> unique_proto_seen_count
    )::int as covered_count_mismatch_count,
    count(*) filter (
      where is_not_seen is distinct from (unique_proto_seen_count = 0)
    )::int as not_seen_mismatch_count,
    count(*) filter (
      where is_low_seen is distinct from (
        unique_proto_seen_count > 0
        and unique_proto_seen_count < 3
      )
    )::int as low_seen_mismatch_count,
    count(*) filter (
      where is_enough_seen is distinct from (unique_proto_seen_count >= 3)
    )::int as enough_seen_mismatch_count,
    count(*) filter (
      where mastered_proto_count <> independent_correct_proto_count
    )::int as mastered_count_mismatch_count,
    count(*) filter (
      where is_stale is distinct from (
        mastered_proto_count > 0
        and mastered_attempt_count_total >= 2
        and mastered_accuracy >= 0.7
        and last_mastered_attempt_at is not null
        and last_mastered_attempt_at < now() - interval '30 days'
      )
    )::int as stale_mismatch_count,
    count(*) filter (
      where is_unstable is distinct from (
        unstable_proto_count > 0
        and mastered_proto_count > 0
        and mastered_attempt_count_total >= 2
        and mastered_accuracy < 0.7
      )
    )::int as unstable_mismatch_count,
    count(*) filter (
      where is_stale = true
        and is_unstable = true
    )::int as stale_unstable_overlap_count,
    count(*) filter (
      where unstable_proto_count = 0
        and is_unstable = true
    )::int as unstable_without_proto_count,
    count(*) filter (
      where last_mastered_attempt_at is not null
        and mastered_proto_count = 0
    )::int as mastered_timestamp_without_proto_count
  from all_topic_raw
),
expected_rollup as (
  select
    ps.requested_source,
    ps.student_id,
    ps.source,
    ps.theme_id,
    ps.subtopic_id,
    count(*)::int as visible_proto_count,
    count(*) filter (where ps.covered)::int as unique_proto_seen_count,
    count(*) filter (where ps.is_not_seen)::int as not_seen_proto_count,
    count(*) filter (where ps.is_low_seen)::int as low_seen_proto_count,
    count(*) filter (where ps.is_enough_seen)::int as enough_seen_proto_count,
    count(*) filter (where ps.covered)::int as covered_proto_count,
    count(*) filter (where ps.solved)::int as solved_proto_count,
    count(*) filter (where ps.has_independent_correct)::int as independent_correct_proto_count,
    count(*) filter (where ps.is_weak)::int as weak_proto_count,
    count(*) filter (where ps.is_stale)::int as stale_proto_count,
    count(*) filter (where ps.is_unstable)::int as unstable_proto_count,
    coalesce(sum(ps.attempt_count_total), 0)::int as attempt_count_total,
    coalesce(sum(ps.correct_count_total), 0)::int as correct_count_total,
    max(ps.last_attempt_at) as last_attempt_at,
    count(*) filter (where ps.has_independent_correct)::int as mastered_proto_count,
    coalesce(sum(ps.attempt_count_total) filter (where ps.has_independent_correct), 0)::int as mastered_attempt_count_total,
    coalesce(sum(ps.correct_count_total) filter (where ps.has_independent_correct), 0)::int as mastered_correct_count_total,
    max(ps.last_attempt_at) filter (where ps.has_independent_correct) as last_mastered_attempt_at
  from all_proto_raw ps
  group by
    ps.requested_source,
    ps.student_id,
    ps.source,
    ps.theme_id,
    ps.subtopic_id
),
rollup_stats as (
  select
    count(*)::int as joined_row_count,
    count(*) filter (where t.subtopic_id is null)::int as missing_topic_row_count,
    count(*) filter (where e.subtopic_id is null)::int as missing_expected_rollup_count,
    count(*) filter (
      where t.subtopic_id is not null
        and e.subtopic_id is not null
        and t.visible_proto_count <> e.visible_proto_count
    )::int as visible_proto_count_mismatch_count,
    count(*) filter (
      where t.subtopic_id is not null
        and e.subtopic_id is not null
        and t.unique_proto_seen_count <> e.unique_proto_seen_count
    )::int as unique_proto_seen_mismatch_count,
    count(*) filter (
      where t.subtopic_id is not null
        and e.subtopic_id is not null
        and t.not_seen_proto_count <> e.not_seen_proto_count
    )::int as not_seen_count_mismatch_count,
    count(*) filter (
      where t.subtopic_id is not null
        and e.subtopic_id is not null
        and t.low_seen_proto_count <> e.low_seen_proto_count
    )::int as low_seen_count_mismatch_count,
    count(*) filter (
      where t.subtopic_id is not null
        and e.subtopic_id is not null
        and t.enough_seen_proto_count <> e.enough_seen_proto_count
    )::int as enough_seen_count_mismatch_count,
    count(*) filter (
      where t.subtopic_id is not null
        and e.subtopic_id is not null
        and t.covered_proto_count <> e.covered_proto_count
    )::int as covered_count_mismatch_count,
    count(*) filter (
      where t.subtopic_id is not null
        and e.subtopic_id is not null
        and t.solved_proto_count <> e.solved_proto_count
    )::int as solved_count_mismatch_count,
    count(*) filter (
      where t.subtopic_id is not null
        and e.subtopic_id is not null
        and t.independent_correct_proto_count <> e.independent_correct_proto_count
    )::int as independent_count_mismatch_count,
    count(*) filter (
      where t.subtopic_id is not null
        and e.subtopic_id is not null
        and t.weak_proto_count <> e.weak_proto_count
    )::int as weak_count_mismatch_count,
    count(*) filter (
      where t.subtopic_id is not null
        and e.subtopic_id is not null
        and t.stale_proto_count <> e.stale_proto_count
    )::int as stale_count_mismatch_count,
    count(*) filter (
      where t.subtopic_id is not null
        and e.subtopic_id is not null
        and t.unstable_proto_count <> e.unstable_proto_count
    )::int as unstable_count_mismatch_count,
    count(*) filter (
      where t.subtopic_id is not null
        and e.subtopic_id is not null
        and t.attempt_count_total <> e.attempt_count_total
    )::int as attempt_total_mismatch_count,
    count(*) filter (
      where t.subtopic_id is not null
        and e.subtopic_id is not null
        and t.correct_count_total <> e.correct_count_total
    )::int as correct_total_mismatch_count,
    count(*) filter (
      where t.subtopic_id is not null
        and e.subtopic_id is not null
        and t.last_attempt_at is distinct from e.last_attempt_at
    )::int as last_attempt_mismatch_count,
    count(*) filter (
      where t.subtopic_id is not null
        and e.subtopic_id is not null
        and t.mastered_proto_count <> e.mastered_proto_count
    )::int as mastered_count_rollup_mismatch_count,
    count(*) filter (
      where t.subtopic_id is not null
        and e.subtopic_id is not null
        and t.mastered_attempt_count_total <> e.mastered_attempt_count_total
    )::int as mastered_attempt_mismatch_count,
    count(*) filter (
      where t.subtopic_id is not null
        and e.subtopic_id is not null
        and t.mastered_correct_count_total <> e.mastered_correct_count_total
    )::int as mastered_correct_mismatch_count,
    count(*) filter (
      where t.subtopic_id is not null
        and e.subtopic_id is not null
        and t.last_mastered_attempt_at is distinct from e.last_mastered_attempt_at
    )::int as last_mastered_attempt_mismatch_count
  from all_topic_raw t
  full join expected_rollup e
    on e.requested_source = t.requested_source
   and e.student_id = t.student_id
   and e.source = t.source
   and e.theme_id = t.theme_id
   and e.subtopic_id = t.subtopic_id
),
checks as (
  select
    '1'::text as check_id,
    'student_proto_state_v1 and student_topic_state_v1 exist'::text as check_name,
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
    'all source covers visible topic catalog',
    case
      when (select visible_topic_count from catalog_counts) = 0 then 'WARN'
      when not (select is_ready from auth_state) then 'WARN'
      when ss.row_count = cc.visible_topic_count
       and ss.distinct_topic_count = cc.visible_topic_count then 'OK'
      else 'FAIL'
    end as status,
    'visible_topics='
      || cc.visible_topic_count
      || '; row_count='
      || ss.row_count
      || '; distinct_topics='
      || ss.distinct_topic_count
      as details
  from source_stats ss
  cross join catalog_counts cc
  where ss.requested_source = 'all'

  union all

  select
    '5',
    'hw source covers visible topic catalog',
    case
      when (select visible_topic_count from catalog_counts) = 0 then 'WARN'
      when not (select is_ready from auth_state) then 'WARN'
      when ss.row_count = cc.visible_topic_count
       and ss.distinct_topic_count = cc.visible_topic_count then 'OK'
      else 'FAIL'
    end as status,
    'visible_topics='
      || cc.visible_topic_count
      || '; row_count='
      || ss.row_count
      || '; distinct_topics='
      || ss.distinct_topic_count
      as details
  from source_stats ss
  cross join catalog_counts cc
  where ss.requested_source = 'hw'

  union all

  select
    '6',
    'test source covers visible topic catalog',
    case
      when (select visible_topic_count from catalog_counts) = 0 then 'WARN'
      when not (select is_ready from auth_state) then 'WARN'
      when ss.row_count = cc.visible_topic_count
       and ss.distinct_topic_count = cc.visible_topic_count then 'OK'
      else 'FAIL'
    end as status,
    'visible_topics='
      || cc.visible_topic_count
      || '; row_count='
      || ss.row_count
      || '; distinct_topics='
      || ss.distinct_topic_count
      as details
  from source_stats ss
  cross join catalog_counts cc
  where ss.requested_source = 'test'

  union all

  select
    '7',
    'identity and source columns are consistent',
    case
      when (select visible_topic_count from catalog_counts) = 0 then 'WARN'
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
    'seen-state partition and count invariants are valid',
    case
      when (select visible_topic_count from catalog_counts) = 0 then 'WARN'
      when not (select is_ready from auth_state) then 'WARN'
      when fs.seen_partition_mismatch_count = 0
       and fs.visible_count_partition_mismatch_count = 0
       and fs.covered_count_mismatch_count = 0
       and fs.not_seen_mismatch_count = 0
       and fs.low_seen_mismatch_count = 0
       and fs.enough_seen_mismatch_count = 0 then 'OK'
      else 'FAIL'
    end as status,
    'partition_mismatch='
      || fs.seen_partition_mismatch_count
      || '; visible_partition_mismatch='
      || fs.visible_count_partition_mismatch_count
      || '; covered_count_mismatch='
      || fs.covered_count_mismatch_count
      || '; not_seen_mismatch='
      || fs.not_seen_mismatch_count
      || '; low_seen_mismatch='
      || fs.low_seen_mismatch_count
      || '; enough_seen_mismatch='
      || fs.enough_seen_mismatch_count
      as details
  from topic_formula_stats fs

  union all

  select
    '9',
    'topic rollup matches proto state',
    case
      when (select visible_topic_count from catalog_counts) = 0 then 'WARN'
      when not (select is_ready from auth_state) then 'WARN'
      when rs.missing_topic_row_count = 0
       and rs.missing_expected_rollup_count = 0
       and rs.visible_proto_count_mismatch_count = 0
       and rs.unique_proto_seen_mismatch_count = 0
       and rs.not_seen_count_mismatch_count = 0
       and rs.low_seen_count_mismatch_count = 0
       and rs.enough_seen_count_mismatch_count = 0
       and rs.covered_count_mismatch_count = 0
       and rs.solved_count_mismatch_count = 0
       and rs.independent_count_mismatch_count = 0
       and rs.weak_count_mismatch_count = 0
       and rs.stale_count_mismatch_count = 0
       and rs.unstable_count_mismatch_count = 0
       and rs.attempt_total_mismatch_count = 0
       and rs.correct_total_mismatch_count = 0
       and rs.last_attempt_mismatch_count = 0
       and rs.mastered_count_rollup_mismatch_count = 0
       and rs.mastered_attempt_mismatch_count = 0
       and rs.mastered_correct_mismatch_count = 0
       and rs.last_mastered_attempt_mismatch_count = 0 then 'OK'
      else 'FAIL'
    end as status,
    'missing_topic_rows='
      || rs.missing_topic_row_count
      || '; missing_expected_rollups='
      || rs.missing_expected_rollup_count
      || '; count_mismatches='
      || (
        rs.visible_proto_count_mismatch_count
        + rs.unique_proto_seen_mismatch_count
        + rs.not_seen_count_mismatch_count
        + rs.low_seen_count_mismatch_count
        + rs.enough_seen_count_mismatch_count
        + rs.covered_count_mismatch_count
        + rs.solved_count_mismatch_count
        + rs.independent_count_mismatch_count
        + rs.weak_count_mismatch_count
        + rs.stale_count_mismatch_count
        + rs.unstable_count_mismatch_count
      )
      || '; metric_mismatches='
      || (
        rs.attempt_total_mismatch_count
        + rs.correct_total_mismatch_count
        + rs.last_attempt_mismatch_count
        + rs.mastered_count_rollup_mismatch_count
        + rs.mastered_attempt_mismatch_count
        + rs.mastered_correct_mismatch_count
        + rs.last_mastered_attempt_mismatch_count
      )
      as details
  from rollup_stats rs

  union all

  select
    '10',
    'accuracy and mastered_accuracy formulas are valid',
    case
      when (select visible_topic_count from catalog_counts) = 0 then 'WARN'
      when not (select is_ready from auth_state) then 'WARN'
      when fs.accuracy_mismatch_count = 0
       and fs.mastered_accuracy_mismatch_count = 0 then 'OK'
      else 'FAIL'
    end as status,
    'accuracy_mismatch='
      || fs.accuracy_mismatch_count
      || '; mastered_accuracy_mismatch='
      || fs.mastered_accuracy_mismatch_count
      as details
  from topic_formula_stats fs

  union all

  select
    '11',
    'stale and unstable formulas are valid',
    case
      when (select visible_topic_count from catalog_counts) = 0 then 'WARN'
      when not (select is_ready from auth_state) then 'WARN'
      when fs.stale_mismatch_count = 0
       and fs.unstable_mismatch_count = 0
       and fs.unstable_without_proto_count = 0
       and fs.mastered_timestamp_without_proto_count = 0
       and fs.mastered_count_mismatch_count = 0 then 'OK'
      else 'FAIL'
    end as status,
    'stale_mismatch='
      || fs.stale_mismatch_count
      || '; unstable_mismatch='
      || fs.unstable_mismatch_count
      || '; unstable_without_proto='
      || fs.unstable_without_proto_count
      || '; mastered_timestamp_without_proto='
      || fs.mastered_timestamp_without_proto_count
      || '; mastered_count_mismatch='
      || fs.mastered_count_mismatch_count
      as details
  from topic_formula_stats fs

  union all

  select
    '12',
    'stale and unstable are mutually exclusive',
    case
      when (select visible_topic_count from catalog_counts) = 0 then 'WARN'
      when not (select is_ready from auth_state) then 'WARN'
      when fs.stale_unstable_overlap_count = 0 then 'OK'
      else 'FAIL'
    end as status,
    'overlap_count=' || fs.stale_unstable_overlap_count as details
  from topic_formula_stats fs
),
summary as (
  select
    'summary'::text as check_id,
    'student_topic_state_v1 rollout smoke summary'::text as check_name,
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
