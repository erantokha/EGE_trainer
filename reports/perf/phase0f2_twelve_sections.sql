-- РАЗВЁРНУТЫЙ план resolve (inline-тело, row_security off). READ-ONLY (ROLLBACK).
-- Скопируй ВЕСЬ файл в Supabase SQL Editor → Run → пришли весь вывод.

-- ===== F2: 12 секций =====
BEGIN;
SET LOCAL row_security TO off;
SET LOCAL search_path TO public;
EXPLAIN (ANALYZE, BUFFERS)
with params as (
  select
    'f1d03f75-08ad-48e6-9128-8f69afefe81e'::uuid as student_id,
    'all'::text as source, 'weak_spots'::text as filter_id, 'Слабые места'::text as filter_label,
    '{}'::jsonb as selection_json, (select jsonb_agg(jsonb_build_object('scope_kind','section','scope_id', theme_id, 'n', 7)) from public.catalog_theme_dim where coalesce(is_enabled,true) and not coalesce(is_hidden,false)) as requests_json,
    'fixed-seed-fff'::text as session_seed, '{}'::text[] as exclude_question_ids, true as complete
  ),
  request_items_raw as (
    select
      a.ordinality::int as request_order,
      a.value as request_json
    from params p
    cross join lateral jsonb_array_elements(
      case
        when jsonb_typeof(p.requests_json) = 'array' then p.requests_json
        else '[]'::jsonb
      end
    ) with ordinality as a(value, ordinality)
  ),
  request_items as (
    select
      rir.request_order,
      lower(coalesce(nullif(trim(rir.request_json->>'scope_kind'), ''), '')) as scope_kind,
      nullif(trim(rir.request_json->>'scope_id'), '') as scope_id,
      case
        when coalesce(rir.request_json->>'n', '') ~ '^-?[0-9]+$'
          then greatest((rir.request_json->>'n')::int, 0)
        else 0
      end as requested_n
    from request_items_raw rir
  ),
  valid_request_items as (
    select
      ri.request_order,
      ri.scope_kind,
      ri.scope_id,
      case
        when ri.scope_kind = 'global_all' then 1
        else ri.requested_n
      end as requested_n
    from request_items ri
    where ri.scope_kind in ('proto', 'topic', 'section', 'global_all')
      and (
        (ri.scope_kind = 'global_all')
        or (ri.scope_id is not null and ri.requested_n > 0)
      )
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
  -- ── S2/S3 РЕРАЙТ: состояние инлайном, ОДИН скан answer_events, без last3, без двойного
  -- вызова student_proto_state_v1/student_topic_state_v1. Флаги скопированы дословно. ──
  proto_events as (
    select
      vq.unic_id,
      count(*)::int                                   as attempt_count_total,
      count(*) filter (where ae.correct)::int         as correct_count_total,
      count(distinct ae.question_id)::int             as unique_question_ids_seen,
      max(coalesce(ae.occurred_at, ae.created_at))    as last_attempt_at
    from params p
    join public.answer_events ae
      on ae.student_id = p.student_id
     and (p.source = 'all' or ae.source = p.source)
    join visible_questions vq
      on vq.question_id = ae.question_id
    group by vq.unic_id
  ),
  proto_metrics as (
    select
      p.student_id,
      p.source,
      vu.theme_id,
      vu.subtopic_id,
      vu.unic_id,
      coalesce(pe.attempt_count_total, 0)::int        as attempt_count_total,
      coalesce(pe.correct_count_total, 0)::int        as correct_count_total,
      coalesce(pe.unique_question_ids_seen, 0)::int   as unique_question_ids_seen,
      pe.last_attempt_at,
      case when coalesce(pe.attempt_count_total, 0) > 0
           then (coalesce(pe.correct_count_total,0)::numeric / pe.attempt_count_total::numeric)
           else null::numeric end                     as accuracy
    from params p
    cross join visible_unics vu
    left join proto_events pe on pe.unic_id = vu.unic_id
  ),
  proto_state as (
    select
      m.student_id,
      m.source,
      m.theme_id,
      m.subtopic_id,
      m.unic_id,
      m.attempt_count_total,
      m.correct_count_total,
      m.unique_question_ids_seen,
      m.last_attempt_at,
      (m.correct_count_total > 0)                     as has_correct,
      (m.correct_count_total > 0)                     as has_independent_correct,
      (m.attempt_count_total > 0)                     as covered,
      (m.correct_count_total > 0)                     as solved,
      m.accuracy,
      (m.unique_question_ids_seen = 0)                as is_not_seen,
      (m.unique_question_ids_seen = 1)                as is_low_seen,
      (m.unique_question_ids_seen >= 2)               as is_enough_seen,
      (m.attempt_count_total >= 2 and m.accuracy < 0.7) as is_weak,
      (
        m.correct_count_total > 0
        and m.attempt_count_total >= 2
        and not (m.attempt_count_total >= 2 and m.accuracy < 0.7)
        and m.last_attempt_at is not null
        and m.last_attempt_at < now() - interval '30 days'
      )                                               as is_stale,
      (
        m.correct_count_total > 0
        and m.attempt_count_total >= 2
        and m.accuracy < 0.7
      )                                               as is_unstable
    from proto_metrics m
  ),
  topic_rollup as (
    select
      ps.student_id,
      ps.source,
      ps.theme_id,
      ps.subtopic_id,
      count(*) filter (where ps.covered)::int                                   as unique_proto_seen_count,
      count(*) filter (where ps.has_independent_correct)::int                   as mastered_proto_count,
      coalesce(sum(ps.attempt_count_total) filter (where ps.has_independent_correct), 0)::int as mastered_attempt_count_total,
      coalesce(sum(ps.correct_count_total) filter (where ps.has_independent_correct), 0)::int as mastered_correct_count_total,
      max(ps.last_attempt_at) filter (where ps.has_independent_correct)         as last_mastered_attempt_at,
      count(*) filter (where ps.is_unstable)::int                              as unstable_proto_count
    from proto_state ps
    group by ps.student_id, ps.source, ps.theme_id, ps.subtopic_id
  ),
  topic_state as (
    select
      tr.student_id,
      tr.source,
      tr.theme_id,
      tr.subtopic_id,
      (tr.unique_proto_seen_count = 0)                                          as is_not_seen,
      (tr.unique_proto_seen_count > 0 and tr.unique_proto_seen_count < 3)       as is_low_seen,
      (
        tr.mastered_proto_count > 0
        and tr.mastered_attempt_count_total >= 2
        and (case when tr.mastered_attempt_count_total > 0
                  then (tr.mastered_correct_count_total::numeric / tr.mastered_attempt_count_total::numeric)
                  else null::numeric end) >= 0.7
        and tr.last_mastered_attempt_at is not null
        and tr.last_mastered_attempt_at < now() - interval '30 days'
      )                                                                         as is_stale,
      (
        tr.unstable_proto_count > 0
        and tr.mastered_proto_count > 0
        and tr.mastered_attempt_count_total >= 2
        and (case when tr.mastered_attempt_count_total > 0
                  then (tr.mastered_correct_count_total::numeric / tr.mastered_attempt_count_total::numeric)
                  else null::numeric end) < 0.7
      )                                                                         as is_unstable
    from topic_rollup tr
  ),
  question_stats as (
    select
      sqs.question_id,
      coalesce(sqs.total, 0)::int as total
    from params p
    join public.student_question_stats sqs
      on sqs.student_id = p.student_id
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
      'topics', (select j from normalized_topics_json),
      'protos', (select j from normalized_protos_json),
      'exclude_topic_ids', (select j from normalized_excluded_topics_json)
    ) as j
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
  proto_pick_rows as (
    select
      vri.request_order,
      cb.unic_id as proto_id,
      cb.subtopic_id as topic_id,
      cb.theme_id as section_id,
      'proto'::text as scope_kind,
      vri.scope_id,
      p.filter_id,
      case
        when p.filter_id is null then true
        when p.filter_id = 'unseen_low' then cb.is_not_seen or cb.is_low_seen
        when p.filter_id = 'stale' then cb.is_stale
        when p.filter_id = 'unstable' then cb.is_unstable
        when p.filter_id = 'weak_spots' then cb.is_weak
        else false
      end as matched_filter,
      1::int as pick_rank,
      vri.requested_n as question_limit
    from valid_request_items vri
    cross join params p
    join candidate_base cb
      on cb.unic_id = vri.scope_id
    where vri.scope_kind = 'proto'
      -- WTC4: явный клик по прототипу игнорирует фильтр под complete (§3.1.4).
      and (p.complete or (case
        when p.filter_id is null then true
        when p.filter_id = 'unseen_low' then cb.is_not_seen or cb.is_low_seen
        when p.filter_id = 'stale' then cb.is_stale
        when p.filter_id = 'unstable' then cb.is_unstable
        when p.filter_id = 'weak_spots' then cb.is_weak
        else false
      end))
  ),
  topic_candidate_ranked as (
    select
      vri.request_order,
      cb.unic_id as proto_id,
      cb.subtopic_id as topic_id,
      cb.theme_id as section_id,
      'topic'::text as scope_kind,
      vri.scope_id,
      p.filter_id,
      1::int as question_limit,
      -- WTC4: matched_filter — строгий флаг (бейдж), не отбор (отбор по лестнице под complete).
      case
        when p.filter_id is null then true
        when p.filter_id = 'unseen_low' then cb.is_not_seen or cb.is_low_seen
        when p.filter_id = 'stale' then cb.is_stale
        when p.filter_id = 'unstable' then cb.is_unstable
        when p.filter_id = 'weak_spots' then cb.is_weak
        else false
      end as matched_filter,
      -- WTC4: pick_rank — dual-window. complete=false → ИСХОДНОЕ окно (байт-в-байт);
      -- complete=true → лестница-градиент A/B/C/D на всех кандидатах (хвост: не видел → никогда не решил).
      (case when p.complete then
        row_number() over (
          partition by vri.request_order
          order by
            -- WSF1 weak_spots: covered по accuracy asc, not_seen в конце, тай-брейк давнее last_attempt (asc nulls last). Нейтрально для прочих filter_id.
            case when p.filter_id = 'weak_spots' then (case when cb.is_not_seen then 1 else 0 end) else 0 end,
            case when p.filter_id = 'weak_spots' then coalesce(cb.accuracy, 1.0) else 0::numeric end asc,
            case when p.filter_id = 'weak_spots' then cb.last_attempt_at else null::timestamptz end asc nulls last,
            case
              when p.filter_id = 'unstable' then (case when cb.has_independent_correct then 0 when cb.is_not_seen then 1 else 2 end)
              when p.filter_id = 'stale'    then (case when cb.has_independent_correct then 0 when cb.is_not_seen then 1 else 2 end)
              when p.filter_id = 'unseen_low' then (case when cb.is_not_seen then 0 when cb.is_low_seen then 1 else 2 end)
              else 0
            end,
            case when p.filter_id = 'unstable' and cb.has_independent_correct then coalesce(cb.accuracy, 1.0) else 0::numeric end asc,
            case when p.filter_id = 'stale' and cb.has_independent_correct then cb.last_attempt_at else null::timestamptz end asc nulls last,
            case when p.filter_id = 'unseen_low' then cb.unique_question_ids_seen else 0 end asc,
            md5(p.session_seed || '|complete|' || coalesce(p.filter_id, 'none') || '|topic|' || vri.request_order || '|' || cb.unic_id)
        )
      else
        row_number() over (
          partition by vri.request_order
          order by
            -- WSF1 weak_spots: covered по accuracy asc, not_seen в конце, тай-брейк давнее last_attempt (asc nulls last). Нейтрально для прочих filter_id.
            case when p.filter_id = 'weak_spots' then (case when cb.is_not_seen then 1 else 0 end) else 0 end,
            case when p.filter_id = 'weak_spots' then coalesce(cb.accuracy, 1.0) else 0::numeric end asc,
            case when p.filter_id = 'weak_spots' then cb.last_attempt_at else null::timestamptz end asc nulls last,
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
            md5(p.session_seed || '|proto|' || coalesce(p.filter_id, 'none') || '|topic|' || vri.request_order || '|' || cb.unic_id)
        )
      end)::int as pick_rank
    from valid_request_items vri
    cross join params p
    join candidate_base cb
      on cb.subtopic_id = vri.scope_id
    left join selection_protos sp
      on sp.unic_id = cb.unic_id
    where vri.scope_kind = 'topic'
      and sp.unic_id is null
      and (p.complete or (case
        when p.filter_id is null then true
        when p.filter_id = 'unseen_low' then cb.is_not_seen or cb.is_low_seen
        when p.filter_id = 'stale' then cb.is_stale
        when p.filter_id = 'unstable' then cb.is_unstable
        when p.filter_id = 'weak_spots' then cb.is_weak
        else false
      end))
  ),
  topic_pick_rows as (
    select
      tcr.request_order,
      tcr.proto_id,
      tcr.topic_id,
      tcr.section_id,
      tcr.scope_kind,
      tcr.scope_id,
      tcr.filter_id,
      tcr.matched_filter,
      tcr.pick_rank,
      tcr.question_limit
    from topic_candidate_ranked tcr
    join valid_request_items vri
      on vri.request_order = tcr.request_order
    cross join params p
    -- WTC4: под complete пропускаем ВСЕ ранжированные протоки (even-distribution выберет N инстансов глобально);
    -- default — прежний потолок top-N протоков.
    where (p.complete or tcr.pick_rank <= vri.requested_n)
  ),
  section_candidate_ranked as (
    select
      vri.request_order,
      cb.unic_id as proto_id,
      cb.subtopic_id as topic_id,
      cb.theme_id as section_id,
      'section'::text as scope_kind,
      vri.scope_id,
      p.filter_id,
      1::int as question_limit,
      case
        when p.filter_id is null then true
        when p.filter_id = 'unseen_low' then cb.is_not_seen or cb.is_low_seen
        when p.filter_id = 'stale' then cb.is_stale
        when p.filter_id = 'unstable' then cb.is_unstable
        when p.filter_id = 'weak_spots' then cb.is_weak
        else false
      end as matched_filter,
      (case when p.complete then
        row_number() over (
          partition by vri.request_order
          order by
            -- WSF1 weak_spots: covered по accuracy asc, not_seen в конце, тай-брейк давнее last_attempt (asc nulls last). Нейтрально для прочих filter_id.
            case when p.filter_id = 'weak_spots' then (case when cb.is_not_seen then 1 else 0 end) else 0 end,
            case when p.filter_id = 'weak_spots' then coalesce(cb.accuracy, 1.0) else 0::numeric end asc,
            case when p.filter_id = 'weak_spots' then cb.last_attempt_at else null::timestamptz end asc nulls last,
            case
              when p.filter_id = 'unstable' then (case when cb.has_independent_correct then 0 when cb.is_not_seen then 1 else 2 end)
              when p.filter_id = 'stale'    then (case when cb.has_independent_correct then 0 when cb.is_not_seen then 1 else 2 end)
              when p.filter_id = 'unseen_low' then (case when cb.is_not_seen then 0 when cb.is_low_seen then 1 else 2 end)
              else 0
            end,
            case when p.filter_id = 'unstable' and cb.has_independent_correct then coalesce(cb.accuracy, 1.0) else 0::numeric end asc,
            case when p.filter_id = 'stale' and cb.has_independent_correct then cb.last_attempt_at else null::timestamptz end asc nulls last,
            case when p.filter_id = 'unseen_low' then cb.unique_question_ids_seen else 0 end asc,
            md5(p.session_seed || '|complete|' || coalesce(p.filter_id, 'none') || '|section|' || vri.request_order || '|' || cb.unic_id)
        )
      else
        row_number() over (
          partition by vri.request_order
          order by
            -- WSF1 weak_spots: covered по accuracy asc, not_seen в конце, тай-брейк давнее last_attempt (asc nulls last). Нейтрально для прочих filter_id.
            case when p.filter_id = 'weak_spots' then (case when cb.is_not_seen then 1 else 0 end) else 0 end,
            case when p.filter_id = 'weak_spots' then coalesce(cb.accuracy, 1.0) else 0::numeric end asc,
            case when p.filter_id = 'weak_spots' then cb.last_attempt_at else null::timestamptz end asc nulls last,
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
            md5(p.session_seed || '|proto|' || coalesce(p.filter_id, 'none') || '|section|' || vri.request_order || '|' || cb.unic_id)
        )
      end)::int as pick_rank
    from valid_request_items vri
    cross join params p
    join candidate_base cb
      on cb.theme_id = vri.scope_id
    left join selected_topic_exclusions et
      on et.topic_id = cb.subtopic_id
    left join selection_protos sp
      on sp.unic_id = cb.unic_id
    where vri.scope_kind = 'section'
      and et.topic_id is null
      and sp.unic_id is null
      and (p.complete or (case
        when p.filter_id is null then true
        when p.filter_id = 'unseen_low' then cb.is_not_seen or cb.is_low_seen
        when p.filter_id = 'stale' then cb.is_stale
        when p.filter_id = 'unstable' then cb.is_unstable
        when p.filter_id = 'weak_spots' then cb.is_weak
        else false
      end))
  ),
  section_pick_rows as (
    select
      scr.request_order,
      scr.proto_id,
      scr.topic_id,
      scr.section_id,
      scr.scope_kind,
      scr.scope_id,
      scr.filter_id,
      scr.matched_filter,
      scr.pick_rank,
      scr.question_limit
    from section_candidate_ranked scr
    join valid_request_items vri
      on vri.request_order = scr.request_order
    cross join params p
    where (p.complete or scr.pick_rank <= vri.requested_n)
  ),
  global_candidate_ranked as (
    select
      vri.request_order,
      cb.unic_id as proto_id,
      cb.subtopic_id as topic_id,
      cb.theme_id as section_id,
      'global_all'::text as scope_kind,
      null::text as scope_id,
      p.filter_id,
      1::int as question_limit,
      case
        when p.filter_id is null then true
        when p.filter_id = 'unseen_low' then cb.is_not_seen or cb.is_low_seen
        when p.filter_id = 'stale' then cb.is_stale
        when p.filter_id = 'unstable' then cb.is_unstable
        when p.filter_id = 'weak_spots' then cb.is_weak
        else false
      end as matched_filter,
      (case when p.complete then
        row_number() over (
          partition by vri.request_order, cb.theme_id
          order by
            -- WSF1 weak_spots: covered по accuracy asc, not_seen в конце, тай-брейк давнее last_attempt (asc nulls last). Нейтрально для прочих filter_id.
            case when p.filter_id = 'weak_spots' then (case when cb.is_not_seen then 1 else 0 end) else 0 end,
            case when p.filter_id = 'weak_spots' then coalesce(cb.accuracy, 1.0) else 0::numeric end asc,
            case when p.filter_id = 'weak_spots' then cb.last_attempt_at else null::timestamptz end asc nulls last,
            case
              when p.filter_id = 'unstable' then (case when cb.has_independent_correct then 0 when cb.is_not_seen then 1 else 2 end)
              when p.filter_id = 'stale'    then (case when cb.has_independent_correct then 0 when cb.is_not_seen then 1 else 2 end)
              when p.filter_id = 'unseen_low' then (case when cb.is_not_seen then 0 when cb.is_low_seen then 1 else 2 end)
              else 0
            end,
            case when p.filter_id = 'unstable' and cb.has_independent_correct then coalesce(cb.accuracy, 1.0) else 0::numeric end asc,
            case when p.filter_id = 'stale' and cb.has_independent_correct then cb.last_attempt_at else null::timestamptz end asc nulls last,
            case when p.filter_id = 'unseen_low' then cb.unique_question_ids_seen else 0 end asc,
            md5(p.session_seed || '|complete|' || coalesce(p.filter_id, 'none') || '|global_all|' || vri.request_order || '|' || cb.theme_id || '|' || cb.unic_id)
        )
      else
        row_number() over (
          partition by vri.request_order, cb.theme_id
          order by
            -- WSF1 weak_spots: covered по accuracy asc, not_seen в конце, тай-брейк давнее last_attempt (asc nulls last). Нейтрально для прочих filter_id.
            case when p.filter_id = 'weak_spots' then (case when cb.is_not_seen then 1 else 0 end) else 0 end,
            case when p.filter_id = 'weak_spots' then coalesce(cb.accuracy, 1.0) else 0::numeric end asc,
            case when p.filter_id = 'weak_spots' then cb.last_attempt_at else null::timestamptz end asc nulls last,
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
            md5(p.session_seed || '|proto|' || coalesce(p.filter_id, 'none') || '|global_all|' || vri.request_order || '|' || cb.theme_id || '|' || cb.unic_id)
        )
      end)::int as pick_rank
    from valid_request_items vri
    cross join params p
    join candidate_base cb
      on true
    left join selected_topic_exclusions et
      on et.topic_id = cb.subtopic_id
    left join selection_protos sp
      on sp.unic_id = cb.unic_id
    where vri.scope_kind = 'global_all'
      and et.topic_id is null
      and sp.unic_id is null
      and (p.complete or (case
        when p.filter_id is null then true
        when p.filter_id = 'unseen_low' then cb.is_not_seen or cb.is_low_seen
        when p.filter_id = 'stale' then cb.is_stale
        when p.filter_id = 'unstable' then cb.is_unstable
        when p.filter_id = 'weak_spots' then cb.is_weak
        else false
      end))
  ),
  global_pick_rows as (
    select
      gcr.request_order,
      gcr.proto_id,
      gcr.topic_id,
      gcr.section_id,
      gcr.scope_kind,
      gcr.scope_id,
      gcr.filter_id,
      gcr.matched_filter,
      1::int as pick_rank,
      1::int as question_limit
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
      spr.request_order,
      spr.proto_id,
      spr.topic_id,
      spr.section_id,
      spr.scope_kind,
      spr.scope_id,
      spr.filter_id,
      spr.matched_filter,
      spr.pick_rank,
      spr.question_limit,
      vq.question_id,
      vq.manifest_path,
      -- инстанс-ранг question_id внутри прототипа (0 → 1 → 2 …) для even-distribution.
      row_number() over (
        partition by spr.request_order, spr.proto_id
        order by
          case when coalesce(qs.total, 0) = 0 then 0 else 1 end,
          md5(
            p.session_seed
            || '|question|' || coalesce(spr.filter_id, 'none')
            || '|' || spr.scope_kind
            || '|' || coalesce(spr.scope_id, spr.section_id)
            || '|' || spr.request_order
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
  -- WTC4 even-distribution (topic/section): глобальный ранг round-robin по проткам —
  -- сначала первый инстанс каждого проттока (по приоритету лестницы), затем второй, и т.д.
  -- top-N даёт base/base+1 (+1 у топ-приоритетных), излишек бедного проттока уходит следующему.
  question_candidates_dist as (
    select
      qc.*,
      row_number() over (
        partition by qc.request_order
        order by
          qc.question_rn asc,
          qc.pick_rank asc,
          md5(p.session_seed || '|evendist|' || qc.request_order::text || '|' || qc.proto_id || '|' || qc.question_id)
      )::int as complete_global_rn
    from question_candidates qc
    cross join params p
  ),
  picked_questions_rows as (
    select
      qcd.request_order,
      qcd.question_id,
      qcd.proto_id,
      qcd.topic_id,
      qcd.section_id,
      qcd.manifest_path,
      qcd.scope_kind,
      qcd.scope_id,
      qcd.filter_id,
      qcd.matched_filter,
      qcd.pick_rank
    from question_candidates_dist qcd
    cross join params p
    join valid_request_items vri
      on vri.request_order = qcd.request_order
    where case
      -- complete + topic/section → even-distribution: верхние N инстансов round-robin.
      when p.complete and qcd.scope_kind in ('topic', 'section') then qcd.complete_global_rn <= vri.requested_n
      -- иначе (default; proto: N инстансов с проттока; global_all: 1 на тему) — прежняя логика.
      else qcd.question_rn <= qcd.question_limit
    end
  )
select count(*) from picked_questions_rows;
ROLLBACK;
