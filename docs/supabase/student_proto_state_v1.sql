-- student_proto_state_v1.sql
-- Layer-3 canonical proto-level student state for teacher-picking.
-- Designed from docs/navigation/student_proto_state_v1_spec.md.
--
-- Temporary migration exception:
-- This v1 SQL artifact currently approximates has_independent_correct with
-- has_correct because answer_events does not yet expose a stronger
-- independent-success signal.
--
-- W13.4 (part 2 / №13): protos under theme_id='13' are NOT auto-checked — their
-- score lives in public.part2_attempt_reviews (self_score / teacher_score, 0..2,
-- max_primary). Per operator decision the visible градусник/% uses
-- coalesce(teacher_score, self_score): self shows immediately as preliminary and
-- the teacher score replaces it once confirmed. The answer_events write-path is
-- left untouched (it stores part-2 rows with correct=false); analytics simply
-- IGNORES answer_events for theme '13' and aggregates from part2_attempt_reviews
-- instead. The "accuracy"/"last3_accuracy" of a part-2 proto is the average of
-- per-attempt score ratio (coalesce(teacher,self) / max_primary). Part-1 protos
-- (theme_id <> '13') are computed byte-for-byte as before.

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
      q.unic_id,
      u.theme_id
    from public.catalog_question_dim q
    join visible_unics u
      on u.unic_id = q.unic_id
     and u.subtopic_id = q.subtopic_id
     and u.theme_id = q.theme_id
    where coalesce(q.is_enabled, true) = true
      and coalesce(q.is_hidden, false) = false
  ),
  -- Part 1 (theme_id <> '13'): correct-based proto aggregation from answer_events,
  -- unchanged from the original. Part-2 protos are excluded here and handled below.
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
      and vq.theme_id <> '13'
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
        and vq.theme_id <> '13'
        and (
          v_source = 'all'
          or ae.source = v_source
        )
    ) e
    group by e.unic_id
  ),
  -- W13.4 — Part 2 (theme_id = '13'): score-based proto aggregation from
  -- part2_attempt_reviews. accuracy = avg(score ratio) where ratio =
  -- coalesce(teacher_score, self_score) / max_primary. correct = full-mark attempt.
  part2_events as (
    select
      vq.unic_id,
      count(*)::int as attempt_count_total,
      count(*) filter (
        where coalesce(r.teacher_score, r.self_score) >= r.max_primary
      )::int as correct_count_total,
      count(distinct r.question_id)::int as unique_question_ids_seen,
      max(coalesce(r.reviewed_at, r.updated_at)) as last_attempt_at,
      avg(
        coalesce(r.teacher_score, r.self_score)::numeric
        / nullif(r.max_primary, 0)
      ) as accuracy
    from public.part2_attempt_reviews r
    join visible_questions vq
      on vq.question_id = r.question_id
    where r.student_id = p_student_id
      and coalesce(r.teacher_score, r.self_score) is not null
      and (
        v_source = 'all'
        or r.source = v_source
      )
    group by vq.unic_id
  ),
  part2_last3 as (
    select
      e.unic_id,
      count(*) filter (where e.rn <= 3)::int as last3_total,
      count(*) filter (where e.rn <= 3 and e.ratio >= 1)::int as last3_correct,
      avg(e.ratio) filter (where e.rn <= 3) as last3_accuracy
    from (
      select
        vq.unic_id,
        coalesce(r.teacher_score, r.self_score)::numeric
          / nullif(r.max_primary, 0) as ratio,
        row_number() over (
          partition by vq.unic_id
          order by coalesce(r.reviewed_at, r.updated_at) desc, r.created_at desc, r.id desc
        ) as rn
      from public.part2_attempt_reviews r
      join visible_questions vq
        on vq.question_id = r.question_id
      where r.student_id = p_student_id
        and coalesce(r.teacher_score, r.self_score) is not null
        and (
          v_source = 'all'
          or r.source = v_source
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
      (vu.theme_id = '13') as is_part2,
      coalesce(pe.attempt_count_total, p2e.attempt_count_total, 0)::int as attempt_count_total,
      coalesce(pe.correct_count_total, p2e.correct_count_total, 0)::int as correct_count_total,
      coalesce(pe.unique_question_ids_seen, p2e.unique_question_ids_seen, 0)::int as unique_question_ids_seen,
      coalesce(pe.last_attempt_at, p2e.last_attempt_at) as last_attempt_at,
      coalesce(pl3.last3_total, p2l3.last3_total, 0)::int as last3_total,
      coalesce(pl3.last3_correct, p2l3.last3_correct, 0)::int as last3_correct,
      p2e.accuracy as p2_accuracy,
      p2l3.last3_accuracy as p2_last3_accuracy
    from visible_unics vu
    left join proto_events pe
      on pe.unic_id = vu.unic_id
    left join proto_last3 pl3
      on pl3.unic_id = vu.unic_id
    left join part2_events p2e
      on p2e.unic_id = vu.unic_id
    left join part2_last3 p2l3
      on p2l3.unic_id = vu.unic_id
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
        when b.is_part2 then b.p2_accuracy
        when b.attempt_count_total > 0
          then (b.correct_count_total::numeric / b.attempt_count_total::numeric)
        else null::numeric
      end as accuracy,
      -- WL3.1: ratio по последним 3 попыткам; null при отсутствии попыток в окне.
      case
        when b.is_part2 then b.p2_last3_accuracy
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
