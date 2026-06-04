-- _wmb5_deploy.sql
-- WMB5 · Самодостаточный deploy для Supabase SQL editor (БЕЗ \i / \set — всё инлайн).
-- ИЗМЕНЯЕТ существующий RPC public.proto_last3_for_self_v1(text[]) — добавляет per-unic
-- all-time агрегаты (total, correct) и дату последней попытки (last_attempt_at) к уже
-- отдаваемым last3_total/last3_correct, чтобы self proto-modal у ученика получил
-- полный паритет с teacher-видом (date-бейдж «Последнее решение» + all-time / last-attempt
-- строки тултипа). Источник истины — docs/supabase/proto_last3_for_self_v1.sql; здесь его
-- точная копия.
--
-- Смена набора RETURN-колонок → `create or replace` невозможен (Postgres не меняет
-- return type на месте). Поэтому DROP + CREATE в ОДНОЙ транзакции — атомарно, окна
-- «функции нет» не возникает.
-- Идемпотентно: drop if exists + create; повторный прогон безопасен.
-- Прочие функции (proto_last3_for_teacher_v1 / student_proto_state_v1 /
-- student_topic_state_v1 / student_analytics_screen_v1 / teacher_picking_screen_v2 /
-- question_stats_for_teacher_v2 / *) НЕ затрагиваются.
--
-- ОТКАТ: вернуть 3-колоночную WMB4-версию из git-истории
--   (docs/supabase/proto_last3_for_self_v1.sql @ commit 7e075f5c) и переприменить,
--   либо drop:
--   drop function if exists public.proto_last3_for_self_v1(text[]);

-- ============================ proto_last3_for_self_v1 (WMB5) ============================
-- Self proto-modal: per-unic last-3 (X/3) + all-time (total/correct) + last_attempt_at.
-- Window semantics mirror student_proto_state_v1.proto_last3 (partition by unic_id);
-- guard: security definer, search_path=public, hard `where ae.student_id = auth.uid()`.

begin;

drop function if exists public.proto_last3_for_self_v1(text[]);

create function public.proto_last3_for_self_v1(
  p_unic_ids text[]
)
returns table(
  unic_id text,
  last3_total integer,
  last3_correct integer,
  total integer,
  correct integer,
  last_attempt_at timestamptz
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
      coalesce(ae.occurred_at, ae.created_at) as attempt_at,
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
    count(*) filter (where r.rn <= 3)::int               as last3_total,
    count(*) filter (where r.rn <= 3 and r.correct)::int as last3_correct,
    count(*)::int                                        as total,
    count(*) filter (where r.correct)::int               as correct,
    max(r.attempt_at)                                    as last_attempt_at
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

-- Пост-проверка (опционально): функция существует, 6 колонок, доступна authenticated.
--   select proname, pg_get_function_result(oid)
--   from pg_proc where proname = 'proto_last3_for_self_v1';
--
-- Self-scope smoke (под ролью authenticated, как ученик A):
--   select * from proto_last3_for_self_v1(array['<unic c попытками>']);
--   → ненулевые total + свежий last_attempt_at, строго по auth.uid().
