-- student_picking_snapshot_v1.sql
-- WPS.1 (2026-06-12): «витрина» состояния ученика для ЛОКАЛЬНОГО подбора с фильтром.
-- Отдаёт одним вызовом всё, что нужно JS-движку app/core/pick_filtered.js, чтобы
-- посчитать подбор (teacher_picking_resolve_batch_v1) на клиенте без round-trip'ов:
--   - protos[]  — per-unic состояние, флаги ДОСЛОВНО как в resolve (см. спеку
--                 docs/navigation/picking_resolve_semantics_spec.md §4.1);
--   - topics[]  — per-subtopic флаги (спека §4.2);
--   - qstats    — {question_id: total} из student_question_stats, ТОЛЬКО total>0,
--                 БЕЗ фильтра по source (как question_stats CTE resolve, спека §4.3);
--   - questions — {unic_id: [[question_id, manifest_path_idx], ...]} видимого каталога
--                 + manifest_paths[] (дедуп) — чтобы стадия вопросов и manifest-загрузка
--                 не зависели от клиентской копии каталога;
--   - sections[] — видимые theme_id (requested_n для global_all);
--   - meta      — generated_at (now-референс движка), catalog_version, счётчики.
-- Гейт: self ИЛИ is_teacher_for_student (зеркало student_proto_state_v1 / resolve).
-- Один скан answer_events (perf-приём 2026-06-08). Read-only, destructive-частей нет.

begin;

