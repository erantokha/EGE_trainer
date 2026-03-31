-- teacher_picking_screen_v2_rollout_smoke_summary.sql
-- Single-result-set smoke summary for teacher_picking_screen_v2 rollout after applying:
--   1) docs/supabase/student_proto_state_v1.sql
--   2) docs/supabase/student_topic_state_v1.sql
--   3) docs/supabase/teacher_picking_screen_v2.sql
--
-- Usage: Supabase SQL Editor.
-- All statements are SELECT-only.
-- Expected result: status = OK for all checks, or WARN only when the project has
-- no teacher-student pairs, SQL Editor synthetic auth does not satisfy the access
-- gate, or there are no eligible filter candidates for a specific sample path.

with required_functions as (
  select *
  from (
    values
      ('student_proto_state_v1'::text),
      ('student_topic_state_v1'::text),
      ('teacher_picking_screen_v2'::text)
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
    t.sort_order
  from public.catalog_theme_dim t
  where coalesce(t.is_enabled, true) = true
    and coalesce(t.is_hidden, false) = false
),
visible_subtopics as (
  select
    s.subtopic_id,
    s.theme_id,
    s.sort_order
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
visible_questions as (
  select
    q.question_id,
    q.unic_id,
    q.subtopic_id,
    q.theme_id
  from public.catalog_question_dim q
  join visible_unics vu
    on vu.unic_id = q.unic_id
   and vu.subtopic_id = q.subtopic_id
   and vu.theme_id = q.theme_id
  where coalesce(q.is_enabled, true) = true
    and coalesce(q.is_hidden, false) = false
),
catalog_counts as (
  select
    (select count(*)::int from visible_themes) as visible_theme_count,
    (select count(*)::int from visible_subtopics) as visible_topic_count,
    (select count(*)::int from visible_unics) as visible_proto_count,
    (select count(*)::int from visible_questions) as visible_question_count
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
proto_state_all as (
  select s.*
  from auth_probe ap
  cross join lateral public.student_proto_state_v1(ap.student_id, 'all') s
  where ap.effective_uid = ap.teacher_id
    and ap.can_access_student = true
),
topic_state_all as (
  select s.*
  from auth_probe ap
  cross join lateral public.student_topic_state_v1(ap.student_id, 'all') s
  where ap.effective_uid = ap.teacher_id
    and ap.can_access_student = true
),
sample_proto_any as (
  select distinct
    ps.unic_id
  from proto_state_all ps
  join visible_questions vq
    on vq.unic_id = ps.unic_id
   and vq.subtopic_id = ps.subtopic_id
   and vq.theme_id = ps.theme_id
  order by ps.unic_id
  limit 1
),
sample_section_any as (
  select
    vt.theme_id
  from visible_themes vt
  where exists (
    select 1
    from visible_questions vq
    where vq.theme_id = vt.theme_id
  )
  order by vt.sort_order, vt.theme_id
  limit 1
),
sample_topic_unseen_low as (
  select
    ts.subtopic_id,
    ts.theme_id,
    (ts.not_seen_proto_count + ts.low_seen_proto_count)::int as eligible_count
  from topic_state_all ts
  where (ts.not_seen_proto_count + ts.low_seen_proto_count) > 0
    and exists (
      select 1
      from visible_questions vq
      where vq.subtopic_id = ts.subtopic_id
        and vq.theme_id = ts.theme_id
    )
  order by ts.theme_id, ts.subtopic_id
  limit 1
),
sample_section_stale as (
  select
    ts.theme_id,
    sum(ts.stale_proto_count)::int as eligible_count
  from topic_state_all ts
  group by ts.theme_id
  having sum(ts.stale_proto_count) > 0
  order by ts.theme_id
  limit 1
),
sample_section_unstable as (
  select
    ts.theme_id,
    sum(ts.unstable_proto_count)::int as eligible_count
  from topic_state_all ts
  group by ts.theme_id
  having sum(ts.unstable_proto_count) > 0
  order by ts.theme_id
  limit 1
),
init_raw as (
  select
    public.teacher_picking_screen_v2(
      ap.student_id,
      'init',
      30,
      'all',
      null::text,
      '{}'::jsonb,
      '{}'::jsonb,
      null::text,
      null::text[]
    ) as payload
  from auth_probe ap
  where ap.effective_uid = ap.teacher_id
    and ap.can_access_student = true
),
init_one as (
  select payload
  from init_raw

  union all

  select null::jsonb as payload
  where not exists (select 1 from init_raw)

  limit 1
),
resolve_payloads_raw as (
  select
    'empty'::text as path_id,
    public.teacher_picking_screen_v2(
      ap.student_id,
      'resolve',
      30,
      'all',
      null::text,
      '{}'::jsonb,
      '{}'::jsonb,
      null::text,
      null::text[]
    ) as payload
  from auth_probe ap
  where ap.effective_uid = ap.teacher_id
    and ap.can_access_student = true

  union all

  select
    'proto',
    public.teacher_picking_screen_v2(
      ap.student_id,
      'resolve',
      30,
      'all',
      null::text,
      '{}'::jsonb,
      jsonb_build_object(
        'scope_kind', 'proto',
        'scope_id', sp.unic_id,
        'n', 2
      ),
      null::text,
      null::text[]
    )
  from auth_probe ap
  cross join sample_proto_any sp
  where ap.effective_uid = ap.teacher_id
    and ap.can_access_student = true

  union all

  select
    'section_none',
    public.teacher_picking_screen_v2(
      ap.student_id,
      'resolve',
      30,
      'all',
      null::text,
      '{}'::jsonb,
      jsonb_build_object(
        'scope_kind', 'section',
        'scope_id', ss.theme_id,
        'n', 3
      ),
      null::text,
      null::text[]
    )
  from auth_probe ap
  cross join sample_section_any ss
  where ap.effective_uid = ap.teacher_id
    and ap.can_access_student = true

  union all

  select
    'unseen_low',
    public.teacher_picking_screen_v2(
      ap.student_id,
      'resolve',
      30,
      'all',
      'unseen_low',
      '{}'::jsonb,
      jsonb_build_object(
        'scope_kind', 'topic',
        'scope_id', st.subtopic_id,
        'n', 2
      ),
      null::text,
      null::text[]
    )
  from auth_probe ap
  cross join sample_topic_unseen_low st
  where ap.effective_uid = ap.teacher_id
    and ap.can_access_student = true

  union all

  select
    'stale',
    public.teacher_picking_screen_v2(
      ap.student_id,
      'resolve',
      30,
      'all',
      'stale',
      '{}'::jsonb,
      jsonb_build_object(
        'scope_kind', 'section',
        'scope_id', ss.theme_id,
        'n', 2
      ),
      null::text,
      null::text[]
    )
  from auth_probe ap
  cross join sample_section_stale ss
  where ap.effective_uid = ap.teacher_id
    and ap.can_access_student = true

  union all

  select
    'unstable',
    public.teacher_picking_screen_v2(
      ap.student_id,
      'resolve',
      30,
      'all',
      'unstable',
      '{}'::jsonb,
      jsonb_build_object(
        'scope_kind', 'section',
        'scope_id', su.theme_id,
        'n', 2
      ),
      null::text,
      null::text[]
    )
  from auth_probe ap
  cross join sample_section_unstable su
  where ap.effective_uid = ap.teacher_id
    and ap.can_access_student = true

  union all

  select
    'global_all',
    public.teacher_picking_screen_v2(
      ap.student_id,
      'resolve',
      30,
      'all',
      null::text,
      '{}'::jsonb,
      jsonb_build_object(
        'scope_kind', 'global_all'
      ),
      null::text,
      null::text[]
    )
  from auth_probe ap
  where ap.effective_uid = ap.teacher_id
    and ap.can_access_student = true
),
resolve_path_catalog as (
  select *
  from (
    values
      ('empty'::text, null::text, ''::text, 0::int),
      ('proto', null::text, 'proto'::text, 2::int),
      ('section_none', null::text, 'section'::text, 3::int),
      ('unseen_low', 'unseen_low'::text, 'topic'::text, 2::int),
      ('stale', 'stale'::text, 'section'::text, 2::int),
      ('unstable', 'unstable'::text, 'section'::text, 2::int),
      ('global_all', null::text, 'global_all'::text, null::int)
  ) v(path_id, expected_filter_id, expected_scope_kind, expected_n)
),
resolve_payloads as (
  select
    rpc.path_id,
    rpc.expected_filter_id,
    rpc.expected_scope_kind,
    rpc.expected_n,
    rpr.payload
  from resolve_path_catalog rpc
  left join resolve_payloads_raw rpr
    on rpr.path_id = rpc.path_id
),
init_meta as (
  select
    io.payload,
    case
      when io.payload is null then 'null'
      else coalesce(jsonb_typeof(io.payload), 'null')
    end as payload_type,
    coalesce(io.payload #>> '{screen,mode}', '') as screen_mode,
    coalesce(jsonb_typeof(io.payload->'sections'), 'null') as sections_type,
    coalesce(jsonb_typeof(io.payload->'recommendations'), 'null') as recommendations_type,
    coalesce(jsonb_typeof(io.payload->'picked_questions'), 'null') as picked_questions_type,
    coalesce(jsonb_typeof(io.payload->'warnings'), 'null') as warnings_type,
    coalesce(jsonb_typeof(io.payload->'shortage'), 'null') as shortage_type,
    case
      when jsonb_typeof(io.payload->'sections') = 'array'
        then jsonb_array_length(io.payload->'sections')
      else 0
    end as section_count,
    case
      when jsonb_typeof(io.payload->'recommendations') = 'array'
        then jsonb_array_length(io.payload->'recommendations')
      else 0
    end as recommendation_count,
    case
      when jsonb_typeof(io.payload #> '{screen,supported_filters}') = 'array'
        then jsonb_array_length(io.payload #> '{screen,supported_filters}')
      else 0
    end as supported_filter_count,
    coalesce(io.payload ? 'dashboard', false) as has_dashboard
  from init_one io
),
required_init_keys as (
  select *
  from (
    values
      ('student'::text),
      ('catalog_version'::text),
      ('screen'::text),
      ('filter'::text),
      ('sections'::text),
      ('selection'::text),
      ('picked_questions'::text),
      ('shortage'::text),
      ('warnings'::text),
      ('generated_at'::text),
      ('recommendations'::text)
  ) v(key_name)
),
missing_init_keys as (
  select
    count(*) filter (
      where not coalesce((select payload from init_one) ? rk.key_name, false)
    )::int as missing_count,
    coalesce(
      string_agg(rk.key_name, ', ' order by rk.key_name)
        filter (where not coalesce((select payload from init_one) ? rk.key_name, false)),
      'none'
    ) as missing_keys
  from required_init_keys rk
),
init_recommendation_rows as (
  select
    r.obj
  from init_one io
  cross join lateral jsonb_array_elements(coalesce(io.payload->'recommendations', '[]'::jsonb)) as r(obj)
),
init_recommendation_stats as (
  select
    count(*)::int as row_count,
    count(*) filter (
      where coalesce(nullif(trim(obj->>'filter_id'), ''), 'missing')
        not in ('unseen_low', 'stale', 'unstable')
    )::int as invalid_filter_count,
    count(*) filter (
      where nullif(trim(obj->>'topic_id'), '') is null
         or nullif(trim(obj->>'section_id'), '') is null
         or nullif(trim(obj->>'reason_id'), '') is null
    )::int as invalid_shape_count
  from init_recommendation_rows
),
resolve_meta as (
  select
    rp.path_id,
    rp.expected_filter_id,
    rp.expected_scope_kind,
    rp.expected_n,
    rp.payload,
    case
      when rp.payload is null then 'null'
      else coalesce(jsonb_typeof(rp.payload), 'null')
    end as payload_type,
    coalesce(rp.payload #>> '{screen,mode}', '') as screen_mode,
    rp.payload #>> '{filter,filter_id}' as actual_filter_id,
    coalesce(rp.payload #>> '{selection,request,scope_kind}', '') as actual_scope_kind,
    coalesce(jsonb_typeof(rp.payload->'picked_questions'), 'null') as picked_questions_type,
    coalesce(jsonb_typeof(rp.payload->'shortage'), 'null') as shortage_type,
    coalesce(jsonb_typeof(rp.payload->'warnings'), 'null') as warnings_type,
    case
      when jsonb_typeof(rp.payload->'picked_questions') = 'array'
        then jsonb_array_length(rp.payload->'picked_questions')
      else 0
    end as picked_question_count,
    case
      when coalesce(rp.payload #>> '{shortage,requested_n}', '') ~ '^-?[0-9]+$'
        then (rp.payload #>> '{shortage,requested_n}')::int
      else null::int
    end as shortage_requested_n,
    case
      when coalesce(rp.payload #>> '{shortage,returned_n}', '') ~ '^-?[0-9]+$'
        then (rp.payload #>> '{shortage,returned_n}')::int
      else null::int
    end as shortage_returned_n,
    lower(coalesce(rp.payload #>> '{shortage,is_shortage}', 'false')) = 'true' as shortage_flag
  from resolve_payloads rp
),
resolve_warning_rows as (
  select
    rm.path_id,
    w.obj->>'code' as code
  from resolve_meta rm
  cross join lateral jsonb_array_elements(coalesce(rm.payload->'warnings', '[]'::jsonb)) as w(obj)
),
resolve_warning_stats as (
  select
    rm.path_id,
    count(rwr.code)::int as warning_count,
    count(*) filter (
      where rwr.code is not null
        and coalesce(nullif(trim(rwr.code), ''), 'missing')
        not in ('empty_resolve_request', 'selected_proto_not_eligible_for_filter', 'no_candidates_in_scope')
    )::int as invalid_warning_code_count,
    coalesce(
      string_agg(rwr.code, ', ' order by rwr.code) filter (where rwr.code is not null),
      'none'
    ) as warning_codes
  from resolve_meta rm
  left join resolve_warning_rows rwr
    on rwr.path_id = rm.path_id
  group by rm.path_id
),
resolve_item_rows as (
  select
    rm.path_id,
    ri.obj
  from resolve_meta rm
  cross join lateral jsonb_array_elements(coalesce(rm.payload->'picked_questions', '[]'::jsonb)) as ri(obj)
),
resolve_item_stats as (
  select
    rm.path_id,
    count(ri.obj)::int as item_count,
    count(distinct ri.obj->>'question_id')::int as distinct_question_count,
    count(*) filter (
      where ri.obj is not null
        and (
          nullif(trim(ri.obj->>'question_id'), '') is null
           or nullif(trim(ri.obj->>'proto_id'), '') is null
           or nullif(trim(ri.obj->>'topic_id'), '') is null
           or nullif(trim(ri.obj->>'section_id'), '') is null
           or nullif(trim(ri.obj->>'manifest_path'), '') is null
           or nullif(trim(ri.obj->>'scope_kind'), '') is null
        )
    )::int as invalid_item_shape_count,
    count(*) filter (
      where ri.obj is not null
        and coalesce(ri.obj->>'scope_kind', '') <> rm.expected_scope_kind
    )::int as scope_kind_mismatch_count,
    count(*) filter (
      where ri.obj is not null
        and rm.expected_filter_id is not null
        and coalesce(ri.obj->>'filter_id', '') <> rm.expected_filter_id
    )::int as filter_id_mismatch_count
  from resolve_meta rm
  left join resolve_item_rows ri
    on ri.path_id = rm.path_id
  group by rm.path_id
),
checks as (
  select
    '1'::text as check_id,
    'student_proto_state_v1, student_topic_state_v1 and teacher_picking_screen_v2 exist'::text as check_name,
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
    end,
    'pair_count=' || count(*)
      || '; teacher_id=' || coalesce(min(teacher_id::text), 'null')
      || '; student_id=' || coalesce(min(student_id::text), 'null')
  from sample_pair

  union all

  select
    '3',
    'SQL editor auth context works',
    case when am.can_access_student = true then 'OK' else 'WARN' end,
    'effective_uid=' || coalesce(am.effective_uid::text, 'null')
      || '; teacher_id=' || coalesce(am.teacher_id::text, 'null')
      || '; can_access_student=' || am.can_access_student::text
      || case
        when am.can_access_student = true then ''
        else '; note=SQL Editor synthetic auth did not satisfy access gate; verify live runtime through app session'
      end
  from auth_meta am

  union all

  select
    '4',
    'init payload top-level shape',
    case
      when not (select is_ready from auth_state) then 'WARN'
      when im.payload_type = 'object'
       and im.screen_mode = 'init'
       and mik.missing_count = 0
       and im.picked_questions_type = 'array'
       and im.shortage_type = 'object'
       and im.warnings_type = 'array'
      then 'OK'
      else 'FAIL'
    end,
    'payload_type=' || im.payload_type
      || '; screen_mode=' || coalesce(im.screen_mode, 'null')
      || '; missing_keys=' || mik.missing_keys
      || '; picked_questions_type=' || im.picked_questions_type
      || '; shortage_type=' || im.shortage_type
      || '; warnings_type=' || im.warnings_type
  from init_meta im
  cross join missing_init_keys mik

  union all

  select
    '5',
    'init sections, supported filters and no dashboard',
    case
      when not (select is_ready from auth_state) then 'WARN'
      when im.sections_type = 'array'
       and im.section_count = cc.visible_theme_count
       and im.supported_filter_count = 3
       and im.has_dashboard = false
      then 'OK'
      else 'FAIL'
    end,
    'visible_themes=' || cc.visible_theme_count
      || '; section_count=' || im.section_count
      || '; supported_filter_count=' || im.supported_filter_count
      || '; has_dashboard=' || im.has_dashboard::text
  from init_meta im
  cross join catalog_counts cc

  union all

  select
    '6',
    'init recommendations block is valid',
    case
      when not (select is_ready from auth_state) then 'WARN'
      when im.recommendations_type = 'array'
       and irs.invalid_filter_count = 0
       and irs.invalid_shape_count = 0
      then 'OK'
      else 'FAIL'
    end,
    'recommendations_type=' || im.recommendations_type
      || '; recommendation_count=' || im.recommendation_count
      || '; invalid_filter_count=' || irs.invalid_filter_count
      || '; invalid_shape_count=' || irs.invalid_shape_count
  from init_meta im
  cross join init_recommendation_stats irs

  union all

  select
    '7',
    'resolve empty request contract',
    case
      when not (select is_ready from auth_state) then 'WARN'
      when rm.payload_type = 'object'
       and rm.screen_mode = 'resolve'
       and rm.picked_questions_type = 'array'
       and rm.picked_question_count = 0
       and rm.shortage_type = 'object'
       and rm.warnings_type = 'array'
       and rws.invalid_warning_code_count = 0
       and position('empty_resolve_request' in rws.warning_codes) > 0
      then 'OK'
      else 'FAIL'
    end,
    'picked_question_count=' || rm.picked_question_count
      || '; warning_codes=' || rws.warning_codes
      || '; shortage_requested_n=' || coalesce(rm.shortage_requested_n::text, 'null')
      || '; shortage_returned_n=' || coalesce(rm.shortage_returned_n::text, 'null')
  from resolve_meta rm
  join resolve_warning_stats rws
    on rws.path_id = rm.path_id
  where rm.path_id = 'empty'

  union all

  select
    '8',
    'resolve proto primary path',
    case
      when not (select is_ready from auth_state) then 'WARN'
      when not exists (select 1 from sample_proto_any) then 'WARN'
      when rm.payload_type = 'object'
       and rm.screen_mode = 'resolve'
       and rm.actual_scope_kind = 'proto'
       and rm.actual_filter_id is null
       and rm.picked_questions_type = 'array'
       and rm.picked_question_count between 1 and 2
       and ris.invalid_item_shape_count = 0
       and ris.scope_kind_mismatch_count = 0
       and ris.filter_id_mismatch_count = 0
      then 'OK'
      else 'FAIL'
    end,
    'sample_proto_id=' || coalesce((select unic_id from sample_proto_any), 'none')
      || '; picked_question_count=' || rm.picked_question_count
      || '; scope_kind=' || coalesce(rm.actual_scope_kind, 'null')
      || '; actual_filter_id=' || coalesce(rm.actual_filter_id, 'null')
  from resolve_meta rm
  join resolve_item_stats ris
    on ris.path_id = rm.path_id
  where rm.path_id = 'proto'

  union all

  select
    '9',
    'resolve section primary path',
    case
      when not (select is_ready from auth_state) then 'WARN'
      when not exists (select 1 from sample_section_any) then 'WARN'
      when rm.payload_type = 'object'
       and rm.screen_mode = 'resolve'
       and rm.actual_scope_kind = 'section'
       and rm.actual_filter_id is null
       and rm.picked_questions_type = 'array'
       and rm.picked_question_count between 1 and 3
       and ris.invalid_item_shape_count = 0
       and ris.scope_kind_mismatch_count = 0
      then 'OK'
      else 'FAIL'
    end,
    'sample_section_id=' || coalesce((select theme_id from sample_section_any), 'none')
      || '; picked_question_count=' || rm.picked_question_count
      || '; shortage_requested_n=' || coalesce(rm.shortage_requested_n::text, 'null')
      || '; shortage_returned_n=' || coalesce(rm.shortage_returned_n::text, 'null')
  from resolve_meta rm
  join resolve_item_stats ris
    on ris.path_id = rm.path_id
  where rm.path_id = 'section_none'

  union all

  select
    '10',
    'resolve unseen_low path',
    case
      when not (select is_ready from auth_state) then 'WARN'
      when not exists (select 1 from sample_topic_unseen_low) then 'WARN'
      when rm.payload_type = 'object'
       and rm.screen_mode = 'resolve'
       and rm.actual_scope_kind = 'topic'
       and rm.actual_filter_id = 'unseen_low'
       and rm.picked_questions_type = 'array'
       and rm.picked_question_count between 1 and 2
       and ris.invalid_item_shape_count = 0
       and ris.scope_kind_mismatch_count = 0
       and ris.filter_id_mismatch_count = 0
      then 'OK'
      else 'FAIL'
    end,
    'sample_topic_id=' || coalesce((select subtopic_id from sample_topic_unseen_low), 'none')
      || '; eligible_count=' || coalesce((select eligible_count::text from sample_topic_unseen_low), '0')
      || '; picked_question_count=' || rm.picked_question_count
      || '; actual_filter_id=' || coalesce(rm.actual_filter_id, 'null')
  from resolve_meta rm
  join resolve_item_stats ris
    on ris.path_id = rm.path_id
  where rm.path_id = 'unseen_low'

  union all

  select
    '11',
    'resolve stale path',
    case
      when not (select is_ready from auth_state) then 'WARN'
      when not exists (select 1 from sample_section_stale) then 'WARN'
      when rm.payload_type = 'object'
       and rm.screen_mode = 'resolve'
       and rm.actual_scope_kind = 'section'
       and rm.actual_filter_id = 'stale'
       and rm.picked_questions_type = 'array'
       and rm.picked_question_count between 1 and 2
       and ris.invalid_item_shape_count = 0
       and ris.scope_kind_mismatch_count = 0
       and ris.filter_id_mismatch_count = 0
      then 'OK'
      else 'FAIL'
    end,
    'sample_section_id=' || coalesce((select theme_id from sample_section_stale), 'none')
      || '; eligible_count=' || coalesce((select eligible_count::text from sample_section_stale), '0')
      || '; picked_question_count=' || rm.picked_question_count
      || '; actual_filter_id=' || coalesce(rm.actual_filter_id, 'null')
  from resolve_meta rm
  join resolve_item_stats ris
    on ris.path_id = rm.path_id
  where rm.path_id = 'stale'

  union all

  select
    '12',
    'resolve unstable path',
    case
      when not (select is_ready from auth_state) then 'WARN'
      when not exists (select 1 from sample_section_unstable) then 'WARN'
      when rm.payload_type = 'object'
       and rm.screen_mode = 'resolve'
       and rm.actual_scope_kind = 'section'
       and rm.actual_filter_id = 'unstable'
       and rm.picked_questions_type = 'array'
       and rm.picked_question_count between 1 and 2
       and ris.invalid_item_shape_count = 0
       and ris.scope_kind_mismatch_count = 0
       and ris.filter_id_mismatch_count = 0
      then 'OK'
      else 'FAIL'
    end,
    'sample_section_id=' || coalesce((select theme_id from sample_section_unstable), 'none')
      || '; eligible_count=' || coalesce((select eligible_count::text from sample_section_unstable), '0')
      || '; picked_question_count=' || rm.picked_question_count
      || '; actual_filter_id=' || coalesce(rm.actual_filter_id, 'null')
  from resolve_meta rm
  join resolve_item_stats ris
    on ris.path_id = rm.path_id
  where rm.path_id = 'unstable'

  union all

  select
    '13',
    'resolve global_all path',
    case
      when not (select is_ready from auth_state) then 'WARN'
      when (select visible_theme_count from catalog_counts) = 0 then 'WARN'
      when rm.payload_type = 'object'
       and rm.screen_mode = 'resolve'
       and rm.actual_scope_kind = 'global_all'
       and rm.picked_questions_type = 'array'
       and rm.picked_question_count >= 1
       and rm.picked_question_count <= (select visible_theme_count from catalog_counts)
       and ris.invalid_item_shape_count = 0
       and ris.scope_kind_mismatch_count = 0
      then 'OK'
      else 'FAIL'
    end,
    'visible_theme_count=' || (select visible_theme_count::text from catalog_counts)
      || '; picked_question_count=' || rm.picked_question_count
      || '; shortage_requested_n=' || coalesce(rm.shortage_requested_n::text, 'null')
      || '; shortage_returned_n=' || coalesce(rm.shortage_returned_n::text, 'null')
  from resolve_meta rm
  join resolve_item_stats ris
    on ris.path_id = rm.path_id
  where rm.path_id = 'global_all'

  union all

  select
    '14',
    'common resolve contract integrity',
    case
      when not (select is_ready from auth_state) then 'WARN'
      when sum(case when rm.payload_type = 'object' then 0 else 1 end) = 0
       and sum(case when rm.picked_questions_type = 'array' then 0 else 1 end) = 0
       and sum(case when rm.shortage_type = 'object' then 0 else 1 end) = 0
       and sum(case when rm.warnings_type = 'array' then 0 else 1 end) = 0
       and sum(case when coalesce(ris.invalid_item_shape_count, 0) = 0 then 0 else 1 end) = 0
       and sum(case when coalesce(ris.item_count, 0) = coalesce(ris.distinct_question_count, 0) then 0 else 1 end) = 0
       and sum(case when rm.shortage_returned_n is not distinct from rm.picked_question_count then 0 else 1 end) = 0
       and sum(case when coalesce(rws.invalid_warning_code_count, 0) = 0 then 0 else 1 end) = 0
      then 'OK'
      else 'FAIL'
    end,
    'payload_rows=' || count(*)
      || '; invalid_payload_type=' || sum(case when rm.payload_type = 'object' then 0 else 1 end)
      || '; invalid_picked_type=' || sum(case when rm.picked_questions_type = 'array' then 0 else 1 end)
      || '; invalid_shortage_type=' || sum(case when rm.shortage_type = 'object' then 0 else 1 end)
      || '; invalid_warnings_type=' || sum(case when rm.warnings_type = 'array' then 0 else 1 end)
      || '; invalid_item_shape=' || sum(coalesce(ris.invalid_item_shape_count, 0))
      || '; duplicate_questions=' || sum(greatest(coalesce(ris.item_count, 0) - coalesce(ris.distinct_question_count, 0), 0))
      || '; shortage_mismatch=' || sum(case when rm.shortage_returned_n is not distinct from rm.picked_question_count then 0 else 1 end)
      || '; invalid_warning_code=' || sum(coalesce(rws.invalid_warning_code_count, 0))
  from resolve_meta rm
  left join resolve_item_stats ris
    on ris.path_id = rm.path_id
  left join resolve_warning_stats rws
    on rws.path_id = rm.path_id
  where rm.path_id <> 'empty'
    and rm.payload is not null
),
summary as (
  select
    'summary'::text as check_id,
    'teacher_picking_screen_v2 rollout smoke summary'::text as check_name,
    case
      when count(*) filter (where c.status = 'FAIL') > 0 then 'FAIL'
      when count(*) filter (where c.status = 'WARN') > 0 then 'WARN'
      else 'OK'
    end as status,
    'ok=' || count(*) filter (where c.status = 'OK')
      || '; warn=' || count(*) filter (where c.status = 'WARN')
      || '; fail=' || count(*) filter (where c.status = 'FAIL')
      as details
  from checks c
)
select *
from (
  select *
  from checks

  union all

  select *
  from summary
) q
order by
  case when check_id = 'summary' then 999 else check_id::int end;
