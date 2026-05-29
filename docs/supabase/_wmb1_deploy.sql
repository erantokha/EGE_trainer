-- _wmb1_deploy.sql
-- WMB1 · Самодостаточный deploy для Supabase SQL editor (БЕЗ \i / \set — всё инлайн).
-- Создаёт НОВЫЙ RPC public.proto_last3_for_teacher_v1(uuid, text[]) для бейджа карточки
-- прототипа в модалке подбора (per-prototype last-3, X/3, а не сумма по-вопросных X/4).
-- Источник истины — docs/supabase/proto_last3_for_teacher_v1.sql; здесь его точная копия.
--
-- Backup НЕ нужен: функция новая (нет предыдущей версии для отката).
-- Идемпотентно: create or replace; повторный прогон безопасен.
-- Прочие функции (student_proto_state_v1 / student_topic_state_v1 /
-- teacher_picking_screen_v2 / question_stats_for_teacher_v2 / *) НЕ затрагиваются.
--
-- ОТКАТ:
--   drop function if exists public.proto_last3_for_teacher_v1(uuid, text[]);

-- ============================ proto_last3_for_teacher_v1 ============================
-- WMB1: per-prototype (unic) last-3 counters for the teacher proto-picker modal badge.
-- Window semantics mirror student_proto_state_v1.proto_last3 (partition by unic_id);
-- guard mirrors question_stats_for_teacher_v2.

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

-- Пост-проверка (опционально): функция существует и доступна authenticated.
--   select proname, pg_get_function_identity_arguments(oid)
--   from pg_proc where proname = 'proto_last3_for_teacher_v1';