create or replace function public.student_picking_snapshot_v1(
  p_student_id uuid,
  p_source text default 'all'::text
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
  v_payload jsonb;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_student_id is null then
    raise exception 'BAD_STUDENT_ID';
  end if;

  if p_student_id <> v_uid and not public.is_teacher_for_student(p_student_id) then
    raise exception 'ACCESS_DENIED';
  end if;

  if v_source not in ('all', 'hw', 'test') then
    raise exception 'BAD_SOURCE';
  end if;

  with visible_themes as (
    select t.theme_id, t.sort_order, t.catalog_version
    from public.catalog_theme_dim t
    where coalesce(t.is_enabled, true) = true
      and coalesce(t.is_hidden, false) = false
  ),
  visible_subtopics as (
    select s.subtopic_id, s.theme_id, s.sort_order, s.catalog_version
    from public.catalog_subtopic_dim s
    join visible_themes vt on vt.theme_id = s.theme_id
    where coalesce(s.is_enabled, true) = true
      and coalesce(s.is_hidden, false) = false
  ),
  visible_unics as (
    select u.unic_id, u.subtopic_id, u.theme_id, u.catalog_version
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
  -- состояние: один скан answer_events (как в resolve после perf-фикса)
  proto_events as (
    select
      vq.unic_id,
      count(*)::int                                as attempt_count_total,
      count(*) filter (where ae.correct)::int      as correct_count_total,
      count(distinct ae.question_id)::int          as unique_question_ids_seen,
      max(coalesce(ae.occurred_at, ae.created_at)) as last_attempt_at
    from public.answer_events ae
    join visible_questions vq on vq.question_id = ae.question_id
    where ae.student_id = p_student_id
      and (v_source = 'all' or ae.source = v_source)
    group by vq.unic_id
  ),
  -- WPS.2: окно «последние 3 попытки» per unic — зеркало proto_last3 из
  -- student_proto_state_v1 (питает self-бейджи прототипов без отдельного RPC).
  proto_last3 as (
    select
      e.unic_id,
      count(*) filter (where e.rn <= 3)::int               as last3_total,
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
      join visible_questions vq on vq.question_id = ae.question_id
      where ae.student_id = p_student_id
        and (v_source = 'all' or ae.source = v_source)
    ) e
    group by e.unic_id
  ),
  proto_metrics as (
    select
      vu.theme_id,
      vu.subtopic_id,
      vu.unic_id,
      coalesce(pe.attempt_count_total, 0)::int      as attempt_count_total,
      coalesce(pe.correct_count_total, 0)::int      as correct_count_total,
      coalesce(pe.unique_question_ids_seen, 0)::int as unique_question_ids_seen,
      pe.last_attempt_at,
      case when coalesce(pe.attempt_count_total, 0) > 0
           then (coalesce(pe.correct_count_total, 0)::numeric / pe.attempt_count_total::numeric)
           else null::numeric end                   as accuracy,
      coalesce(pl3.last3_total, 0)::int             as last3_total,
      coalesce(pl3.last3_correct, 0)::int           as last3_correct,
      case when coalesce(pl3.last3_total, 0) > 0
           then (coalesce(pl3.last3_correct, 0)::numeric / pl3.last3_total::numeric)
           else null::numeric end                   as last3_accuracy
    from visible_unics vu
    left join proto_events pe on pe.unic_id = vu.unic_id
    left join proto_last3 pl3 on pl3.unic_id = vu.unic_id
  ),
  proto_state as (
    select
      m.*,
      (m.correct_count_total > 0)                       as has_correct,
      (m.correct_count_total > 0)                       as has_independent_correct,
      (m.attempt_count_total > 0)                       as covered,
      (m.correct_count_total > 0)                       as solved,
      (m.unique_question_ids_seen = 0)                  as is_not_seen,
      (m.unique_question_ids_seen = 1)                  as is_low_seen,
      (m.unique_question_ids_seen >= 2)                 as is_enough_seen,
      (m.attempt_count_total >= 2 and m.accuracy < 0.7) as is_weak,
      (
        m.correct_count_total > 0
        and m.attempt_count_total >= 2
        and not (m.attempt_count_total >= 2 and m.accuracy < 0.7)
        and m.last_attempt_at is not null
        and m.last_attempt_at < now() - interval '30 days'
      )                                                 as is_stale,
      (
        m.correct_count_total > 0
        and m.attempt_count_total >= 2
        and m.accuracy < 0.7
      )                                                 as is_unstable
    from proto_metrics m
  ),
  topic_rollup as (
    select
      ps.theme_id,
      ps.subtopic_id,
      count(*) filter (where ps.covered)::int                 as unique_proto_seen_count,
      count(*) filter (where ps.has_independent_correct)::int as mastered_proto_count,
      coalesce(sum(ps.attempt_count_total) filter (where ps.has_independent_correct), 0)::int as mastered_attempt_count_total,
      coalesce(sum(ps.correct_count_total) filter (where ps.has_independent_correct), 0)::int as mastered_correct_count_total,
      max(ps.last_attempt_at) filter (where ps.has_independent_correct) as last_mastered_attempt_at,
      count(*) filter (where ps.is_unstable)::int             as unstable_proto_count
    from proto_state ps
    group by ps.theme_id, ps.subtopic_id
  ),
  topic_state as (
    select
      tr.theme_id,
      tr.subtopic_id,
      (tr.unique_proto_seen_count = 0)                                    as is_not_seen,
      (tr.unique_proto_seen_count > 0 and tr.unique_proto_seen_count < 3) as is_low_seen,
      (
        tr.mastered_proto_count > 0
        and tr.mastered_attempt_count_total >= 2
        and (case when tr.mastered_attempt_count_total > 0
                  then (tr.mastered_correct_count_total::numeric / tr.mastered_attempt_count_total::numeric)
                  else null::numeric end) >= 0.7
        and tr.last_mastered_attempt_at is not null
        and tr.last_mastered_attempt_at < now() - interval '30 days'
      )                                                                   as is_stale,
      (
        tr.unstable_proto_count > 0
        and tr.mastered_proto_count > 0
        and tr.mastered_attempt_count_total >= 2
        and (case when tr.mastered_attempt_count_total > 0
                  then (tr.mastered_correct_count_total::numeric / tr.mastered_attempt_count_total::numeric)
                  else null::numeric end) < 0.7
      )                                                                   as is_unstable
    from topic_rollup tr
  ),
  qstats as (
    select sqs.question_id, coalesce(sqs.total, 0)::int as total
    from public.student_question_stats sqs
    where sqs.student_id = p_student_id
      and coalesce(sqs.total, 0) > 0
  ),
  manifest_paths as (
    select d.manifest_path,
           (row_number() over (order by d.manifest_path) - 1)::int as path_idx
    from (select distinct vq.manifest_path from visible_questions vq) d
  ),
  questions_by_unic as (
    select
      vq.unic_id,
      jsonb_agg(jsonb_build_array(vq.question_id, mp.path_idx) order by vq.question_id) as arr
    from visible_questions vq
    join manifest_paths mp on mp.manifest_path = vq.manifest_path
    group by vq.unic_id
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
    'meta', jsonb_build_object(
      'student_id', p_student_id,
      'source', v_source,
      'generated_at', now(),
      'catalog_version', (select value from catalog_version),
      'proto_count', (select count(*) from visible_unics),
      'attempted_question_count', (select count(*) from qstats)
    ),
    'sections', (
      select coalesce(jsonb_agg(vt.theme_id order by vt.sort_order, vt.theme_id), '[]'::jsonb)
      from visible_themes vt
    ),
    'protos', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'unic_id', ps.unic_id,
        'theme_id', ps.theme_id,
        'subtopic_id', ps.subtopic_id,
        'attempt_count_total', ps.attempt_count_total,
        'correct_count_total', ps.correct_count_total,
        'unique_question_ids_seen', ps.unique_question_ids_seen,
        'last_attempt_at', ps.last_attempt_at,
        'accuracy', ps.accuracy,
        'has_correct', ps.has_correct,
        'has_independent_correct', ps.has_independent_correct,
        'covered', ps.covered,
        'solved', ps.solved,
        'is_not_seen', ps.is_not_seen,
        'is_low_seen', ps.is_low_seen,
        'is_enough_seen', ps.is_enough_seen,
        'is_weak', ps.is_weak,
        'is_stale', ps.is_stale,
        'is_unstable', ps.is_unstable,
        'last3_total', ps.last3_total,
        'last3_correct', ps.last3_correct,
        'last3_accuracy', ps.last3_accuracy
      ) order by ps.unic_id), '[]'::jsonb)
      from proto_state ps
    ),
    'topics', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'subtopic_id', ts.subtopic_id,
        'theme_id', ts.theme_id,
        'is_not_seen', ts.is_not_seen,
        'is_low_seen', ts.is_low_seen,
        'is_stale', ts.is_stale,
        'is_unstable', ts.is_unstable
      ) order by ts.subtopic_id), '[]'::jsonb)
      from topic_state ts
    ),
    'qstats', (
      select coalesce(jsonb_object_agg(q.question_id, q.total), '{}'::jsonb)
      from qstats q
    ),
    'manifest_paths', (
      select coalesce(jsonb_agg(mp.manifest_path order by mp.path_idx), '[]'::jsonb)
      from manifest_paths mp
    ),
    'questions', (
      select coalesce(jsonb_object_agg(qbu.unic_id, qbu.arr), '{}'::jsonb)
      from questions_by_unic qbu
    )
  )
  into v_payload;

  return v_payload;
end;
$function$;

revoke execute on function public.student_picking_snapshot_v1(uuid, text) from anon;

grant execute on function public.student_picking_snapshot_v1(uuid, text) to authenticated;

commit;
