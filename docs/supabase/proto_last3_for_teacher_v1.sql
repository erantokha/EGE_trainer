-- proto_last3_for_teacher_v1.sql
-- WMB1: per-prototype (unic) last-3 counters for the teacher proto-picker modal badge.
--
-- Windows the 3 most recent attempts PER unic_id (across all question variants of the
-- prototype), so the modal badge denominator stays <= 3 ("X/3") instead of summing the
-- per-question last-3 windows (which inflated it to "X/4" and beyond).
--
-- Window semantics mirror student_proto_state_v1.proto_last3 (partition by unic_id):
-- the same answer_events source, the same ordering, but joined to catalog_question_dim
-- so the FE can request stats for a precise set of unic_ids.
--
-- Guard mirrors question_stats_for_teacher_v2: security definer, search_path=public,
-- teacher access via an `allowed` exists-check on teacher_students, revoke from anon,
-- grant to authenticated.

begin;

create or replace function public.proto_last3_for_teacher_v1(
  p_student_id uuid,
  p_unic_ids text[]
)
returns table(
  unic_id text,
  last3_total integer,
  last3_correct integer
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with allowed as (
    select 1
    from public.teacher_students ts
    where ts.teacher_id = auth.uid()
      and ts.student_id = p_student_id
    limit 1
  ),
  ranked as (
    select
      q.unic_id,
      ae.correct,
      row_number() over (
        partition by q.unic_id
        order by
          coalesce(ae.occurred_at, ae.created_at) desc,
          ae.created_at desc,
          ae.id desc
      )::int as rn
    from public.answer_events ae
    join public.catalog_question_dim q
      on q.question_id = ae.question_id
    where exists (select 1 from allowed)
      and ae.student_id = p_student_id
      and q.unic_id = any(p_unic_ids)
  )
  select
    r.unic_id,
    count(*) filter (where r.rn <= 3)::int as last3_total,
    count(*) filter (where r.rn <= 3 and r.correct)::int as last3_correct
  from ranked r
  group by r.unic_id
  order by r.unic_id;
$function$;

revoke execute on function public.proto_last3_for_teacher_v1(
  uuid, text[]
) from anon;

grant execute on function public.proto_last3_for_teacher_v1(
  uuid, text[]
) to authenticated;

commit;
