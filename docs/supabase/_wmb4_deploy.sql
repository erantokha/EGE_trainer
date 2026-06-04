-- _wmb4_deploy.sql
-- WMB4 · Самодостаточный deploy для Supabase SQL editor (БЕЗ \i / \set — всё инлайн).
-- Создаёт НОВЫЙ RPC public.proto_last3_for_self_v1(text[]) — self-зеркало
-- proto_last3_for_teacher_v1 для бейджа карточки прототипа в модалке подбора у самого
-- (авторизованного) ученика (per-prototype last-3, X/3). Источник истины —
-- docs/supabase/proto_last3_for_self_v1.sql; здесь его точная копия.
--
-- Backup НЕ нужен: функция новая (нет предыдущей версии для отката).
-- Идемпотентно: create or replace; повторный прогон безопасен.
-- Прочие функции (proto_last3_for_teacher_v1 / student_proto_state_v1 /
-- student_topic_state_v1 / student_analytics_screen_v1 / teacher_picking_screen_v2 /
-- question_stats_for_teacher_v2 / *) НЕ затрагиваются.
--
-- ОТКАТ:
--   drop function if exists public.proto_last3_for_self_v1(text[]);

-- ============================ proto_last3_for_self_v1 ============================
-- WMB4: per-prototype (unic) last-3 counters for the SELF proto-picker modal badge.
-- Window semantics mirror student_proto_state_v1.proto_last3 (partition by unic_id);
-- guard: security definer, search_path=public, hard `where ae.student_id = auth.uid()`.

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

-- Пост-проверка (опционально): функция существует и доступна authenticated.
--   select proname, pg_get_function_identity_arguments(oid)
--   from pg_proc where proname = 'proto_last3_for_self_v1';
--
-- Self-scope smoke (под ролью authenticated, как ученик A):
--   select * from proto_last3_for_self_v1(array['<unic ученика A>']);
--   → ненулевые last3_total по решённым прототипам, строго по auth.uid().
