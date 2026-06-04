-- proto_last3_for_self_v1.sql
-- WMB4: per-prototype (unic) last-3 counters for the SELF proto-picker modal badge.
--
-- Self-scoped mirror of proto_last3_for_teacher_v1: gives the logged-in student the same
-- per-prototype "X/3" accuracy badge on the proto-picker modal cards that a teacher already
-- sees when viewing that student. Windows the 3 most recent attempts PER unic_id (across all
-- question variants of the prototype), so the modal badge denominator stays <= 3.
--
-- Two differences vs the teacher RPC:
--   (a) signature without p_student_id — the caller can only ask about themselves;
--   (b) no teacher_students `allowed` gate — a hard `where ae.student_id = auth.uid()` binds
--       the result strictly to the caller's own attempts.
--
-- Window semantics mirror student_proto_state_v1.proto_last3 / proto_last3_for_teacher_v1
-- (partition by unic_id, same ordering), joined to catalog_question_dim so the FE can request
-- stats for a precise set of unic_ids.
--
-- Guard: security definer, search_path=public, revoke from anon, grant to authenticated.
-- For anon, auth.uid() is NULL → the predicate matches no rows → empty result.

begin;

create or replace function public.proto_last3_for_self_v1(
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
  with ranked as (
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
    where ae.student_id = auth.uid()
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

revoke execute on function public.proto_last3_for_self_v1(
  text[]
) from anon;

grant execute on function public.proto_last3_for_self_v1(
  text[]
) to authenticated;

commit;
