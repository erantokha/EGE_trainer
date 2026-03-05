-- pick_questions_for_teacher_v2.sql
-- Быстрый серверный подбор задач по РАЗДЕЛАМ для учителя (кейс "Выбрать все" + фильтры).
-- Идея: БД возвращает приоритезированный список question_id + manifest_path,
-- а фронт грузит только те манифесты, которые реально нужны для выбранных задач.
--
-- Требования:
-- - public.question_bank (см. docs/supabase/question_bank_v1.sql) заполнен и актуален
-- - public.student_question_stats (агрегаты попыток) заполнен (см. патч 2)
-- - public.is_allowed_teacher() существует
-- - public.teacher_students связывает учителя с учениками
--
-- Применение: Supabase → SQL Editor → Run

begin;

create or replace function public.pick_questions_for_teacher_v2(
  p_student_id uuid,
  p_sections jsonb,
  p_flags jsonb default '{}'::jsonb,
  p_exclude_ids text[] default '{}'::text[],
  p_exclude_topic_ids text[] default '{}'::text[],
  p_overfetch int default 4,
  p_shuffle boolean default false,
  p_seed text default null
)
returns table(
  question_id text,
  section_id text,
  topic_id text,
  type_id text,
  base_id text,
  manifest_path text,
  total int,
  correct int,
  last_attempt_at timestamptz,
  acc numeric,
  prio int,
  rn int
)
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
with
guard as (
  select
    public.is_allowed_teacher() as is_ok,
    exists(
      select 1
      from public.teacher_students ts
      where ts.teacher_id = auth.uid()
        and ts.student_id = p_student_id
    ) as is_linked
),
wants as (
  select
    trim((x->>'id'))::text as section_id,
    greatest(0, (x->>'n')::int) as want
  from jsonb_array_elements(coalesce(p_sections, '[]'::jsonb)) as x
  where coalesce(nullif(trim(x->>'id'), ''), '') <> ''
),
wants2 as (
  select section_id, want
  from wants
  where want > 0
),
cand as (
  select qb.*
  from public.question_bank qb
  join wants2 w on w.section_id = qb.section_id
  cross join guard g
  where g.is_ok and g.is_linked
    and qb.is_enabled = true
    and qb.is_hidden = false
    and (coalesce(array_length(p_exclude_ids, 1), 0) = 0 or qb.question_id <> all(p_exclude_ids))
    and (coalesce(array_length(p_exclude_topic_ids, 1), 0) = 0 or qb.topic_id <> all(p_exclude_topic_ids))
),
joined as (
  select
    c.question_id,
    c.section_id,
    c.topic_id,
    c.type_id,
    c.base_id,
    c.manifest_path,
    coalesce(s.total, 0)::int as total,
    coalesce(s.correct, 0)::int as correct,
    s.last_attempt_at as last_attempt_at,
    case
      when coalesce(s.total, 0) > 0 then (s.correct::numeric / s.total::numeric)
      else null
    end as acc
  from cand c
  left join public.student_question_stats s
    on s.student_id = p_student_id
   and s.question_id = c.question_id
),
scored as (
  select
    j.*,
    (
      (case when coalesce((p_flags->>'old')::boolean, false) then
        (case
          when j.total <= 0 or j.last_attempt_at is null then 0
          when (now() - j.last_attempt_at) > interval '60 days' then 1
          when (now() - j.last_attempt_at) > interval '30 days' then 2
          when (now() - j.last_attempt_at) > interval '14 days' then 3
          else 4
        end)
      else 0 end) * 10
      +
      (case when coalesce((p_flags->>'badAcc')::boolean, false) then
        (case
          when j.total <= 0 then 4
          when (j.correct::numeric / nullif(j.total,0)::numeric) < 0.5 then 0
          when (j.correct::numeric / nullif(j.total,0)::numeric) < 0.7 then 1
          when (j.correct::numeric / nullif(j.total,0)::numeric) < 0.9 then 2
          else 3
        end)
      else 0 end)
    )::int as prio
  from joined j
),
ranked as (
  select
    s.*,
    row_number() over (
      partition by s.section_id
      order by
        s.prio asc,
        case
          when p_shuffle then md5(s.question_id || ':' || coalesce(p_seed,''))
          else null
        end,
        s.question_id asc
    ) as rn
  from scored s
)
select
  r.question_id,
  r.section_id,
  r.topic_id,
  r.type_id,
  r.base_id,
  r.manifest_path,
  r.total,
  r.correct,
  r.last_attempt_at,
  r.acc,
  r.prio,
  r.rn
from ranked r
join wants2 w on w.section_id = r.section_id
where r.rn <= (w.want * greatest(1, coalesce(p_overfetch, 4)))
order by r.section_id, r.rn;
$$;

revoke execute on function public.pick_questions_for_teacher_v2(
  uuid, jsonb, jsonb, text[], text[], int, boolean, text
) from anon;

grant execute on function public.pick_questions_for_teacher_v2(
  uuid, jsonb, jsonb, text[], text[], int, boolean, text
) to authenticated;

commit;
