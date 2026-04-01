-- teacher_picking_screen_v1.sql
-- DEPRECATED (Stage 8, 2026-04-01): no production consumers.
-- Superseded by teacher_picking_screen_v2.
-- Drop from Supabase using docs/supabase/stage8_deprecated_rpc_drop.sql.
--
-- Stage 3 proposed contract.
-- First-pass layer-4 screen payload for teacher-picking init/resolve flow.
-- Designed from docs/navigation/teacher_picking_screen_v1_spec.md.

begin;

create or replace function public.teacher_picking_screen_v1(
  p_student_id uuid,
  p_mode text default 'init'::text,
  p_days integer default 30,
  p_source text default 'all'::text,
  p_selection jsonb default '{}'::jsonb,
  p_teacher_filters jsonb default '{}'::jsonb,
  p_exclude_question_ids text[] default null::text[]
)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
set row_security to 'off'
as $function$
with params as (
  select
    p_student_id as student_id,
    case
      when lower(coalesce(nullif(p_mode, ''), 'init')) in ('init', 'resolve')
        then lower(coalesce(nullif(p_mode, ''), 'init'))
      else 'init'
    end as mode,
    greatest(1, least(coalesce(p_days, 30), 3650))::int as days,
    case
      when lower(coalesce(nullif(p_source, ''), 'all')) in ('all', 'hw', 'test')
        then lower(coalesce(nullif(p_source, ''), 'all'))
      else 'all'
    end as source,
    coalesce(p_selection, '{}'::jsonb) as selection_json,
    coalesce(p_teacher_filters, '{}'::jsonb) as teacher_filters_json,
    coalesce(p_exclude_question_ids, '{}'::text[]) as exclude_question_ids
),
visible_themes as (
  select
    t.theme_id,
    t.title,
    t.sort_order,
    t.catalog_version
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
    s.source_path,
    s.catalog_version
  from public.catalog_subtopic_dim s
  join visible_themes t
    on t.theme_id = s.theme_id
  where coalesce(s.is_enabled, true) = true
    and coalesce(s.is_hidden, false) = false
),
visible_unics as (
  select
    u.unic_id,
    u.subtopic_id,
    u.theme_id,
    u.is_counted_in_coverage
  from public.catalog_unic_dim u
  join visible_subtopics s
    on s.subtopic_id = u.subtopic_id
   and s.theme_id = u.theme_id
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
    coalesce(
      nullif(trim(q.manifest_path), ''),
      nullif(trim(s.source_path), '')
    ) as manifest_path,
    q.catalog_version
  from public.catalog_question_dim q
  join visible_unics u
    on u.unic_id = q.unic_id
   and u.subtopic_id = q.subtopic_id
   and u.theme_id = q.theme_id
  join visible_subtopics s
    on s.subtopic_id = q.subtopic_id
   and s.theme_id = q.theme_id
  where coalesce(q.is_enabled, true) = true
    and coalesce(q.is_hidden, false) = false
),
req_unics as (
  select
    src.unic_id,
    sum(src.want)::int as want
  from (
    select
      nullif(trim(x.id), '') as unic_id,
      greatest(coalesce(x.n, 0), 0)::int as want
    from params p
    cross join lateral jsonb_to_recordset(
      case
        when jsonb_typeof(p.selection_json->'unics') = 'array' then p.selection_json->'unics'
        else '[]'::jsonb
      end
    ) as x(id text, n int)

    union all

    select
      nullif(trim(x.id), '') as unic_id,
      greatest(coalesce(x.n, 0), 0)::int as want
    from params p
    cross join lateral jsonb_to_recordset(
      case
        when jsonb_typeof(p.selection_json->'protos') = 'array' then p.selection_json->'protos'
        else '[]'::jsonb
      end
    ) as x(id text, n int)

    union all

    select
      nullif(trim(e.key), '') as unic_id,
      case
        when coalesce(e.value #>> '{}', '') ~ '^-?[0-9]+$'
          then greatest((e.value #>> '{}')::int, 0)
        else 0
      end as want
    from params p
    cross join lateral jsonb_each(
      case
        when jsonb_typeof(p.selection_json->'unics') = 'object' then p.selection_json->'unics'
        else '{}'::jsonb
      end
    ) as e(key, value)

    union all

    select
      nullif(trim(e.key), '') as unic_id,
      case
        when coalesce(e.value #>> '{}', '') ~ '^-?[0-9]+$'
          then greatest((e.value #>> '{}')::int, 0)
        else 0
      end as want
    from params p
    cross join lateral jsonb_each(
      case
        when jsonb_typeof(p.selection_json->'protos') = 'object' then p.selection_json->'protos'
        else '{}'::jsonb
      end
    ) as e(key, value)
  ) src
  where src.unic_id is not null
    and src.want > 0
  group by src.unic_id
),
req_topics as (
  select
    src.topic_id,
    sum(src.want)::int as want
  from (
    select
      nullif(trim(x.id), '') as topic_id,
      greatest(coalesce(x.n, 0), 0)::int as want
    from params p
    cross join lateral jsonb_to_recordset(
      case
        when jsonb_typeof(p.selection_json->'topics') = 'array' then p.selection_json->'topics'
        else '[]'::jsonb
      end
    ) as x(id text, n int)

    union all

    select
      nullif(trim(e.key), '') as topic_id,
      case
        when coalesce(e.value #>> '{}', '') ~ '^-?[0-9]+$'
          then greatest((e.value #>> '{}')::int, 0)
        else 0
      end as want
    from params p
    cross join lateral jsonb_each(
      case
        when jsonb_typeof(p.selection_json->'topics') = 'object' then p.selection_json->'topics'
        else '{}'::jsonb
      end
    ) as e(key, value)
  ) src
  where src.topic_id is not null
    and src.want > 0
  group by src.topic_id
),
req_sections as (
  select
    src.section_id,
    sum(src.want)::int as want
  from (
    select
      nullif(trim(x.id), '') as section_id,
      greatest(coalesce(x.n, 0), 0)::int as want
    from params p
    cross join lateral jsonb_to_recordset(
      case
        when jsonb_typeof(p.selection_json->'sections') = 'array' then p.selection_json->'sections'
        else '[]'::jsonb
      end
    ) as x(id text, n int)

    union all

    select
      nullif(trim(e.key), '') as section_id,
      case
        when coalesce(e.value #>> '{}', '') ~ '^-?[0-9]+$'
          then greatest((e.value #>> '{}')::int, 0)
        else 0
      end as want
    from params p
    cross join lateral jsonb_each(
      case
        when jsonb_typeof(p.selection_json->'sections') = 'object' then p.selection_json->'sections'
        else '{}'::jsonb
      end
    ) as e(key, value)
  ) src
  where src.section_id is not null
    and src.want > 0
  group by src.section_id
),
req_exclude_topics as (
  select distinct
    src.topic_id
  from (
    select
      nullif(
        trim(
          case
            when jsonb_typeof(x.value) = 'string' then trim(both '"' from x.value::text)
            when jsonb_typeof(x.value) = 'object' then coalesce(
              nullif(trim(x.value->>'id'), ''),
              nullif(trim(x.value->>'topic_id'), ''),
              ''
            )
            else ''
          end
        ),
        ''
      ) as topic_id
    from params p
    cross join lateral jsonb_array_elements(
      case
        when jsonb_typeof(p.selection_json->'exclude_topic_ids') = 'array' then p.selection_json->'exclude_topic_ids'
        when jsonb_typeof(p.selection_json->'exclude_topics') = 'array' then p.selection_json->'exclude_topics'
        else '[]'::jsonb
      end
    ) as x(value)
  ) src
  where src.topic_id is not null
),
req_unics_json as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object('id', u.unic_id, 'n', u.want)
      order by u.unic_id
    ),
    '[]'::jsonb
  ) as j
  from req_unics u
),
req_topics_json as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object('id', t.topic_id, 'n', t.want)
      order by t.topic_id
    ),
    '[]'::jsonb
  ) as j
  from req_topics t
),
req_sections_json as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object('id', s.section_id, 'n', s.want)
      order by s.section_id
    ),
    '[]'::jsonb
  ) as j
  from req_sections s
),
req_exclude_topics_json as (
  select coalesce(
    jsonb_agg(topic_id order by topic_id),
    '[]'::jsonb
  ) as j
  from req_exclude_topics
),
req_exclude_topics_array as (
  select coalesce(array_agg(topic_id order by topic_id), '{}'::text[]) as ids
  from req_exclude_topics
),
normalized_selection_json as (
  select jsonb_build_object(
    'unics', (select j from req_unics_json),
    'protos', (select j from req_unics_json),
    'topics', (select j from req_topics_json),
    'sections', (select j from req_sections_json),
    'exclude_topic_ids', (select j from req_exclude_topics_json)
  ) as j
),
filters_json as (
  select jsonb_build_object(
    'old',
    case
      when lower(coalesce(nullif(p.teacher_filters_json->>'old', ''), 'false')) in ('1', 'true', 't', 'yes', 'on')
        then true
      else false
    end,
    'badAcc',
    case
      when lower(coalesce(nullif(p.teacher_filters_json->>'badAcc', ''), 'false')) in ('1', 'true', 't', 'yes', 'on')
        then true
      else false
    end
  ) as j
  from params p
),
resolve_unic_source as (
  select
    p.student_id,
    p.exclude_question_ids,
    f.j as flags_json,
    ru.j as req_json
  from params p
  cross join filters_json f
  cross join req_unics_json ru
  where p.mode = 'resolve'
    and jsonb_array_length(ru.j) > 0
),
resolve_unic_rows as (
  select
    0 as scope_order,
    'unic'::text as scope_kind,
    r.type_id as scope_id,
    r.question_id,
    r.manifest_path,
    coalesce(r.rn, 0)::int as pick_rank
  from resolve_unic_source src
  cross join lateral public.pick_questions_for_teacher_types_v1(
    src.student_id,
    src.req_json,
    src.flags_json,
    src.exclude_question_ids,
    4,
    false,
    null::text
  ) r
  join req_unics ru
    on ru.unic_id = r.type_id
  where coalesce(r.rn, 0) <= ru.want
),
resolve_topic_source as (
  select
    p.student_id,
    p.exclude_question_ids,
    f.j as flags_json,
    rt.j as req_json
  from params p
  cross join filters_json f
  cross join req_topics_json rt
  where p.mode = 'resolve'
    and jsonb_array_length(rt.j) > 0
),
resolve_topic_rows as (
  select
    1 as scope_order,
    'topic'::text as scope_kind,
    r.topic_id as scope_id,
    r.question_id,
    r.manifest_path,
    coalesce(r.rn, 0)::int as pick_rank
  from resolve_topic_source src
  cross join lateral public.pick_questions_for_teacher_topics_v1(
    src.student_id,
    src.req_json,
    src.flags_json,
    src.exclude_question_ids,
    '{}'::text[],
    4,
    false,
    null::text
  ) r
  join req_topics rt
    on rt.topic_id = r.topic_id
  where coalesce(r.rn, 0) <= rt.want
),
resolve_section_source as (
  select
    p.student_id,
    p.exclude_question_ids,
    f.j as flags_json,
    rs.j as req_json,
    ret.ids as exclude_topic_ids
  from params p
  cross join filters_json f
  cross join req_sections_json rs
  cross join req_exclude_topics_array ret
  where p.mode = 'resolve'
    and jsonb_array_length(rs.j) > 0
),
resolve_section_rows as (
  select
    2 as scope_order,
    'section'::text as scope_kind,
    r.section_id as scope_id,
    r.question_id,
    r.manifest_path,
    coalesce(r.rn, 0)::int as pick_rank
  from resolve_section_source src
  cross join lateral public.pick_questions_for_teacher_v2(
    src.student_id,
    src.req_json,
    src.flags_json,
    src.exclude_question_ids,
    src.exclude_topic_ids,
    4,
    false,
    null::text
  ) r
  join req_sections rs
    on rs.section_id = r.section_id
  where coalesce(r.rn, 0) <= rs.want
),
resolve_pick_rows as (
  select * from resolve_unic_rows
  union all
  select * from resolve_topic_rows
  union all
  select * from resolve_section_rows
),
resolve_pick_enriched as (
  select
    r.scope_order,
    r.scope_kind,
    r.scope_id,
    r.pick_rank,
    vq.question_id,
    vq.unic_id,
    vq.subtopic_id as topic_id,
    vq.theme_id as section_id,
    coalesce(
      nullif(trim(r.manifest_path), ''),
      nullif(trim(vq.manifest_path), '')
    ) as manifest_path
  from resolve_pick_rows r
  join visible_questions vq
    on vq.question_id = r.question_id
),
resolve_pick_dedup as (
  select
    x.scope_order,
    x.scope_kind,
    x.scope_id,
    x.pick_rank,
    x.question_id,
    x.unic_id,
    x.topic_id,
    x.section_id,
    x.manifest_path
  from (
    select
      r.*,
      row_number() over (
        partition by r.question_id
        order by r.scope_order, r.pick_rank, r.question_id
      ) as dup_rn
    from resolve_pick_enriched r
  ) x
  where x.dup_rn = 1
),
picked_questions_json as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'question_id', r.question_id,
        'unic_id', r.unic_id,
        'type_id', r.unic_id,
        'subtopic_id', r.topic_id,
        'topic_id', r.topic_id,
        'theme_id', r.section_id,
        'section_id', r.section_id,
        'manifest_path', coalesce(r.manifest_path, ''),
        'scope_kind', r.scope_kind,
        'scope_id', r.scope_id,
        'pick_rank', r.pick_rank
      )
      order by r.scope_order, r.scope_id, r.pick_rank, r.question_id
    ),
    '[]'::jsonb
  ) as j
  from resolve_pick_dedup r
),
dash as (
  select public.student_dashboard_for_teacher_v2(
    p.student_id,
    p.days,
    p.source
  ) as j
  from params p
  where p.mode = 'init'
),
dash_topics as (
  select
    nullif(trim(t->>'topic_id'), '') as topic_id,
    nullif(trim(t->>'last_seen_at'), '') as last_seen_at,
    coalesce((t->'period'->>'total')::int, 0) as period_total,
    coalesce((t->'period'->>'correct')::int, 0) as period_correct,
    case
      when coalesce((t->'period'->>'total')::int, 0) > 0
        then round(
          (coalesce((t->'period'->>'correct')::numeric, 0) * 100.0)
          / greatest(coalesce((t->'period'->>'total')::numeric, 0), 1),
          0
        )::int
      else null
    end as period_pct,
    case
      when coalesce((t->'last10'->>'total')::int, 0) > 0
        then round(
          (coalesce((t->'last10'->>'correct')::numeric, 0) * 100.0)
          / greatest(coalesce((t->'last10'->>'total')::numeric, 0), 1),
          0
        )::int
      else null
    end as last10_pct,
    case
      when coalesce((t->'all_time'->>'total')::int, 0) > 0
        then round(
          (coalesce((t->'all_time'->>'correct')::numeric, 0) * 100.0)
          / greatest(coalesce((t->'all_time'->>'total')::numeric, 0), 1),
          0
        )::int
      else null
    end as all_time_pct
  from dash d,
  lateral jsonb_array_elements(coalesce(d.j->'topics', '[]'::jsonb)) as t
),
topic_coverage as (
  select
    vu.subtopic_id as topic_id,
    count(*) filter (where coalesce(vu.is_counted_in_coverage, true) = true)::int as total_unic_count
  from visible_unics vu
  group by vu.subtopic_id
),
covered_unics as (
  select
    q.subtopic_id as topic_id,
    count(distinct q.unic_id)::int as covered_unic_count
  from public.answer_events ae
  join visible_questions q
    on q.question_id = ae.question_id
  cross join params p
  where p.mode = 'init'
    and ae.student_id = p.student_id
    and (
      p.source = 'all'
      or ae.source = p.source
    )
  group by q.subtopic_id
),
topic_rows as (
  select
    s.theme_id,
    s.subtopic_id as topic_id,
    s.title,
    s.sort_order,
    coalesce(dt.period_total, 0) as period_total,
    coalesce(dt.period_correct, 0) as period_correct,
    dt.period_pct,
    dt.last10_pct,
    dt.all_time_pct,
    dt.last_seen_at,
    coalesce(tc.total_unic_count, 0) as total_unic_count,
    coalesce(cu.covered_unic_count, 0) as covered_unic_count,
    case
      when coalesce(cu.covered_unic_count, 0) > 0 then 'covered'
      else 'uncovered'
    end as coverage_state,
    case
      when coalesce(dt.period_total, 0) = 0 then 'unknown'
      when coalesce(dt.period_pct, 0) < 70 then 'weak'
      else 'ok'
    end as performance_state,
    case
      when nullif(dt.last_seen_at, '') is null then 'unknown'
      when (dt.last_seen_at)::timestamptz < now() - interval '30 days' then 'stale'
      else 'fresh'
    end as freshness_state,
    case
      when coalesce(dt.period_total, 0) = 0 then 'uncovered'
      when coalesce(dt.period_total, 0) < 3 then 'low'
      when coalesce(dt.period_pct, 100) < 70 then 'weak'
      else null
    end as recommendation_reason
  from visible_subtopics s
  left join dash_topics dt
    on dt.topic_id = s.subtopic_id
  left join topic_coverage tc
    on tc.topic_id = s.subtopic_id
  left join covered_unics cu
    on cu.topic_id = s.subtopic_id
),
sections_json as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'section_id', t.theme_id,
        'title', t.title,
        'sort_order', t.sort_order,
        'topics', coalesce(st.topics, '[]'::jsonb)
      )
      order by t.sort_order, t.theme_id
    ),
    '[]'::jsonb
  ) as j
  from visible_themes t
  left join (
    select
      tr.theme_id,
      jsonb_agg(
        jsonb_build_object(
          'topic_id', tr.topic_id,
          'title', tr.title,
          'sort_order', tr.sort_order,
          'state', jsonb_build_object(
            'coverage_state', tr.coverage_state,
            'performance_state', tr.performance_state,
            'freshness_state', tr.freshness_state
          ),
          'stats', jsonb_build_object(
            'period_total', tr.period_total,
            'period_correct', tr.period_correct,
            'period_pct', tr.period_pct,
            'last10_pct', tr.last10_pct,
            'all_time_pct', tr.all_time_pct,
            'last_seen_at', tr.last_seen_at
          ),
          'coverage', jsonb_build_object(
            'covered_unic_count', tr.covered_unic_count,
            'total_unic_count', tr.total_unic_count
          )
        )
        order by tr.sort_order, tr.topic_id
      ) as topics
    from topic_rows tr
    group by tr.theme_id
  ) st
    on st.theme_id = t.theme_id
),
recommendations_json as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'topic_id', tr.topic_id,
        'section_id', tr.theme_id,
        'reason', tr.recommendation_reason,
        'why', case
          when tr.recommendation_reason = 'uncovered' then 'Нет попыток в выбранном периоде.'
          when tr.recommendation_reason = 'low' then format('Мало попыток: %s за период.', tr.period_total)
          when tr.recommendation_reason = 'weak' then format('Точность %s%% за период при %s попытках.', coalesce(tr.period_pct, 0), tr.period_total)
          else ''
        end
      )
      order by
        case tr.recommendation_reason
          when 'weak' then 0
          when 'low' then 1
          when 'uncovered' then 2
          else 9
        end,
        coalesce(tr.period_pct, 999),
        tr.period_total,
        tr.theme_id,
        tr.sort_order,
        tr.topic_id
    ),
    '[]'::jsonb
  ) as j
  from topic_rows tr
  where tr.recommendation_reason is not null
),
catalog_version as (
  select coalesce(max(v.catalog_version), '') as value
  from (
    select catalog_version from visible_themes
    union all
    select catalog_version from visible_subtopics
  ) v
)
select jsonb_build_object(
  'student', jsonb_build_object(
    'student_id', (select student_id from params),
    'days', (select days from params),
    'source', (select source from params)
  ),
  'catalog_version', (select value from catalog_version),
  'screen', jsonb_build_object(
    'mode', (select mode from params),
    'can_pick', true
  ),
  'sections',
  case
    when (select mode from params) = 'init' then (select j from sections_json)
    else '[]'::jsonb
  end,
  'recommendations',
  case
    when (select mode from params) = 'init' then (select j from recommendations_json)
    else '[]'::jsonb
  end,
  'selection', jsonb_build_object(
    'normalized',
    case
      when (select mode from params) = 'resolve' then (select j from normalized_selection_json)
      else (select selection_json from params)
    end
  ),
  'picked_questions',
  case
    when (select mode from params) = 'resolve' then (select j from picked_questions_json)
    else '[]'::jsonb
  end,
  'dashboard',
  case
    when (select mode from params) = 'init' then coalesce((select j from dash), '{}'::jsonb)
    else null
  end,
  'generated_at', now()
);
$function$;

revoke execute on function public.teacher_picking_screen_v1(
  uuid, text, integer, text, jsonb, jsonb, text[]
) from anon;

grant execute on function public.teacher_picking_screen_v1(
  uuid, text, integer, text, jsonb, jsonb, text[]
) to authenticated;

commit;
