-- pick_questions_for_teacher_v1.sql
-- Live-BD extract synchronized on 2026-03-29.
-- Source: pg_get_functiondef('public.pick_questions_for_teacher_v1(uuid,jsonb,jsonb,jsonb,jsonb,text[],boolean,text)'::regprocedure)

begin;

create or replace function public.pick_questions_for_teacher_v1(
  p_student_id uuid,
  p_protos jsonb default '[]'::jsonb,
  p_topics jsonb default '[]'::jsonb,
  p_sections jsonb default '[]'::jsonb,
  p_flags jsonb default '{}'::jsonb,
  p_exclude_ids text[] default '{}'::text[],
  p_shuffle boolean default false,
  p_seed text default '0'::text
)
returns table(
  question_id text,
  topic_id text,
  section_id text,
  type_id text,
  total integer,
  correct integer,
  last_attempt_at timestamp with time zone,
  acc numeric,
  stage text,
  stage_id text
)
language plpgsql
stable
security definer
set search_path to 'public'
set row_security to 'off'
as $function$
declare
  v_old boolean := coalesce((p_flags->>'old')::boolean, false);
  v_badacc boolean := coalesce((p_flags->>'badAcc')::boolean, false);
  v_badacc_lt numeric := nullif(p_flags->>'badAccLt', '')::numeric;
  v_days_old int := nullif(p_flags->>'daysOld', '')::int;
  v_seed text := coalesce(nullif(p_seed, ''), '0');
