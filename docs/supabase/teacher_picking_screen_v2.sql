-- teacher_picking_screen_v2.sql
-- Stage 3.5 canonical backend-driven screen contract for teacher manual picking.
-- Designed from docs/navigation/teacher_picking_screen_v2_spec.md.

begin;

create or replace function public.teacher_picking_screen_v2(
  p_student_id uuid,
  p_mode text default 'init'::text,
  p_days integer default 30,
  p_source text default 'all'::text,
  p_filter_id text default null::text,
  p_selection jsonb default '{}'::jsonb,
  p_request jsonb default '{}'::jsonb,
  p_seed text default null::text,
  p_exclude_question_ids text[] default null::text[]
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
set row_security to 'off'
as $function$
declare
  v_uid uuid := auth.uid();
  v_mode text := lower(coalesce(nullif(p_mode, ''), 'init'));
  v_days integer := greatest(1, least(coalesce(p_days, 30), 3650));
  v_source text := lower(coalesce(nullif(p_source, ''), 'all'));
  v_filter_id text := lower(nullif(p_filter_id, ''));
  v_filter_label text;
  v_selection jsonb := coalesce(p_selection, '{}'::jsonb);
  v_request jsonb := coalesce(p_request, '{}'::jsonb);
  v_scope_kind text := lower(coalesce(nullif(trim(p_request->>'scope_kind'), ''), ''));
  v_scope_id text := nullif(trim(p_request->>'scope_id'), '');
  v_requested_n integer := case
    when coalesce(p_request->>'n', '') ~ '^-?[0-9]+$'
      then greatest((p_request->>'n')::int, 0)
    else 0
  end;
  v_empty_resolve boolean := false;
  v_session_seed text;
  v_payload jsonb;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_student_id is null then
    raise exception 'BAD_STUDENT_ID';
  end if;

  if not public.is_teacher_for_student(p_student_id) then
    raise exception 'ACCESS_DENIED';
  end if;

  if v_mode not in ('init', 'resolve') then
    raise exception 'BAD_MODE';
  end if;

  if v_source not in ('all', 'hw', 'test') then
    raise exception 'BAD_SOURCE';
  end if;

  if v_filter_id is not null and v_filter_id not in ('unseen_low', 'stale', 'unstable') then
    raise exception 'BAD_FILTER_ID';
  end if;

  v_filter_label := case v_filter_id
    when 'unseen_low' then 'Не решал / мало решал'
    when 'stale' then 'Давно решал'
    when 'unstable' then 'Нестабильно решает'
    else null
  end;

  if v_mode = 'resolve' then
    if v_scope_kind = '' then
      v_empty_resolve := true;
    elsif v_scope_kind not in ('proto', 'topic', 'section', 'global_all') then
      raise exception 'BAD_SCOPE_KIND';
    elsif v_scope_kind in ('proto', 'topic', 'section') and v_scope_id is null then
      raise exception 'BAD_SCOPE_ID';
    elsif v_scope_kind in ('proto', 'topic', 'section') and v_requested_n <= 0 then
      v_empty_resolve := true;
    end if;
  end if;

  v_session_seed := coalesce(
    nullif(p_seed, ''),
    md5(
      p_student_id::text
      || '|' || v_source
      || '|' || coalesce(v_filter_id, 'none')
      || '|' || v_selection::text
      || '|' || v_request::text
    )
  );

  with params as (
    select
      p_student_id as student_id,
      v_mode as mode,
      v_days as days,
      v_source as source,
      v_filter_id as filter_id,
      v_filter_label as filter_label,
      v_selection as selection_json,
      v_request as request_json,
      v_scope_kind as scope_kind,
      v_scope_id as scope_id,
      v_requested_n as requested_n,
      v_empty_resolve as empty_resolve,
      v_session_seed as session_seed,
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
      s.catalog_version,
      vt.sort_order as theme_sort_order
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
      u.sort_order,
      u.catalog_version,
      vs.theme_sort_order,
      vs.sort_order as subtopic_sort_order
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
      coalesce(nullif(trim(q.manifest_path), ''), '') as manifest_path,
      q.catalog_version
    from public.catalog_question_dim q
    join visible_unics vu
      on vu.unic_id = q.unic_id
     and vu.subtopic_id = q.subtopic_id
     and vu.theme_id = q.theme_id
    where coalesce(q.is_enabled, true) = true
      and coalesce(q.is_hidden, false) = false
  ),
  proto_state as (
    select
      ps.*,
      vu.sort_order as proto_sort_order,
      vu.theme_sort_order,
      vu.subtopic_sort_order
    from params p
    cross join lateral public.student_proto_state_v1(p.student_id, p.source) ps
    join visible_unics vu
      on vu.unic_id = ps.unic_id
     and vu.subtopic_id = ps.subtopic_id
     and vu.theme_id = ps.theme_id
  ),
  topic_state as (
    select
      ts.*,
      vs.title as topic_title,
      vs.sort_order as topic_sort_order,
      vs.theme_sort_order
    from params p
    cross join lateral public.student_topic_state_v1(p.student_id, p.source) ts
    join visible_subtopics vs
      on vs.subtopic_id = ts.subtopic_id
     and vs.theme_id = ts.theme_id
  ),
  question_stats as (
    select
      sqs.question_id,
      coalesce(sqs.total, 0)::int as total
    from params p
    join public.student_question_stats sqs
      on sqs.student_id = p.student_id
  ),
  selection_sections as (
    select
      src.section_id,
      sum(src.want)::int as n
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
  selection_topics as (
    select
      src.topic_id,
      sum(src.want)::int as n
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
  selection_protos as (
    select
      src.unic_id,
      sum(src.want)::int as n
    from (
      select
        nullif(trim(x.id), '') as unic_id,
        greatest(coalesce(x.n, 0), 0)::int as want
      from params p
      cross join lateral jsonb_to_recordset(
        case
          when jsonb_typeof(p.selection_json->'protos') = 'array' then p.selection_json->'protos'
          when jsonb_typeof(p.selection_json->'unics') = 'array' then p.selection_json->'unics'
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
          when jsonb_typeof(p.selection_json->'protos') = 'object' then p.selection_json->'protos'
          when jsonb_typeof(p.selection_json->'unics') = 'object' then p.selection_json->'unics'
          else '{}'::jsonb
        end
      ) as e(key, value)
    ) src
    where src.unic_id is not null
      and src.want > 0
    group by src.unic_id
  ),
  selection_extra_excluded_topics as (
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
          else '[]'::jsonb
        end
      ) as x(value)
    ) src
    where src.topic_id is not null
  ),
  selected_topic_exclusions as (
    select topic_id from selection_topics
    union
    select topic_id from selection_extra_excluded_topics
  ),
  normalized_sections_json as (
    select coalesce(jsonb_agg(jsonb_build_object('id', s.section_id, 'n', s.n) order by s.section_id), '[]'::jsonb) as j
    from selection_sections s
  ),
  normalized_topics_json as (
    select coalesce(jsonb_agg(jsonb_build_object('id', t.topic_id, 'n', t.n) order by t.topic_id), '[]'::jsonb) as j
    from selection_topics t
  ),
  normalized_protos_json as (
    select coalesce(jsonb_agg(jsonb_build_object('id', u.unic_id, 'n', u.n) order by u.unic_id), '[]'::jsonb) as j
    from selection_protos u
  ),
  normalized_excluded_topics_json as (
    select coalesce(jsonb_agg(topic_id order by topic_id), '[]'::jsonb) as j
    from selected_topic_exclusions
  ),
  normalized_selection as (
    select jsonb_build_object(
      'sections', (select j from normalized_sections_json),
      'topics', (select j from normalized_topics_json),
      'protos', (select j from normalized_protos_json),
      'exclude_topic_ids', (select j from normalized_excluded_topics_json)
    ) as j
  ),
  section_filter_counts as (
    select
      ts.theme_id as section_id,
      coalesce(sum(ts.not_seen_proto_count + ts.low_seen_proto_count), 0)::int as unseen_low_count,
      coalesce(sum(ts.stale_proto_count), 0)::int as stale_count,
      coalesce(sum(ts.unstable_proto_count), 0)::int as unstable_count
    from topic_state ts
    group by ts.theme_id
  ),
  topic_rows_for_init as (
    select
      ts.theme_id as section_id,
      ts.subtopic_id as topic_id,
      ts.topic_title as title,
      ts.topic_sort_order as sort_order,
      case when ts.covered_proto_count > 0 then 'covered' else 'uncovered' end as coverage_state,
      case
        when ts.attempt_count_total = 0 then 'unknown'
        when ts.is_unstable = true or coalesce(ts.accuracy, 1.0) < 0.7 then 'weak'
        else 'ok'
      end as performance_state,
      case
        when ts.last_attempt_at is null then 'unknown'
        when ts.last_attempt_at < now() - interval '30 days' then 'stale'
        else 'fresh'
      end as freshness_state,
      ts.attempt_count_total,
      ts.correct_count_total,
      case when ts.accuracy is not null then round(ts.accuracy * 100.0, 0)::int else null::int end as all_time_pct,
      ts.last_attempt_at,
      ts.covered_proto_count,
      ts.visible_proto_count,
      ts.is_not_seen,
      ts.is_low_seen,
      ts.is_enough_seen,
      ts.is_stale,
      ts.is_unstable,
      (ts.not_seen_proto_count + ts.low_seen_proto_count)::int as unseen_low_count,
      ts.stale_proto_count as stale_count,
      ts.unstable_proto_count as unstable_count
    from topic_state ts
  ),
  sections_json as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'section_id', vt.theme_id,
          'title', vt.title,
          'sort_order', vt.sort_order,
          'filter_counts', jsonb_build_object(
            'unseen_low', coalesce(sfc.unseen_low_count, 0),
            'stale', coalesce(sfc.stale_count, 0),
            'unstable', coalesce(sfc.unstable_count, 0)
          ),
          'topics', coalesce(tp.topics, '[]'::jsonb)
        )
        order by vt.sort_order, vt.theme_id
      ),
      '[]'::jsonb
    ) as j
    from visible_themes vt
    left join section_filter_counts sfc
      on sfc.section_id = vt.theme_id
    left join (
      select
        tr.section_id,
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
            'progress', jsonb_build_object(
              'attempt_count_total', tr.attempt_count_total,
              'correct_count_total', tr.correct_count_total,
              'all_time_pct', tr.all_time_pct,
              'last_seen_at', tr.last_attempt_at
            ),
            'coverage', jsonb_build_object(
              'covered_proto_count', tr.covered_proto_count,
              'total_proto_count', tr.visible_proto_count
            ),
            'topic_state', jsonb_build_object(
              'is_not_seen', tr.is_not_seen,
              'is_low_seen', tr.is_low_seen,
              'is_enough_seen', tr.is_enough_seen,
              'is_stale', tr.is_stale,
              'is_unstable', tr.is_unstable
            ),
            'filter_counts', jsonb_build_object(
              'unseen_low', tr.unseen_low_count,
              'stale', tr.stale_count,
              'unstable', tr.unstable_count
            )
          )
          order by tr.sort_order, tr.topic_id
        ) as topics
      from topic_rows_for_init tr
      group by tr.section_id
    ) tp
      on tp.section_id = vt.theme_id
  ),
  recommendation_rows as (
    select
      tr.section_id,
      tr.topic_id,
      case
        when tr.is_unstable then 'unstable'
        when tr.is_stale then 'stale'
        when tr.is_not_seen or tr.is_low_seen then 'unseen_low'
        else null
      end as filter_id,
      case
        when tr.is_unstable then 'topic_unstable'
        when tr.is_stale then 'topic_stale'
        when tr.is_not_seen then 'topic_not_seen'
        when tr.is_low_seen then 'topic_low_seen'
        else null
      end as reason_id,
      case
        when tr.is_unstable then 'В подтеме виден общий weak-сигнал по ранее освоенным прототипам.'
        when tr.is_stale then 'Подтема давно не повторялась по ранее освоенному материалу.'
        when tr.is_not_seen then 'Подтема ещё не обследована.'
        when tr.is_low_seen then 'Подтема обследована недостаточно.'
        else null
      end as why,
      case
        when tr.is_unstable then 0
        when tr.is_stale then 1
        when tr.is_not_seen then 2
        when tr.is_low_seen then 3
        else 9
      end as priority_order,
      tr.sort_order as topic_sort_order
    from topic_rows_for_init tr
    where tr.is_unstable or tr.is_stale or tr.is_not_seen or tr.is_low_seen
  ),
  recommendations_json as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'topic_id', rr.topic_id,
          'section_id', rr.section_id,
          'filter_id', rr.filter_id,
          'reason_id', rr.reason_id,
          'why', rr.why
        )
        order by rr.priority_order, rr.section_id, rr.topic_sort_order, rr.topic_id
      ),
      '[]'::jsonb
    ) as j
    from recommendation_rows rr
  ),
  catalog_version as (
    select coalesce(max(v.catalog_version), '') as value
    from (
      select catalog_version from visible_themes
      union all
      select catalog_version from visible_subtopics
      union all
      select catalog_version from visible_unics
      union all
      select catalog_version from visible_questions
    ) v
  ),
  candidate_base as (
    select
      ps.student_id,
      ps.source,
      ps.theme_id,
      ps.subtopic_id,
      ps.unic_id,
      ps.attempt_count_total,
      ps.correct_count_total,
      ps.unique_question_ids_seen,
      ps.last_attempt_at,
      ps.has_correct,
      ps.has_independent_correct,
      ps.covered,
      ps.solved,
      ps.accuracy,
      ps.is_not_seen,
      ps.is_low_seen,
      ps.is_enough_seen,
      ps.is_weak,
      ps.is_stale,
      ps.is_unstable,
      ts.is_not_seen as topic_is_not_seen,
      ts.is_low_seen as topic_is_low_seen,
      ts.is_stale as topic_is_stale,
      ts.is_unstable as topic_is_unstable
    from proto_state ps
    join topic_state ts
      on ts.student_id = ps.student_id
     and ts.source = ps.source
     and ts.theme_id = ps.theme_id
     and ts.subtopic_id = ps.subtopic_id
  ),
  proto_request_status as (
    select
      p.scope_id as requested_proto_id,
      exists(
        select 1
        from candidate_base cb
        where cb.unic_id = p.scope_id
      ) as proto_exists,
      exists(
        select 1
        from candidate_base cb
        where cb.unic_id = p.scope_id
          and case
            when p.filter_id is null then true
            when p.filter_id = 'unseen_low' then cb.is_not_seen or cb.is_low_seen
            when p.filter_id = 'stale' then cb.is_stale
            when p.filter_id = 'unstable' then cb.is_unstable
            else false
          end
      ) as proto_is_eligible
    from params p
    where p.mode = 'resolve'
      and p.scope_kind = 'proto'
      and not p.empty_resolve
  ),
  proto_pick_rows as (
    select
      cb.unic_id as proto_id,
      cb.subtopic_id as topic_id,
      cb.theme_id as section_id,
      'proto'::text as scope_kind,
      p.scope_id as scope_id,
      p.filter_id,
      1::int as pick_rank,
      p.requested_n as question_limit
    from params p
    join candidate_base cb
      on cb.unic_id = p.scope_id
    where p.mode = 'resolve'
      and p.scope_kind = 'proto'
      and not p.empty_resolve
      and case
        when p.filter_id is null then true
        when p.filter_id = 'unseen_low' then cb.is_not_seen or cb.is_low_seen
        when p.filter_id = 'stale' then cb.is_stale
        when p.filter_id = 'unstable' then cb.is_unstable
        else false
      end
  ),
  topic_candidate_ranked as (
    select
      cb.unic_id as proto_id,
      cb.subtopic_id as topic_id,
      cb.theme_id as section_id,
      'topic'::text as scope_kind,
      p.scope_id as scope_id,
      p.filter_id,
      1::int as question_limit,
      row_number() over (
        order by
          case
            when p.filter_id = 'unseen_low' then
              case when cb.is_not_seen then 1 when cb.is_low_seen then 2 else 99 end
            when p.filter_id in ('stale', 'unstable') then 1
            else 0
          end,
          case
            when p.filter_id = 'stale' then
              case
                when cb.last_attempt_at < now() - interval '90 days' then 0
                when cb.last_attempt_at < now() - interval '60 days' then 1
                when cb.last_attempt_at < now() - interval '30 days' then 2
                else 9
              end
            else 0
          end,
          case when p.filter_id = 'unstable' then coalesce(cb.accuracy, 1.0) else 0::numeric end asc,
          case when p.filter_id = 'unstable' then cb.last_attempt_at else null::timestamptz end desc nulls last,
          case when p.filter_id = 'unstable' then cb.attempt_count_total else 0 end desc,
          md5(p.session_seed || '|proto|' || coalesce(p.filter_id, 'none') || '|topic|' || p.scope_id || '|' || cb.unic_id)
      )::int as pick_rank
    from params p
    join candidate_base cb
      on cb.subtopic_id = p.scope_id
    left join selection_protos sp
      on sp.unic_id = cb.unic_id
    where p.mode = 'resolve'
      and p.scope_kind = 'topic'
      and not p.empty_resolve
      and sp.unic_id is null
      and case
        when p.filter_id is null then true
        when p.filter_id = 'unseen_low' then cb.is_not_seen or cb.is_low_seen
        when p.filter_id = 'stale' then cb.is_stale
        when p.filter_id = 'unstable' then cb.is_unstable
        else false
      end
  ),
  topic_pick_rows as (
    select
      tcr.proto_id,
      tcr.topic_id,
      tcr.section_id,
      tcr.scope_kind,
      tcr.scope_id,
      tcr.filter_id,
      tcr.pick_rank,
      tcr.question_limit
    from topic_candidate_ranked tcr
    cross join params p
    where tcr.pick_rank <= p.requested_n
  ),
  section_candidate_ranked as (
    select
      cb.unic_id as proto_id,
      cb.subtopic_id as topic_id,
      cb.theme_id as section_id,
      'section'::text as scope_kind,
      p.scope_id as scope_id,
      p.filter_id,
      1::int as question_limit,
      row_number() over (
        order by
          case
            when p.filter_id = 'unseen_low' then
              case
                when cb.topic_is_not_seen and cb.is_not_seen then 1
                when cb.is_not_seen then 2
                when cb.topic_is_low_seen and cb.is_low_seen then 3
                when cb.is_low_seen then 4
                else 99
              end
            when p.filter_id = 'stale' then
              case when cb.topic_is_stale and cb.is_stale then 1 when cb.is_stale then 2 else 99 end
            when p.filter_id = 'unstable' then
              case when cb.topic_is_unstable and cb.is_unstable then 1 when cb.is_unstable then 2 else 99 end
            else 0
          end,
          case
            when p.filter_id = 'stale' then
              case
                when cb.last_attempt_at < now() - interval '90 days' then 0
                when cb.last_attempt_at < now() - interval '60 days' then 1
                when cb.last_attempt_at < now() - interval '30 days' then 2
                else 9
              end
            else 0
          end,
          case when p.filter_id = 'unstable' then coalesce(cb.accuracy, 1.0) else 0::numeric end asc,
          case when p.filter_id = 'unstable' then cb.last_attempt_at else null::timestamptz end desc nulls last,
          case when p.filter_id = 'unstable' then cb.attempt_count_total else 0 end desc,
          md5(p.session_seed || '|proto|' || coalesce(p.filter_id, 'none') || '|section|' || p.scope_id || '|' || cb.unic_id)
      )::int as pick_rank
    from params p
    join candidate_base cb
      on cb.theme_id = p.scope_id
    left join selected_topic_exclusions et
      on et.topic_id = cb.subtopic_id
    left join selection_protos sp
      on sp.unic_id = cb.unic_id
    where p.mode = 'resolve'
      and p.scope_kind = 'section'
      and not p.empty_resolve
      and et.topic_id is null
      and sp.unic_id is null
      and case
        when p.filter_id is null then true
        when p.filter_id = 'unseen_low' then cb.is_not_seen or cb.is_low_seen
        when p.filter_id = 'stale' then cb.is_stale
        when p.filter_id = 'unstable' then cb.is_unstable
        else false
      end
  ),
  section_pick_rows as (
    select
      scr.proto_id,
      scr.topic_id,
      scr.section_id,
      scr.scope_kind,
      scr.scope_id,
      scr.filter_id,
      scr.pick_rank,
      scr.question_limit
    from section_candidate_ranked scr
    cross join params p
    where scr.pick_rank <= p.requested_n
  ),
  global_candidate_ranked as (
    select
      cb.unic_id as proto_id,
      cb.subtopic_id as topic_id,
      cb.theme_id as section_id,
      'global_all'::text as scope_kind,
      null::text as scope_id,
      p.filter_id,
      1::int as question_limit,
      row_number() over (
        partition by cb.theme_id
        order by
          case
            when p.filter_id = 'unseen_low' then
              case
                when cb.topic_is_not_seen and cb.is_not_seen then 1
                when cb.is_not_seen then 2
                when cb.topic_is_low_seen and cb.is_low_seen then 3
                when cb.is_low_seen then 4
                else 99
              end
            when p.filter_id = 'stale' then
              case when cb.topic_is_stale and cb.is_stale then 1 when cb.is_stale then 2 else 99 end
            when p.filter_id = 'unstable' then
              case when cb.topic_is_unstable and cb.is_unstable then 1 when cb.is_unstable then 2 else 99 end
            else 0
          end,
          case
            when p.filter_id = 'stale' then
              case
                when cb.last_attempt_at < now() - interval '90 days' then 0
                when cb.last_attempt_at < now() - interval '60 days' then 1
                when cb.last_attempt_at < now() - interval '30 days' then 2
                else 9
              end
            else 0
          end,
          case when p.filter_id = 'unstable' then coalesce(cb.accuracy, 1.0) else 0::numeric end asc,
          case when p.filter_id = 'unstable' then cb.last_attempt_at else null::timestamptz end desc nulls last,
          case when p.filter_id = 'unstable' then cb.attempt_count_total else 0 end desc,
          md5(p.session_seed || '|proto|' || coalesce(p.filter_id, 'none') || '|global_all|' || cb.theme_id || '|' || cb.unic_id)
      )::int as pick_rank
    from params p
    join candidate_base cb
      on true
    left join selected_topic_exclusions et
      on et.topic_id = cb.subtopic_id
    left join selection_protos sp
      on sp.unic_id = cb.unic_id
    where p.mode = 'resolve'
      and p.scope_kind = 'global_all'
      and not p.empty_resolve
      and et.topic_id is null
      and sp.unic_id is null
      and case
        when p.filter_id is null then true
        when p.filter_id = 'unseen_low' then cb.is_not_seen or cb.is_low_seen
        when p.filter_id = 'stale' then cb.is_stale
        when p.filter_id = 'unstable' then cb.is_unstable
        else false
      end
  ),
  global_pick_rows as (
    select
      gcr.proto_id,
      gcr.topic_id,
      gcr.section_id,
      gcr.scope_kind,
      gcr.scope_id,
      gcr.filter_id,
      1::int as pick_rank,
      gcr.question_limit
    from global_candidate_ranked gcr
    where gcr.pick_rank = 1
  ),
  selected_proto_rows as (
    select * from proto_pick_rows
    union all
    select * from topic_pick_rows
    union all
    select * from section_pick_rows
    union all
    select * from global_pick_rows
  ),
  question_candidates as (
    select
      spr.proto_id,
      spr.topic_id,
      spr.section_id,
      spr.scope_kind,
      spr.scope_id,
      spr.filter_id,
      spr.pick_rank,
      spr.question_limit,
      vq.question_id,
      vq.manifest_path,
      row_number() over (
        partition by spr.proto_id
        order by
          case when coalesce(qs.total, 0) = 0 then 0 else 1 end,
          md5(
            p.session_seed
            || '|question|' || coalesce(spr.filter_id, 'none')
            || '|' || spr.scope_kind
            || '|' || coalesce(spr.scope_id, spr.section_id)
            || '|' || vq.question_id
          )
      )::int as question_rn
    from selected_proto_rows spr
    join visible_questions vq
      on vq.unic_id = spr.proto_id
    cross join params p
    left join question_stats qs
      on qs.question_id = vq.question_id
    where not (vq.question_id = any(p.exclude_question_ids))
  ),
  picked_questions_rows as (
    select
      qc.question_id,
      qc.proto_id,
      qc.topic_id,
      qc.section_id,
      qc.manifest_path,
      qc.scope_kind,
      qc.scope_id,
      qc.filter_id,
      qc.pick_rank
    from question_candidates qc
    where qc.question_rn <= qc.question_limit
  ),
  picked_questions_json as (
    select
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'question_id', pqr.question_id,
            'proto_id', pqr.proto_id,
            'topic_id', pqr.topic_id,
            'section_id', pqr.section_id,
            'manifest_path', pqr.manifest_path,
            'scope_kind', pqr.scope_kind,
            'scope_id', pqr.scope_id,
            'filter_id', pqr.filter_id,
            'pick_rank', pqr.pick_rank
          )
          order by pqr.section_id, pqr.topic_id, pqr.pick_rank, pqr.question_id
        ),
        '[]'::jsonb
      ) as j,
      count(*)::int as returned_n
    from picked_questions_rows pqr
  ),
  requested_n_meta as (
    select
      case
        when p.mode <> 'resolve' or p.empty_resolve then 0
        when p.scope_kind = 'global_all' then (select count(*)::int from visible_themes)
        else p.requested_n
      end as requested_n
    from params p
  ),
  shortage_json as (
    select jsonb_build_object(
      'requested_n', rn.requested_n,
      'returned_n', pq.returned_n,
      'is_shortage', (pq.returned_n < rn.requested_n),
      'reason_id',
      case
        when pq.returned_n < rn.requested_n and p.filter_id is not null then 'insufficient_filter_candidates'
        when pq.returned_n < rn.requested_n then 'insufficient_candidates'
        else null
      end,
      'message',
      case
        when pq.returned_n < rn.requested_n and p.filter_label is not null then
          format('Подобрано %s из %s по фильтру "%s".', pq.returned_n, rn.requested_n, p.filter_label)
        when pq.returned_n < rn.requested_n then
          format('Подобрано %s из %s.', pq.returned_n, rn.requested_n)
        else null
      end
    ) as j
    from params p
    cross join requested_n_meta rn
    cross join picked_questions_json pq
  ),
  warnings_rows as (
    select
      'empty_resolve_request'::text as code,
      'Resolve запрос пустой: ничего не подобрано.'::text as message
    from params p
    where p.mode = 'resolve'
      and p.empty_resolve

    union all

    select
      'selected_proto_not_eligible_for_filter',
      case
        when p.filter_label is not null then format('Этот прототип не попадает в фильтр "%s".', p.filter_label)
        else 'Этот прототип недоступен для текущего подбора.'
      end
    from params p
    join proto_request_status prs
      on true
    where p.mode = 'resolve'
      and p.scope_kind = 'proto'
      and not p.empty_resolve
      and prs.proto_exists = true
      and prs.proto_is_eligible = false

    union all

    select
      'no_candidates_in_scope',
      case
        when p.filter_label is not null then format('В выбранном scope нет кандидатов по фильтру "%s".', p.filter_label)
        else 'В выбранном scope нет доступных кандидатов.'
      end
    from params p
    cross join picked_questions_json pq
    where p.mode = 'resolve'
      and not p.empty_resolve
      and pq.returned_n = 0
      and not exists (
        select 1
        from proto_request_status prs
        where p.scope_kind = 'proto'
          and prs.proto_exists = true
          and prs.proto_is_eligible = false
      )
  ),
  warnings_json as (
    select coalesce(
      jsonb_agg(jsonb_build_object('code', wr.code, 'message', wr.message) order by wr.code),
      '[]'::jsonb
    ) as j
    from warnings_rows wr
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
      'can_pick', true,
      'session_seed', (select session_seed from params),
      'supported_filters', jsonb_build_array('unseen_low', 'stale', 'unstable')
    ),
    'filter', jsonb_build_object(
      'filter_id', (select filter_id from params),
      'label', (select filter_label from params)
    ),
    'sections', (select j from sections_json),
    'recommendations', (select j from recommendations_json),
    'selection', jsonb_build_object(
      'normalized', (select j from normalized_selection),
      'request', jsonb_build_object(
        'scope_kind', (select scope_kind from params),
        'scope_id', (select scope_id from params),
        'n', (select requested_n from params)
      )
    ),
    'picked_questions', (select j from picked_questions_json),
    'shortage', (select j from shortage_json),
    'warnings', (select j from warnings_json),
    'generated_at', now()
  )
  into v_payload
  from params;

  return v_payload;
end;
$function$;

revoke execute on function public.teacher_picking_screen_v2(
  uuid, text, integer, text, text, jsonb, jsonb, text, text[]
) from anon;

grant execute on function public.teacher_picking_screen_v2(
  uuid, text, integer, text, text, jsonb, jsonb, text, text[]
) to authenticated;

commit;
