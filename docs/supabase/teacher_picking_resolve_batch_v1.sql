-- teacher_picking_resolve_batch_v1.sql
-- Stage 3.5 backend batch resolve for teacher manual picking.
-- Designed to reduce N resolve RPCs on home_teacher to at most 3 calls
-- (protos -> topics -> sections/global_all) per sync cycle.

begin;

create or replace function public.teacher_picking_resolve_batch_v1(
  p_student_id uuid,
  p_source text default 'all'::text,
  p_filter_id text default null::text,
  p_selection jsonb default '{}'::jsonb,
  p_requests jsonb default '[]'::jsonb,
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
  v_source text := lower(coalesce(nullif(p_source, ''), 'all'));
  v_filter_id text := lower(nullif(p_filter_id, ''));
  v_filter_label text;
  v_selection jsonb := coalesce(p_selection, '{}'::jsonb);
  v_requests jsonb := coalesce(p_requests, '[]'::jsonb);
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

  if v_source not in ('all', 'hw', 'test') then
    raise exception 'BAD_SOURCE';
  end if;

  if v_filter_id is not null and v_filter_id not in ('unseen_low', 'stale', 'unstable') then
    raise exception 'BAD_FILTER_ID';
  end if;

  v_filter_label := case v_filter_id
    when 'unseen_low' then 'РќРµ СЂРµС€Р°Р» / РјР°Р»Рѕ СЂРµС€Р°Р»'
    when 'stale' then 'Р”Р°РІРЅРѕ СЂРµС€Р°Р»'
    when 'unstable' then 'РќРµСЃС‚Р°Р±РёР»СЊРЅРѕ СЂРµС€Р°РµС‚'
    else null
  end;

  v_session_seed := coalesce(
    nullif(p_seed, ''),
    md5(
      p_student_id::text
      || '|' || v_source
      || '|' || coalesce(v_filter_id, 'none')
      || '|' || v_selection::text
      || '|' || v_requests::text
    )
  );

  with params as (
    select
      p_student_id as student_id,
      v_source as source,
      v_filter_id as filter_id,
      v_filter_label as filter_label,
      v_selection as selection_json,
      v_requests as requests_json,
      v_session_seed as session_seed,
      coalesce(p_exclude_question_ids, '{}'::text[]) as exclude_question_ids
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
      1::int as pick_rank,
      vri.requested_n as question_limit
    from valid_request_items vri
    cross join params p
    join candidate_base cb
      on cb.unic_id = vri.scope_id
    where vri.scope_kind = 'proto'
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
      vri.request_order,
      cb.unic_id as proto_id,
      cb.subtopic_id as topic_id,
      cb.theme_id as section_id,
      'topic'::text as scope_kind,
      vri.scope_id,
      p.filter_id,
      1::int as question_limit,
      row_number() over (
        partition by vri.request_order
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
          md5(p.session_seed || '|proto|' || coalesce(p.filter_id, 'none') || '|topic|' || vri.request_order || '|' || cb.unic_id)
      )::int as pick_rank
    from valid_request_items vri
    cross join params p
    join candidate_base cb
      on cb.subtopic_id = vri.scope_id
    left join selection_protos sp
      on sp.unic_id = cb.unic_id
    where vri.scope_kind = 'topic'
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
      tcr.request_order,
      tcr.proto_id,
      tcr.topic_id,
      tcr.section_id,
      tcr.scope_kind,
      tcr.scope_id,
      tcr.filter_id,
      tcr.pick_rank,
      tcr.question_limit
    from topic_candidate_ranked tcr
    join valid_request_items vri
      on vri.request_order = tcr.request_order
    where tcr.pick_rank <= vri.requested_n
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
      row_number() over (
        partition by vri.request_order
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
          md5(p.session_seed || '|proto|' || coalesce(p.filter_id, 'none') || '|section|' || vri.request_order || '|' || cb.unic_id)
      )::int as pick_rank
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
      scr.request_order,
      scr.proto_id,
      scr.topic_id,
      scr.section_id,
      scr.scope_kind,
      scr.scope_id,
      scr.filter_id,
      scr.pick_rank,
      scr.question_limit
    from section_candidate_ranked scr
    join valid_request_items vri
      on vri.request_order = scr.request_order
    where scr.pick_rank <= vri.requested_n
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
      row_number() over (
        partition by vri.request_order, cb.theme_id
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
          md5(p.session_seed || '|proto|' || coalesce(p.filter_id, 'none') || '|global_all|' || vri.request_order || '|' || cb.theme_id || '|' || cb.unic_id)
      )::int as pick_rank
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
      gcr.request_order,
      gcr.proto_id,
      gcr.topic_id,
      gcr.section_id,
      gcr.scope_kind,
      gcr.scope_id,
      gcr.filter_id,
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
      spr.pick_rank,
      spr.question_limit,
      vq.question_id,
      vq.manifest_path,
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
  picked_questions_rows as (
    select
      qc.request_order,
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
            'request_order', pqr.request_order,
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
          order by pqr.request_order, pqr.section_id, pqr.topic_id, pqr.pick_rank, pqr.question_id
        ),
        '[]'::jsonb
      ) as j
    from picked_questions_rows pqr
  ),
  request_counts as (
    select
      vri.request_order,
      vri.scope_kind,
      vri.scope_id,
      case
        when vri.scope_kind = 'global_all' then (select count(*)::int from visible_themes)
        else vri.requested_n
      end as requested_n,
      coalesce(pr.returned_n, 0)::int as returned_n
    from valid_request_items vri
    left join (
      select
        pqr.request_order,
        count(*)::int as returned_n
      from picked_questions_rows pqr
      group by pqr.request_order
    ) pr
      on pr.request_order = vri.request_order
  ),
  shortages_json as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'request_order', rc.request_order,
          'scope_kind', rc.scope_kind,
          'scope_id', rc.scope_id,
          'requested_n', rc.requested_n,
          'returned_n', rc.returned_n,
          'is_shortage', (rc.returned_n < rc.requested_n),
          'reason_id',
          case
            when rc.returned_n < rc.requested_n and p.filter_id is not null then 'insufficient_filter_candidates'
            when rc.returned_n < rc.requested_n then 'insufficient_candidates'
            else null
          end,
          'message',
          case
            when rc.returned_n < rc.requested_n and p.filter_label is not null then
              format('РџРѕРґРѕР±СЂР°РЅРѕ %s РёР· %s РїРѕ С„РёР»СЊС‚СЂСѓ "%s".', rc.returned_n, rc.requested_n, p.filter_label)
            when rc.returned_n < rc.requested_n then
              format('РџРѕРґРѕР±СЂР°РЅРѕ %s РёР· %s.', rc.returned_n, rc.requested_n)
            else null
          end
        )
        order by rc.request_order
      ),
      '[]'::jsonb
    ) as j
    from request_counts rc
    cross join params p
  ),
  warnings_json as (
    select
      case
        when exists(select 1 from valid_request_items)
          then '[]'::jsonb
        else jsonb_build_array(
          jsonb_build_object(
            'code', 'empty_resolve_batch',
            'message', 'Нет валидных resolve requests.'
          )
        )
      end as j
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
  )
  select jsonb_build_object(
    'student', jsonb_build_object(
      'student_id', p.student_id,
      'source', p.source
    ),
    'catalog_version', (select value from catalog_version),
    'screen', jsonb_build_object(
      'mode', 'resolve_batch',
      'can_pick', true,
      'session_seed', p.session_seed
    ),
    'filter', jsonb_build_object(
      'label', p.filter_label,
      'filter_id', p.filter_id
    ),
    'selection', jsonb_build_object(
      'normalized', (select j from normalized_selection)
    ),
    'picked_questions', (select j from picked_questions_json),
    'shortages', (select j from shortages_json),
    'warnings', (select j from warnings_json),
    'generated_at', now()
  )
  into v_payload
  from params p;

  return v_payload;
end;
$function$;

revoke execute on function public.teacher_picking_resolve_batch_v1(
  uuid, text, text, jsonb, jsonb, text, text[]
) from anon;

grant execute on function public.teacher_picking_resolve_batch_v1(
  uuid, text, text, jsonb, jsonb, text, text[]
) to authenticated;

commit;