begin
  if not public.is_allowed_teacher() then
    return;
  end if;

  if not exists (
    select 1
    from public.teacher_students ts
    where ts.teacher_id = auth.uid()
      and ts.student_id = p_student_id
  ) then
    return;
  end if;

  return query
  with
  protos_req as (
    select id, greatest(max(coalesce(n, 0)), 0) as n
    from jsonb_to_recordset(coalesce(p_protos, '[]'::jsonb)) as t(id text, n int)
    where id is not null and id <> '' and coalesce(n, 0) > 0
    group by id
  ),
  topics_req as (
    select id, greatest(max(coalesce(n, 0)), 0) as n
    from jsonb_to_recordset(coalesce(p_topics, '[]'::jsonb)) as t(id text, n int)
    where id is not null and id <> '' and coalesce(n, 0) > 0
    group by id
  ),
  sections_req as (
    select id, greatest(max(coalesce(n, 0)), 0) as n
    from jsonb_to_recordset(coalesce(p_sections, '[]'::jsonb)) as t(id text, n int)
    where id is not null and id <> '' and coalesce(n, 0) > 0
    group by id
  ),
  stats as (
    select s.question_id, s.total, s.correct, s.last_attempt_at
    from public.student_question_stats s
    where s.student_id = p_student_id
  ),

  proto_ranked as (
    select
      qb.question_id,
      qb.topic_id,
      qb.section_id,
      qb.type_id,
      st.total,
      st.correct,
      st.last_attempt_at,
      case when coalesce(st.total, 0) > 0 then (st.correct::numeric / st.total) end as acc,
      'proto'::text as stage,
      pr.id as stage_id,
      pr.n as stage_n,
      row_number() over (
        partition by pr.id
        order by
          (case when v_old then
             case
               when coalesce(st.total, 0) = 0 then 0
               when v_days_old is not null and st.last_attempt_at < (now() - (v_days_old || ' days')::interval) then 1
               else 2
             end
           else 0 end) asc,
          (case when v_badacc then
             case
               when coalesce(st.total, 0) = 0 then 2
               when v_badacc_lt is not null and (st.correct::numeric / nullif(st.total, 0)) < v_badacc_lt then 0
               else 1
             end
           else 0 end) asc,
          (case when v_badacc and coalesce(st.total, 0) > 0 then (st.correct::numeric / st.total) end) asc nulls last,
          st.last_attempt_at asc nulls last,
          qb.question_id asc
      ) as rn
    from protos_req pr
    join public.question_bank qb
      on qb.type_id = pr.id
    left join stats st
      on st.question_id = qb.question_id
    where qb.is_enabled = true
      and qb.is_hidden = false
      and not (qb.question_id = any(coalesce(p_exclude_ids, '{}'::text[])))
  ),
  proto_pick as (
    select *
    from proto_ranked
    where rn <= stage_n
  ),

  topic_ranked as (
    select
      qb.question_id,
      qb.topic_id,
      qb.section_id,
      qb.type_id,
      st.total,
      st.correct,
      st.last_attempt_at,
      case when coalesce(st.total, 0) > 0 then (st.correct::numeric / st.total) end as acc,
      'topic'::text as stage,
      tr.id as stage_id,
      tr.n as stage_n,
      row_number() over (
        partition by tr.id
        order by
          (case when v_old then
             case
               when coalesce(st.total, 0) = 0 then 0
               when v_days_old is not null and st.last_attempt_at < (now() - (v_days_old || ' days')::interval) then 1
               else 2
             end
           else 0 end) asc,
          (case when v_badacc then
             case
               when coalesce(st.total, 0) = 0 then 2
               when v_badacc_lt is not null and (st.correct::numeric / nullif(st.total, 0)) < v_badacc_lt then 0
               else 1
             end
           else 0 end) asc,
          (case when v_badacc and coalesce(st.total, 0) > 0 then (st.correct::numeric / st.total) end) asc nulls last,
          st.last_attempt_at asc nulls last,
          qb.question_id asc
      ) as rn
    from topics_req tr
    join public.question_bank qb
      on qb.topic_id = tr.id
    left join stats st
      on st.question_id = qb.question_id
    where qb.is_enabled = true
      and qb.is_hidden = false
      and not (qb.question_id = any(coalesce(p_exclude_ids, '{}'::text[])))
      and not exists (select 1 from proto_pick p where p.question_id = qb.question_id)
  ),
  topic_pick as (
    select *
    from topic_ranked
    where rn <= stage_n
  ),

  section_ranked as (
    select
      qb.question_id,
      qb.topic_id,
      qb.section_id,
      qb.type_id,
      st.total,
      st.correct,
      st.last_attempt_at,
      case when coalesce(st.total, 0) > 0 then (st.correct::numeric / st.total) end as acc,
      'section'::text as stage,
      sr.id as stage_id,
      sr.n as stage_n,
      row_number() over (
        partition by sr.id
        order by
          (case when v_old then
             case
               when coalesce(st.total, 0) = 0 then 0
               when v_days_old is not null and st.last_attempt_at < (now() - (v_days_old || ' days')::interval) then 1
               else 2
             end
           else 0 end) asc,
          (case when v_badacc then
             case
               when coalesce(st.total, 0) = 0 then 2
               when v_badacc_lt is not null and (st.correct::numeric / nullif(st.total, 0)) < v_badacc_lt then 0
               else 1
             end
           else 0 end) asc,
          (case when v_badacc and coalesce(st.total, 0) > 0 then (st.correct::numeric / st.total) end) asc nulls last,
          st.last_attempt_at asc nulls last,
          qb.question_id asc
      ) as rn
    from sections_req sr
    join public.question_bank qb
      on qb.section_id = sr.id
    left join stats st
      on st.question_id = qb.question_id
    where qb.is_enabled = true
      and qb.is_hidden = false
      and not (qb.question_id = any(coalesce(p_exclude_ids, '{}'::text[])))
      and not exists (select 1 from proto_pick p where p.question_id = qb.question_id)
      and not exists (select 1 from topic_pick t where t.question_id = qb.question_id)
  ),
  section_pick as (
    select *
    from section_ranked
    where rn <= stage_n
  ),

  all_pick as (
    select
      pp.question_id,
      pp.topic_id,
      pp.section_id,
      pp.type_id,
      pp.total,
      pp.correct,
      pp.last_attempt_at,
      pp.acc,
      pp.stage,
      pp.stage_id,
      1 as stage_ord
    from proto_pick pp
    union all
    select
      tp.question_id,
      tp.topic_id,
      tp.section_id,
      tp.type_id,
      tp.total,
      tp.correct,
      tp.last_attempt_at,
      tp.acc,
      tp.stage,
      tp.stage_id,
      2 as stage_ord
    from topic_pick tp
    union all
    select
      sp.question_id,
      sp.topic_id,
      sp.section_id,
      sp.type_id,
      sp.total,
      sp.correct,
      sp.last_attempt_at,
      sp.acc,
      sp.stage,
      sp.stage_id,
      3 as stage_ord
    from section_pick sp
  )
  select
    ap.question_id,
    ap.topic_id,
    ap.section_id,
    ap.type_id,
    ap.total,
    ap.correct,
    ap.last_attempt_at,
    ap.acc,
    ap.stage,
    ap.stage_id
  from all_pick ap
  order by
    ap.stage_ord asc,
    case when p_shuffle then md5(ap.question_id || ':' || v_seed) end asc nulls last,
    ap.stage_id asc,
    ap.question_id asc;
end;
$function$;

revoke execute on function public.pick_questions_for_teacher_v1(
  uuid, jsonb, jsonb, jsonb, jsonb, text[], boolean, text
) from anon;

grant execute on function public.pick_questions_for_teacher_v1(
  uuid, jsonb, jsonb, jsonb, jsonb, text[], boolean, text
) to authenticated;

commit;
