-- _wl3_deploy_inline.sql
-- WL3.1 · Самодостаточный deploy для Supabase SQL editor (БЕЗ \i / \set — всё инлайн).
-- Сгенерирован из канонических файлов; порядок: DROP → proto → topic → screen_v2 → analytics_v1.
-- Источник истины — отдельные docs/supabase/*.sql; здесь их точные копии для одной вставки.
--
-- ПЕРЕД ЗАПУСКОМ (рекомендуется backup для отката, выполнить и сохранить вывод ОТДЕЛЬНО):
--   select pg_get_functiondef('public.student_proto_state_v1(uuid,text)'::regprocedure);
--   select pg_get_functiondef('public.student_topic_state_v1(uuid,text)'::regprocedure);
--   select pg_get_functiondef('public.teacher_picking_screen_v2(uuid,text,integer,text,text,jsonb,jsonb,text,text[],boolean)'::regprocedure);
--   select pg_get_functiondef('public.student_analytics_screen_v1(text,uuid,integer,text,text)'::regprocedure);
--
-- DROP нужен, т.к. proto/topic добавляют колонки в RETURNS TABLE (смена типа возврата —
-- create or replace такое не умеет). Если прогон прервётся на полпути — безопасно перезапустить весь файл.

begin;
drop function if exists public.student_topic_state_v1(uuid, text);
drop function if exists public.student_proto_state_v1(uuid, text);
commit;

-- ============================ (1) student_proto_state_v1 ============================
-- student_proto_state_v1.sql
-- Layer-3 canonical proto-level student state for teacher-picking.
-- Designed from docs/navigation/student_proto_state_v1_spec.md.
--
-- Temporary migration exception:
-- This v1 SQL artifact currently approximates has_independent_correct with
-- has_correct because answer_events does not yet expose a stronger
-- independent-success signal.

begin;

create or replace function public.student_proto_state_v1(
  p_student_id uuid,
  p_source text default 'all'::text
)
returns table(
  student_id uuid,
  source text,
  theme_id text,
  subtopic_id text,
  unic_id text,
  attempt_count_total integer,
  correct_count_total integer,
  unique_question_ids_seen integer,
  last_attempt_at timestamp with time zone,
  has_correct boolean,
  has_independent_correct boolean,
  covered boolean,
  solved boolean,
  accuracy numeric,
  is_not_seen boolean,
  is_low_seen boolean,
  is_enough_seen boolean,
  is_weak boolean,
  is_stale boolean,
  is_unstable boolean,
  last3_total integer,
  last3_correct integer,
  last3_accuracy numeric
)
language plpgsql
stable
security definer
set search_path to 'public'
set row_security to 'off'
as $function$
declare
  v_uid uuid := auth.uid();
  v_source text := lower(coalesce(nullif(p_source, ''), 'all'));
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_student_id is null then
    raise exception 'BAD_STUDENT_ID';
  end if;

  if v_uid <> p_student_id and not public.is_teacher_for_student(p_student_id) then
    raise exception 'ACCESS_DENIED';
  end if;

  if v_source not in ('all', 'hw', 'test') then
    raise exception 'BAD_SOURCE';
  end if;

  return query
  with visible_themes as (
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
      t.theme_sort_order
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
      u.sort_order as unic_sort_order,
      s.subtopic_sort_order,
      s.theme_sort_order
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
      q.unic_id
    from public.catalog_question_dim q
    join visible_unics u
      on u.unic_id = q.unic_id
     and u.subtopic_id = q.subtopic_id
     and u.theme_id = q.theme_id
    where coalesce(q.is_enabled, true) = true
      and coalesce(q.is_hidden, false) = false
  ),
  proto_events as (
    select
      vq.unic_id,
      count(*)::int as attempt_count_total,
      count(*) filter (where ae.correct)::int as correct_count_total,
      count(distinct ae.question_id)::int as unique_question_ids_seen,
      max(coalesce(ae.occurred_at, ae.created_at)) as last_attempt_at
    from public.answer_events ae
    join visible_questions vq
      on vq.question_id = ae.question_id
    where ae.student_id = p_student_id
      and (
        v_source = 'all'
        or ae.source = v_source
      )
    group by vq.unic_id
  ),
  -- WL3.1: точность по «последним 3 попыткам» прототипа (3 самых свежих ответа по времени,
  -- по всем вопросам прототипа). Тот же источник answer_events, тот же приём окна, что в
  -- question_stats_for_teacher_v2 / student_analytics_screen_v1, но partition by unic_id.
  proto_last3 as (
    select
      e.unic_id,
      count(*) filter (where e.rn <= 3)::int as last3_total,
      count(*) filter (where e.rn <= 3 and e.correct)::int as last3_correct
    from (
      select
        vq.unic_id,
        ae.correct,
        row_number() over (
          partition by vq.unic_id
          order by coalesce(ae.occurred_at, ae.created_at) desc, ae.created_at desc, ae.id desc
        ) as rn
      from public.answer_events ae
      join visible_questions vq
        on vq.question_id = ae.question_id
      where ae.student_id = p_student_id
        and (
          v_source = 'all'
          or ae.source = v_source
        )
    ) e
    group by e.unic_id
  ),
  base_rows as (
    select
      p_student_id as student_id,
      v_source as source,
      vu.theme_id,
      vu.subtopic_id,
      vu.unic_id,
      vu.theme_sort_order,
      vu.subtopic_sort_order,
      vu.unic_sort_order,
      coalesce(pe.attempt_count_total, 0)::int as attempt_count_total,
      coalesce(pe.correct_count_total, 0)::int as correct_count_total,
      coalesce(pe.unique_question_ids_seen, 0)::int as unique_question_ids_seen,
      pe.last_attempt_at,
      coalesce(pl3.last3_total, 0)::int as last3_total,
      coalesce(pl3.last3_correct, 0)::int as last3_correct
    from visible_unics vu
    left join proto_events pe
      on pe.unic_id = vu.unic_id
    left join proto_last3 pl3
      on pl3.unic_id = vu.unic_id
  ),
  metrics as (
    select
      b.*,
      (b.correct_count_total > 0) as has_correct,
      -- Temporary migration approximation until independent-success signal exists.
      (b.correct_count_total > 0) as has_independent_correct,
      (b.attempt_count_total > 0) as covered,
      (b.correct_count_total > 0) as solved,
      case
        when b.attempt_count_total > 0
          then (b.correct_count_total::numeric / b.attempt_count_total::numeric)
        else null::numeric
      end as accuracy,
      -- WL3.1: ratio по последним 3 попыткам; null при отсутствии попыток в окне.
      case
        when b.last3_total > 0
          then (b.last3_correct::numeric / b.last3_total::numeric)
        else null::numeric
      end as last3_accuracy
    from base_rows b
  )
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
    m.has_correct,
    m.has_independent_correct,
    m.covered,
    m.solved,
    m.accuracy,
    (m.unique_question_ids_seen = 0) as is_not_seen,
    (m.unique_question_ids_seen = 1) as is_low_seen,
    (m.unique_question_ids_seen >= 2) as is_enough_seen,
    (
      m.attempt_count_total >= 2
      and m.accuracy < 0.7
    ) as is_weak,
    (
      m.has_independent_correct = true
      and m.attempt_count_total >= 2
      and not (
        m.attempt_count_total >= 2
        and m.accuracy < 0.7
      )
      and m.last_attempt_at is not null
      and m.last_attempt_at < now() - interval '30 days'
    ) as is_stale,
    (
      m.has_independent_correct = true
      and m.attempt_count_total >= 2
      and m.accuracy < 0.7
    ) as is_unstable,
    m.last3_total,
    m.last3_correct,
    m.last3_accuracy
  from metrics m
  order by
    m.theme_sort_order,
    m.theme_id,
    m.subtopic_sort_order,
    m.subtopic_id,
    m.unic_sort_order,
    m.unic_id;
end;
$function$;

revoke execute on function public.student_proto_state_v1(
  uuid, text
) from anon;

grant execute on function public.student_proto_state_v1(
  uuid, text
) to authenticated;

commit;

-- ============================ (2) student_topic_state_v1 ============================
-- student_topic_state_v1.sql
-- Layer-3 canonical topic-level student state for teacher-picking.
-- Designed from docs/navigation/student_topic_state_v1_spec.md.
--
-- Important:
-- This read model is intentionally built only on top of
-- public.student_proto_state_v1(...) and does not read raw answer_events.

begin;

create or replace function public.student_topic_state_v1(
  p_student_id uuid,
  p_source text default 'all'::text
)
returns table(
  student_id uuid,
  source text,
  theme_id text,
  subtopic_id text,
  visible_proto_count integer,
  unique_proto_seen_count integer,
  not_seen_proto_count integer,
  low_seen_proto_count integer,
  enough_seen_proto_count integer,
  covered_proto_count integer,
  solved_proto_count integer,
  independent_correct_proto_count integer,
  weak_proto_count integer,
  stale_proto_count integer,
  unstable_proto_count integer,
  attempt_count_total integer,
  correct_count_total integer,
  accuracy numeric,
  last_attempt_at timestamp with time zone,
  mastered_proto_count integer,
  mastered_attempt_count_total integer,
  mastered_correct_count_total integer,
  mastered_accuracy numeric,
  last_mastered_attempt_at timestamp with time zone,
  is_not_seen boolean,
  is_low_seen boolean,
  is_enough_seen boolean,
  is_stale boolean,
  is_unstable boolean,
  subtopic_last3_avg_pct numeric
)
language sql
stable
security definer
set search_path to 'public'
set row_security to 'off'
as $function$
with proto_state as (
  select *
  from public.student_proto_state_v1(p_student_id, p_source)
),
topic_rollup as (
  select
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
    max(ps.last_attempt_at) filter (where ps.has_independent_correct) as last_mastered_attempt_at,
    -- WL3.1: подтема % = СРЕДНЕЕ last3_accuracy прототипов с попытками в окне (last3_total>0),
    -- округлённое в percent. null, если ни у одного прототипа нет попыток в окне.
    round(avg(ps.last3_accuracy) filter (where ps.last3_total > 0) * 100, 0) as subtopic_last3_avg_pct
  from proto_state ps
  group by
    ps.student_id,
    ps.source,
    ps.theme_id,
    ps.subtopic_id
),
metrics as (
  select
    tr.*,
    case
      when tr.attempt_count_total > 0
        then (tr.correct_count_total::numeric / tr.attempt_count_total::numeric)
      else null::numeric
    end as accuracy,
    case
      when tr.mastered_attempt_count_total > 0
        then (tr.mastered_correct_count_total::numeric / tr.mastered_attempt_count_total::numeric)
      else null::numeric
    end as mastered_accuracy
  from topic_rollup tr
)
select
  m.student_id,
  m.source,
  m.theme_id,
  m.subtopic_id,
  m.visible_proto_count,
  m.unique_proto_seen_count,
  m.not_seen_proto_count,
  m.low_seen_proto_count,
  m.enough_seen_proto_count,
  m.covered_proto_count,
  m.solved_proto_count,
  m.independent_correct_proto_count,
  m.weak_proto_count,
  m.stale_proto_count,
  m.unstable_proto_count,
  m.attempt_count_total,
  m.correct_count_total,
  m.accuracy,
  m.last_attempt_at,
  m.mastered_proto_count,
  m.mastered_attempt_count_total,
  m.mastered_correct_count_total,
  m.mastered_accuracy,
  m.last_mastered_attempt_at,
  (m.unique_proto_seen_count = 0) as is_not_seen,
  (
    m.unique_proto_seen_count > 0
    and m.unique_proto_seen_count < 3
  ) as is_low_seen,
  (m.unique_proto_seen_count >= 3) as is_enough_seen,
  (
    m.mastered_proto_count > 0
    and m.mastered_attempt_count_total >= 2
    and m.mastered_accuracy >= 0.7
    and m.last_mastered_attempt_at is not null
    and m.last_mastered_attempt_at < now() - interval '30 days'
  ) as is_stale,
  (
    m.unstable_proto_count > 0
    and m.mastered_proto_count > 0
    and m.mastered_attempt_count_total >= 2
    and m.mastered_accuracy < 0.7
  ) as is_unstable,
  m.subtopic_last3_avg_pct
from metrics m
order by
  m.theme_id,
  m.subtopic_id;
$function$;

revoke execute on function public.student_topic_state_v1(
  uuid, text
) from anon;

grant execute on function public.student_topic_state_v1(
  uuid, text
) to authenticated;

commit;

-- ============================ (3) teacher_picking_screen_v2 ========================
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
  p_exclude_question_ids text[] default null::text[],
  p_complete boolean default false
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
  -- WTC4: complete-selection (resolve-режим). default false = поведение байт-в-байт.
  v_complete boolean := coalesce(p_complete, false);
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

  if v_filter_id is not null and v_filter_id not in ('unseen_low', 'stale', 'unstable', 'weak_spots') then
    raise exception 'BAD_FILTER_ID';
  end if;

  v_filter_label := case v_filter_id
    when 'unseen_low' then 'Не решал / мало решал'
    when 'stale' then 'Давно решал'
    when 'unstable' then 'Нестабильно решает'
    when 'weak_spots' then 'Слабые места'
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
      coalesce(p_exclude_question_ids, '{}'::text[]) as exclude_question_ids,
      v_complete as complete
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
      coalesce(sum(ts.unstable_proto_count), 0)::int as unstable_count,
      -- WSF1: счётчик-бейдж «Слабые места» = covered-протос с accuracy<0.7 и attempt>=2 (is_weak).
      -- Берём готовый weak_proto_count из student_topic_state_v1 (сигнатура не меняется).
      coalesce(sum(ts.weak_proto_count), 0)::int as weak_spots_count
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
      ts.unstable_proto_count as unstable_count,
      ts.weak_proto_count as weak_spots_count,
      ts.subtopic_last3_avg_pct
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
            'unstable', coalesce(sfc.unstable_count, 0),
            'weak_spots', coalesce(sfc.weak_spots_count, 0)
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
              'subtopic_last3_avg_pct', tr.subtopic_last3_avg_pct,
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
              'unstable', tr.unstable_count,
              'weak_spots', tr.weak_spots_count
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
          and (p.complete or (case
            when p.filter_id is null then true
            when p.filter_id = 'unseen_low' then cb.is_not_seen or cb.is_low_seen
            when p.filter_id = 'stale' then cb.is_stale
            when p.filter_id = 'unstable' then cb.is_unstable
            when p.filter_id = 'weak_spots' then cb.is_weak
            else false
          end))
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
      case
        when p.filter_id is null then true
        when p.filter_id = 'unseen_low' then cb.is_not_seen or cb.is_low_seen
        when p.filter_id = 'stale' then cb.is_stale
        when p.filter_id = 'unstable' then cb.is_unstable
        when p.filter_id = 'weak_spots' then cb.is_weak
        else false
      end as matched_filter,
      1::int as pick_rank,
      p.requested_n as question_limit
    from params p
    join candidate_base cb
      on cb.unic_id = p.scope_id
    where p.mode = 'resolve'
      and p.scope_kind = 'proto'
      and not p.empty_resolve
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
      cb.unic_id as proto_id,
      cb.subtopic_id as topic_id,
      cb.theme_id as section_id,
      'topic'::text as scope_kind,
      p.scope_id as scope_id,
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
            md5(p.session_seed || '|complete|' || coalesce(p.filter_id, 'none') || '|topic|' || p.scope_id || '|' || cb.unic_id)
        )
      else
        row_number() over (
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
            md5(p.session_seed || '|proto|' || coalesce(p.filter_id, 'none') || '|topic|' || p.scope_id || '|' || cb.unic_id)
        )
      end)::int as pick_rank
    from params p
    join candidate_base cb
      on cb.subtopic_id = p.scope_id
    left join selection_protos sp
      on sp.unic_id = cb.unic_id
    where p.mode = 'resolve'
      and p.scope_kind = 'topic'
      and not p.empty_resolve
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
    cross join params p
    where (p.complete or tcr.pick_rank <= p.requested_n)
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
            md5(p.session_seed || '|complete|' || coalesce(p.filter_id, 'none') || '|section|' || p.scope_id || '|' || cb.unic_id)
        )
      else
        row_number() over (
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
            md5(p.session_seed || '|proto|' || coalesce(p.filter_id, 'none') || '|section|' || p.scope_id || '|' || cb.unic_id)
        )
      end)::int as pick_rank
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
    cross join params p
    where (p.complete or scr.pick_rank <= p.requested_n)
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
          partition by cb.theme_id
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
            md5(p.session_seed || '|complete|' || coalesce(p.filter_id, 'none') || '|global_all|' || cb.theme_id || '|' || cb.unic_id)
        )
      else
        row_number() over (
          partition by cb.theme_id
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
            md5(p.session_seed || '|proto|' || coalesce(p.filter_id, 'none') || '|global_all|' || cb.theme_id || '|' || cb.unic_id)
        )
      end)::int as pick_rank
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
      gcr.proto_id,
      gcr.topic_id,
      gcr.section_id,
      gcr.scope_kind,
      gcr.scope_id,
      gcr.filter_id,
      gcr.matched_filter,
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
      spr.matched_filter,
      spr.pick_rank,
      spr.question_limit,
      vq.question_id,
      vq.manifest_path,
      -- инстанс-ранг question_id внутри прототипа (1 → 2 → …) для even-distribution.
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
  -- WTC4 even-distribution (topic/section): глобальный round-robin по проткам.
  question_candidates_dist as (
    select
      qc.*,
      row_number() over (
        order by
          qc.question_rn asc,
          qc.pick_rank asc,
          md5(p.session_seed || '|evendist|' || qc.proto_id || '|' || qc.question_id)
      )::int as complete_global_rn
    from question_candidates qc
    cross join params p
  ),
  picked_questions_rows as (
    select
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
    where case
      when p.complete and qcd.scope_kind in ('topic', 'section') then qcd.complete_global_rn <= p.requested_n
      else qcd.question_rn <= qcd.question_limit
    end
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
            'matched_filter', pqr.matched_filter,
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
      'supported_filters', jsonb_build_array('unseen_low', 'stale', 'unstable', 'weak_spots')
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
  uuid, text, integer, text, text, jsonb, jsonb, text, text[], boolean
) from anon;

grant execute on function public.teacher_picking_screen_v2(
  uuid, text, integer, text, text, jsonb, jsonb, text, text[], boolean
) to authenticated;

commit;

-- ============================ (4) student_analytics_screen_v1 ======================
-- student_analytics_screen_v1.sql
-- Stage-3 canonical backend-driven screen contract for student analytics surfaces.
-- Designed from docs/navigation/student_analytics_screen_v1_spec.md.

begin;

create or replace function public.student_analytics_screen_v1(
  p_viewer_scope text default 'teacher'::text,
  p_student_id uuid default null,
  p_days integer default 30,
  p_source text default 'all'::text,
  p_mode text default 'init'::text
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
  v_viewer_scope text := lower(coalesce(nullif(trim(p_viewer_scope), ''), 'teacher'));
  v_source text := lower(coalesce(nullif(trim(p_source), ''), 'all'));
  v_mode text := lower(coalesce(nullif(trim(p_mode), ''), 'init'));
  v_days integer := greatest(1, least(coalesce(p_days, 30), 3650));
  v_target_student uuid;
  v_payload jsonb;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if v_viewer_scope not in ('teacher', 'self') then
    raise exception 'BAD_VIEWER_SCOPE';
  end if;

  if v_source not in ('all', 'hw', 'test') then
    raise exception 'BAD_SOURCE';
  end if;

  if v_mode <> 'init' then
    raise exception 'BAD_MODE';
  end if;

  if v_viewer_scope = 'teacher' then
    if p_student_id is null then
      raise exception 'BAD_STUDENT_ID';
    end if;
    v_target_student := p_student_id;
    if not public.is_teacher_for_student(v_target_student) then
      raise exception 'ACCESS_DENIED';
    end if;
  else
    if p_student_id is not null and p_student_id <> v_uid then
      raise exception 'ACCESS_DENIED';
    end if;
    v_target_student := v_uid;
  end if;

  with params as (
    select
      v_uid as viewer_id,
      v_viewer_scope as viewer_scope,
      v_target_student as student_id,
      v_days as days,
      v_source as source,
      now() as now_ts,
      now() - make_interval(days => v_days) as since_ts
  ),
  student_profile as (
    select
      p.id,
      p.email,
      p.first_name,
      p.last_name,
      p.student_grade
    from public.profiles p
    join params prm
      on prm.student_id = p.id
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
      vt.title as theme_title,
      vt.sort_order as theme_sort_order
    from public.catalog_subtopic_dim s
    join visible_themes vt
      on vt.theme_id = s.theme_id
    where coalesce(s.is_enabled, true) = true
      and coalesce(s.is_hidden, false) = false
  ),
  event_catalog_map as (
    select distinct on (vs.subtopic_id)
      vs.subtopic_id,
      vs.theme_id
    from visible_subtopics vs
    order by
      vs.subtopic_id,
      vs.theme_sort_order,
      vs.sort_order,
      vs.theme_id
  ),
  topic_state as (
    select
      ts.student_id,
      ts.source,
      ts.theme_id,
      ts.subtopic_id,
      ts.visible_proto_count,
      ts.unique_proto_seen_count,
      ts.not_seen_proto_count,
      ts.low_seen_proto_count,
      ts.enough_seen_proto_count,
      ts.covered_proto_count,
      ts.solved_proto_count,
      ts.independent_correct_proto_count,
      ts.weak_proto_count,
      ts.stale_proto_count,
      ts.unstable_proto_count,
      ts.attempt_count_total,
      ts.correct_count_total,
      ts.accuracy,
      ts.last_attempt_at,
      ts.mastered_proto_count,
      ts.mastered_attempt_count_total,
      ts.mastered_correct_count_total,
      ts.mastered_accuracy,
      ts.last_mastered_attempt_at,
      ts.is_not_seen,
      ts.is_low_seen,
      ts.is_enough_seen,
      ts.is_stale,
      ts.is_unstable,
      ts.subtopic_last3_avg_pct
    from params p
    cross join lateral public.student_topic_state_v1(p.student_id, p.source) ts
  ),
  raw_events as (
    -- Stage 4 fix:
    -- Some legacy answer_events rows have topic_id filled but section_id missing.
    -- We recover theme_id from the catalog by subtopic_id, and accept the row when
    -- section_id is absent or matches the catalog mapping.
    select
      ae.id as event_id,
      coalesce(ae.occurred_at, ae.created_at) as ts,
      ecm.theme_id,
      ecm.subtopic_id,
      nullif(trim(ae.question_id), '') as question_id,
      coalesce(ae.correct, false) as correct
    from public.answer_events ae
    join params p
      on p.student_id = ae.student_id
    join event_catalog_map ecm
      on ecm.subtopic_id = nullif(trim(ae.topic_id), '')
    where (
      nullif(trim(ae.section_id), '') is null
      or ecm.theme_id = nullif(trim(ae.section_id), '')
    )
    and (
      v_source = 'all'
      or ae.source = v_source
    )
  ),
  question_events_all_time as (
    -- Stage 4 compat:
    -- Legacy teacher dashboard all_time metrics are based on the first answer
    -- per question_id, not the latest snapshot.
    select
      x.ts,
      x.theme_id,
      x.subtopic_id,
      x.question_id,
      x.correct
    from (
      select
        re.*,
        row_number() over (
          partition by re.question_id
          order by re.ts asc, re.event_id asc
        ) as rn
      from raw_events re
      where re.question_id is not null
    ) x
    where x.rn = 1
  ),
  question_events_recent as (
    -- Stage 4 compat:
    -- overall.last10 in the legacy teacher dashboard behaves like the latest
    -- answer snapshot per question_id.
    select
      x.ts,
      x.theme_id,
      x.subtopic_id,
      x.question_id,
      x.correct
    from (
      select
        re.*,
        row_number() over (
          partition by re.question_id
          order by re.ts desc, re.event_id desc
        ) as rn
      from raw_events re
      where re.question_id is not null
    ) x
    where x.rn = 1
  ),
  overall_all as (
    select
      count(*)::int as total,
      coalesce(sum(case when e.correct then 1 else 0 end), 0)::int as correct,
      max(e.ts) as last_seen_at
    from question_events_all_time e
  ),
  overall_period as (
    select
      count(*)::int as total,
      coalesce(sum(case when e.correct then 1 else 0 end), 0)::int as correct
    from raw_events e
    cross join params p
    where e.ts >= p.since_ts
  ),
  overall_last10 as (
    select
      count(*)::int as total,
      coalesce(sum(case when x.correct then 1 else 0 end), 0)::int as correct
    from (
      select e.correct
      from question_events_recent e
      order by e.ts desc
      limit 10
    ) x
  ),
  overall_last3 as (
    select
      count(*)::int as total,
      coalesce(sum(case when x.correct then 1 else 0 end), 0)::int as correct
    from (
      select e.correct
      from raw_events e
      order by e.ts desc
      limit 3
    ) x
  ),
  theme_all as (
    select
      e.theme_id,
      count(*)::int as total,
      coalesce(sum(case when e.correct then 1 else 0 end), 0)::int as correct,
      max(e.ts) as last_seen_at
    from question_events_all_time e
    group by e.theme_id
  ),
  theme_period as (
    select
      e.theme_id,
      count(*)::int as total,
      coalesce(sum(case when e.correct then 1 else 0 end), 0)::int as correct
    from raw_events e
    cross join params p
    where e.ts >= p.since_ts
    group by e.theme_id
  ),
  theme_last10 as (
    select
      x.theme_id,
      count(*)::int as total,
      coalesce(sum(case when x.correct then 1 else 0 end), 0)::int as correct
    from (
      select
        e.theme_id,
        e.correct,
        row_number() over (partition by e.theme_id order by e.ts desc) as rn
      from raw_events e
      cross join params p
      where e.ts >= p.since_ts
    ) x
    where x.rn <= 10
    group by x.theme_id
  ),
  topic_all as (
    select
      e.theme_id,
      e.subtopic_id,
      count(*)::int as total,
      coalesce(sum(case when e.correct then 1 else 0 end), 0)::int as correct,
      max(e.ts) as last_seen_at
    from question_events_all_time e
    group by e.theme_id, e.subtopic_id
  ),
  topic_period as (
    select
      e.subtopic_id,
      count(*)::int as total,
      coalesce(sum(case when e.correct then 1 else 0 end), 0)::int as correct
    from raw_events e
    cross join params p
    where e.ts >= p.since_ts
    group by e.subtopic_id
  ),
  topic_last10 as (
    select
      x.subtopic_id,
      count(*)::int as total,
      coalesce(sum(case when x.correct then 1 else 0 end), 0)::int as correct
    from (
      select
        e.subtopic_id,
        e.correct,
        row_number() over (partition by e.subtopic_id order by e.ts desc) as rn
      from raw_events e
      cross join params p
      where e.ts >= p.since_ts
    ) x
    where x.rn <= 10
    group by x.subtopic_id
  ),
  topic_last3 as (
    select
      x.subtopic_id,
      count(*)::int as total,
      coalesce(sum(case when x.correct then 1 else 0 end), 0)::int as correct
    from (
      select
        e.subtopic_id,
        e.correct,
        row_number() over (partition by e.subtopic_id order by e.ts desc) as rn
      from raw_events e
    ) x
    where x.rn <= 3
    group by x.subtopic_id
  ),
  theme_coverage as (
    select
      ts.theme_id,
      coalesce(sum(ts.visible_proto_count), 0)::int as visible_proto_count,
      coalesce(sum(ts.unique_proto_seen_count), 0)::int as unique_proto_seen_count
    from topic_state ts
    group by ts.theme_id
  ),
  section_rows_data as (
    select
      vt.theme_id,
      vt.theme_id as section_id,
      vt.title,
      vt.sort_order,
      ta.last_seen_at,
      coalesce(tl.total, 0)::int as last10_total,
      coalesce(tl.correct, 0)::int as last10_correct,
      coalesce(tp.total, 0)::int as period_total,
      coalesce(tp.correct, 0)::int as period_correct,
      coalesce(ta.total, 0)::int as all_total,
      coalesce(ta.correct, 0)::int as all_correct,
      coalesce(tc.unique_proto_seen_count, 0)::int as unics_attempted,
      coalesce(tc.visible_proto_count, 0)::int as unics_total,
      case
        when coalesce(tc.visible_proto_count, 0) > 0
          then round((coalesce(tc.unique_proto_seen_count, 0)::numeric * 100.0) / tc.visible_proto_count::numeric)::int
        else null::int
      end as coverage_pct
    from visible_themes vt
    left join theme_all ta
      on ta.theme_id = vt.theme_id
    left join theme_period tp
      on tp.theme_id = vt.theme_id
    left join theme_last10 tl
      on tl.theme_id = vt.theme_id
    left join theme_coverage tc
      on tc.theme_id = vt.theme_id
  ),
  topic_rows_data as (
    select
      vs.theme_id,
      vs.theme_id as section_id,
      vs.theme_title,
      vs.subtopic_id,
      vs.subtopic_id as topic_id,
      vs.title,
      vs.sort_order as topic_order,
      vs.theme_sort_order,
      coalesce(ta.last_seen_at, ts.last_attempt_at) as last_seen_at,
      coalesce(t3.total, 0)::int as last3_total,
      coalesce(t3.correct, 0)::int as last3_correct,
      case
        when coalesce(t3.total, 0) > 0
          then round((coalesce(t3.correct, 0)::numeric * 100.0) / t3.total::numeric)::int
        else null::int
      end as last3_pct,
      coalesce(t10.total, 0)::int as last10_total,
      coalesce(t10.correct, 0)::int as last10_correct,
      coalesce(tp.total, 0)::int as period_total,
      coalesce(tp.correct, 0)::int as period_correct,
      coalesce(ta.total, 0)::int as all_total,
      coalesce(ta.correct, 0)::int as all_correct,
      coalesce(ts.visible_proto_count, 0)::int as visible_proto_count,
      coalesce(ts.unique_proto_seen_count, 0)::int as unique_proto_seen_count,
      coalesce(ts.attempt_count_total, 0)::int as attempt_count_total,
      coalesce(ts.correct_count_total, 0)::int as correct_count_total,
      coalesce(ts.accuracy, null::numeric) as accuracy,
      ts.subtopic_last3_avg_pct,
      coalesce(ts.is_not_seen, false) as is_not_seen,
      coalesce(ts.is_low_seen, false) as is_low_seen,
      coalesce(ts.is_enough_seen, false) as is_enough_seen,
      coalesce(ts.is_stale, false) as is_stale,
      case
        when coalesce(ts.visible_proto_count, 0) > 0
          then round((coalesce(ts.unique_proto_seen_count, 0)::numeric * 100.0) / ts.visible_proto_count::numeric)::int
        else null::int
      end as coverage_pct,
      case
        when coalesce(ts.unique_proto_seen_count, 0) > 0 then 'covered'
        else 'uncovered'
      end as coverage_state,
      case
        when coalesce(ts.is_not_seen, false) then 'none'
        when coalesce(ts.is_low_seen, false) then 'low'
        else 'enough'
      end as sample_state,
      case
        when coalesce(ts.attempt_count_total, 0) >= 2
         and coalesce(ts.accuracy, 1::numeric) < 0.7
          then 'weak'
        else 'stable'
      end as performance_state,
      case
        when coalesce(ts.is_stale, false) then 'stale'
        else 'fresh'
      end as freshness_state
    from visible_subtopics vs
    left join topic_state ts
      on ts.theme_id = vs.theme_id
     and ts.subtopic_id = vs.subtopic_id
    left join topic_all ta
      on ta.theme_id = vs.theme_id
     and ta.subtopic_id = vs.subtopic_id
    left join topic_period tp
      on tp.subtopic_id = vs.subtopic_id
    left join topic_last10 t10
      on t10.subtopic_id = vs.subtopic_id
    left join topic_last3 t3
      on t3.subtopic_id = vs.subtopic_id
  ),
  sections_json as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'theme_id', s.theme_id,
          'section_id', s.section_id,
          'title', s.title,
          'last_seen_at', s.last_seen_at,
          'last10', jsonb_build_object('total', s.last10_total, 'correct', s.last10_correct),
          'period', jsonb_build_object('total', s.period_total, 'correct', s.period_correct),
          'all_time', jsonb_build_object('total', s.all_total, 'correct', s.all_correct),
          'coverage', jsonb_build_object(
            'unics_attempted', s.unics_attempted,
            'unics_total', s.unics_total,
            'pct', s.coverage_pct
          )
        )
        order by
          case when s.theme_id ~ '^[0-9]+$' then s.theme_id::int else 9999 end,
          s.theme_id
      ),
      '[]'::jsonb
    ) as j
    from section_rows_data s
  ),
  topics_json as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'theme_id', t.theme_id,
          'section_id', t.section_id,
          'subtopic_id', t.subtopic_id,
          'topic_id', t.topic_id,
          'title', t.title,
          'topic_order', t.topic_order,
          'last_seen_at', t.last_seen_at,
          'last3', jsonb_build_object('total', t.last3_total, 'correct', t.last3_correct),
          'last10', jsonb_build_object('total', t.last10_total, 'correct', t.last10_correct),
          'period', jsonb_build_object('total', t.period_total, 'correct', t.period_correct),
          'all_time', jsonb_build_object('total', t.all_total, 'correct', t.all_correct),
          'subtopic_last3_avg_pct', t.subtopic_last3_avg_pct,
          'coverage', jsonb_build_object(
            'unics_attempted', t.unique_proto_seen_count,
            'unics_total', t.visible_proto_count,
            'pct', t.coverage_pct
          ),
          'derived', jsonb_build_object(
            'coverage_state', t.coverage_state,
            'sample_state', t.sample_state,
            'performance_state', t.performance_state,
            'freshness_state', t.freshness_state
          )
        )
        order by
          case when t.theme_id ~ '^[0-9]+$' then t.theme_id::int else 9999 end,
          t.theme_sort_order,
          t.topic_order,
          t.subtopic_id
      ),
      '[]'::jsonb
    ) as j
    from topic_rows_data t
  ),
  uncovered_ranked as (
    select
      t.*,
      row_number() over (
        partition by t.theme_id
        order by
          case when t.period_total = 0 then 0 else 1 end,
          t.all_total,
          t.subtopic_id
      ) as rn
    from topic_rows_data t
  ),
  uncovered_pick as (
    select *
    from uncovered_ranked
    where rn = 1
  ),
  worst3_ranked as (
    select
      t.*,
      row_number() over (
        partition by t.theme_id
        order by
          t.last3_pct asc nulls last,
          t.last3_total desc,
          t.all_total asc,
          t.subtopic_id
      ) as rn
    from topic_rows_data t
    where t.last3_total > 0
  ),
  worst3_pick_direct as (
    select *
    from worst3_ranked
    where rn = 1
  ),
  variant12_uncovered_rows as (
    select
      u.theme_id,
      u.theme_title,
      u.subtopic_id,
      u.title as subtopic_title,
      'uncovered'::text as mode,
      case
        when u.period_total = 0 then 'Не решал в выбранном периоде.'
        when u.all_total > 0 then
          'Попыток: '
          || u.all_total::text
          || ' (точность '
          || coalesce(
            case
              when u.all_total > 0
                then round((u.all_correct::numeric * 100.0) / u.all_total::numeric)::int::text || '%'
              else null
            end,
            '—'
          )
          || ').'
        else 'Не решал.'
      end as reason,
      false as picked_fallback,
      jsonb_build_object(
        'last3_total', u.last3_total,
        'last3_correct', u.last3_correct,
        'last3_pct', u.last3_pct,
        'all_total', u.all_total,
        'all_correct', u.all_correct,
        'all_pct',
          case
            when u.all_total > 0
              then round((u.all_correct::numeric * 100.0) / u.all_total::numeric)::int
            else null::int
          end
      ) as meta,
      u.theme_sort_order,
      u.topic_order
    from uncovered_pick u
  ),
  variant12_worst3_rows as (
    select
      coalesce(w.theme_id, u.theme_id) as theme_id,
      coalesce(w.theme_title, u.theme_title) as theme_title,
      coalesce(w.subtopic_id, u.subtopic_id) as subtopic_id,
      coalesce(w.title, u.title) as subtopic_title,
      'worst3'::text as mode,
      case
        when w.theme_id is not null then
          'Последние '
          || w.last3_total::text
          || ': '
          || w.last3_correct::text
          || '/'
          || w.last3_total::text
          || ' ('
          || coalesce(w.last3_pct::text, '—')
          || '%).'
        else 'Нет данных по последним 3, выбран по минимуму попыток.'
      end as reason,
      (w.theme_id is null) as picked_fallback,
      jsonb_build_object(
        'last3_total', coalesce(w.last3_total, u.last3_total),
        'last3_correct', coalesce(w.last3_correct, u.last3_correct),
        'last3_pct', coalesce(w.last3_pct, u.last3_pct),
        'all_total', coalesce(w.all_total, u.all_total),
        'all_correct', coalesce(w.all_correct, u.all_correct),
        'all_pct',
          case
            when coalesce(w.all_total, u.all_total) > 0
              then round((coalesce(w.all_correct, u.all_correct)::numeric * 100.0) / coalesce(w.all_total, u.all_total)::numeric)::int
            else null::int
          end
      ) as meta,
      coalesce(w.theme_sort_order, u.theme_sort_order) as theme_sort_order,
      coalesce(w.topic_order, u.topic_order) as topic_order
    from uncovered_pick u
    left join worst3_pick_direct w
      on w.theme_id = u.theme_id
  ),
  variant12_missing_themes as (
    select
      vt.theme_id,
      vt.title
    from visible_themes vt
    left join uncovered_pick u
      on u.theme_id = vt.theme_id
    where u.theme_id is null
  ),
  variant12_uncovered_json as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'theme_id', r.theme_id,
          'theme_title', r.theme_title,
          'subtopic_id', r.subtopic_id,
          'subtopic_title', r.subtopic_title,
          'mode', r.mode,
          'reason', r.reason,
          'picked_fallback', r.picked_fallback,
          'meta', r.meta
        )
        order by
          case when r.theme_id ~ '^[0-9]+$' then r.theme_id::int else 9999 end,
          r.theme_sort_order,
          r.topic_order,
          r.subtopic_id
      ),
      '[]'::jsonb
    ) as j
    from variant12_uncovered_rows r
  ),
  variant12_worst3_json as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'theme_id', r.theme_id,
          'theme_title', r.theme_title,
          'subtopic_id', r.subtopic_id,
          'subtopic_title', r.subtopic_title,
          'mode', r.mode,
          'reason', r.reason,
          'picked_fallback', r.picked_fallback,
          'meta', r.meta
        )
        order by
          case when r.theme_id ~ '^[0-9]+$' then r.theme_id::int else 9999 end,
          r.theme_sort_order,
          r.topic_order,
          r.subtopic_id
      ),
      '[]'::jsonb
    ) as j
    from variant12_worst3_rows r
  ),
  variant12_issues_json as (
    select coalesce(
      jsonb_agg(('Раздел ' || m.theme_id || ': нет тем в каталоге.')::text order by m.theme_id),
      '[]'::jsonb
    ) as j
    from variant12_missing_themes m
  ),
  catalog_version_row as (
    select max(v.catalog_version) as catalog_version
    from (
      select vt.catalog_version
      from visible_themes vt
      union all
      select vs.catalog_version
      from visible_subtopics vs
    ) v
  )
  select jsonb_build_object(
    'student', jsonb_build_object(
      'student_id', p.student_id,
      'viewer_scope', p.viewer_scope,
      'days', p.days,
      'source', p.source,
      'display_name',
        coalesce(
          nullif(trim(concat(coalesce(sp.first_name, ''), ' ', coalesce(sp.last_name, ''))), ''),
          nullif(split_part(coalesce(sp.email, ''), '@', 1), ''),
          'Ученик'
        ),
      'grade', sp.student_grade,
      'last_seen_at', (select oa.last_seen_at from overall_all oa)
    ),
    'catalog_version', (select cv.catalog_version from catalog_version_row cv),
    'screen', jsonb_build_object(
      'mode', 'init',
      'source_contract', 'student_analytics_screen_v1',
      'supports', jsonb_build_object(
        'variant12', (p.viewer_scope = 'teacher'),
        'recommendations', false,
        'works', false
      )
    ),
    'overall', jsonb_build_object(
      'last_seen_at', (select oa.last_seen_at from overall_all oa),
      'last3', jsonb_build_object(
        'total', (select o3.total from overall_last3 o3),
        'correct', (select o3.correct from overall_last3 o3)
      ),
      'last10', jsonb_build_object(
        'total', (select o10.total from overall_last10 o10),
        'correct', (select o10.correct from overall_last10 o10)
      ),
      'period', jsonb_build_object(
        'total', (select op.total from overall_period op),
        'correct', (select op.correct from overall_period op)
      ),
      'all_time', jsonb_build_object(
        'total', (select oa.total from overall_all oa),
        'correct', (select oa.correct from overall_all oa)
      )
    ),
    'sections', (select sj.j from sections_json sj),
    'topics', (select tj.j from topics_json tj),
    'variant12', jsonb_build_object(
      'uncovered', jsonb_build_object(
        'rows', case when p.viewer_scope = 'teacher' then (select uj.j from variant12_uncovered_json uj) else '[]'::jsonb end,
        'issues', case when p.viewer_scope = 'teacher' then (select ij.j from variant12_issues_json ij) else '[]'::jsonb end
      ),
      'worst3', jsonb_build_object(
        'rows', case when p.viewer_scope = 'teacher' then (select wj.j from variant12_worst3_json wj) else '[]'::jsonb end,
        'issues', case when p.viewer_scope = 'teacher' then (select ij.j from variant12_issues_json ij) else '[]'::jsonb end
      )
    ),
    'recommendations', '[]'::jsonb,
    'warnings', '[]'::jsonb,
    'generated_at', p.now_ts
  )
  into v_payload
  from params p
  left join student_profile sp
    on true;

  return v_payload;
end;
$function$;

revoke execute on function public.student_analytics_screen_v1(
  text, uuid, integer, text, text
) from anon;

grant execute on function public.student_analytics_screen_v1(
  text, uuid, integer, text, text
) to authenticated;

commit;
