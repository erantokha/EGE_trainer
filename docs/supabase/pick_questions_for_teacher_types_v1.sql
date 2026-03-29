-- pick_questions_for_teacher_types_v1.sql
-- Live-BD extract synchronized on 2026-03-29.
-- Source: pg_get_functiondef('public.pick_questions_for_teacher_types_v1(uuid,jsonb,jsonb,text[],integer,boolean,text)'::regprocedure)

begin;

create or replace function public.pick_questions_for_teacher_types_v1(
  p_student_id uuid,
  p_types jsonb,
  p_flags jsonb default '{}'::jsonb,
  p_exclude_ids text[] default '{}'::text[],
  p_overfetch integer default 4,
  p_shuffle boolean default false,
  p_seed text default null::text
)
returns table(
  question_id text,
  type_id text,
  topic_id text,
  section_id text,
  manifest_path text,
  rn integer,
  seen boolean,
  last_attempt_at timestamp with time zone
)
language sql
security definer
set search_path to 'public'
set row_security to 'off'
as $function$
  with allowed as (
    select 1
    from public.teacher_students ts
    where ts.teacher_id = auth.uid()
      and ts.student_id = p_student_id
    limit 1
  ),
  req as (
    select
      nullif(trim(x.id), '') as type_id,
      greatest(coalesce(x.n, 0), 0)::int as want
    from jsonb_to_recordset(coalesce(p_types, '[]'::jsonb)) as x(id text, n int)
    where nullif(trim(x.id), '') is not null
      and greatest(coalesce(x.n, 0), 0) > 0
  ),
  req_agg as (
    select
      r.type_id,
      sum(r.want)::int as want
    from req r
    group by r.type_id
  ),
  per_question_stats as (
    select
      ae.question_id,
      count(*)::int as total_attempts,
      max(coalesce(ae.occurred_at, ae.created_at)) as last_attempt_at
    from public.answer_events ae
    where exists (select 1 from allowed)
      and ae.student_id = p_student_id
    group by ae.question_id
  ),
  candidates as (
    select
      qb.question_id,
      qb.type_id,
      qb.topic_id,
      qb.section_id,
      qb.manifest_path,
      coalesce(pqs.total_attempts, 0)::int as total_attempts,
      pqs.last_attempt_at,
      (coalesce(pqs.total_attempts, 0) > 0) as seen,
      ra.want,
      md5(coalesce(p_seed, '') || ':' || qb.question_id) as seed_key
    from req_agg ra
    join public.question_bank qb
      on qb.type_id = ra.type_id
    left join per_question_stats pqs
      on pqs.question_id = qb.question_id
    where exists (select 1 from allowed)
      and coalesce(qb.is_enabled, true) = true
      and coalesce(qb.is_hidden, false) = false
      and nullif(trim(qb.manifest_path), '') is not null
      and not (qb.question_id = any(coalesce(p_exclude_ids, '{}'::text[])))
  ),
  ranked as (
    select
      c.question_id,
      c.type_id,
      c.topic_id,
      c.section_id,
      c.manifest_path,
      row_number() over (
        partition by c.type_id
        order by
          case when c.seen then 1 else 0 end asc,
          case when not c.seen then c.seed_key else null end asc,
          case when c.seen then coalesce(c.last_attempt_at, 'epoch'::timestamptz) else null end asc,
          case when c.seen and coalesce(p_shuffle, false) then c.seed_key else null end asc,
          c.seed_key asc,
          c.question_id asc
      )::int as rn,
      c.seen,
      c.last_attempt_at,
      c.want
    from candidates c
  )
  select
    r.question_id,
    r.type_id,
    r.topic_id,
    r.section_id,
    r.manifest_path,
    r.rn,
    r.seen,
    r.last_attempt_at
  from ranked r
  where r.rn <= greatest(1, coalesce(r.want, 0)) * greatest(1, coalesce(p_overfetch, 1))
  order by r.type_id, r.rn, r.question_id;
$function$;

revoke execute on function public.pick_questions_for_teacher_types_v1(
  uuid, jsonb, jsonb, text[], integer, boolean, text
) from anon;

grant execute on function public.pick_questions_for_teacher_types_v1(
  uuid, jsonb, jsonb, text[], integer, boolean, text
) to authenticated;

commit;
