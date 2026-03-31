-- stage4_backfill_section_id.sql
-- 1C: Backfill section_id в answer_events где section_id IS NULL но topic_id есть в каталоге.
--
-- Проблема: ~44 старых события имеют topic_id, но section_id = NULL.
--   → events CTE в student_analytics_screen_v1 их исключает (JOIN требует оба поля).
--   → Расхождение all_time (∆≈44) и topic.last10 (73/84 мисмэтчей) в Stage 4 parity smoke.
--
-- Решение: взять theme_id из catalog_subtopic_dim где subtopic_id = topic_id,
--   проставить в answer_events.section_id.
--
-- Осторожность:
--   - Запускать в транзакции; проверить счётчик ДО коммита.
--   - Если subtopic_id не уникален в каталоге (редкость) — UPDATE может выбрать
--     произвольный theme_id. Проверь секцию "Проверка уникальности" ниже.
--   - После бэкфилла: перезапустить Stage 4 parity smoke и убедиться в зелёном статусе.

begin;

-- ─── 0. Проверка уникальности subtopic_id в каталоге ───────────────────────
-- Ожидаем 0 строк. Если > 0 — один subtopic_id принадлежит нескольким темам,
-- тогда UPDATE будет недетерминированным; нужно уточнение.

select subtopic_id, count(*) as theme_count
from public.catalog_subtopic_dim
where coalesce(is_enabled, true) = true
  and coalesce(is_hidden, false) = false
group by subtopic_id
having count(*) > 1
order by theme_count desc
limit 20;

-- ─── 1. Сколько событий будет затронуто (dry-run) ──────────────────────────
-- Ожидаем небольшое число (~44 для тестового студента, больше в prod).

select
  count(*) as rows_to_backfill,
  count(distinct ae.student_id) as students_affected,
  count(distinct ae.topic_id) as distinct_topic_ids
from public.answer_events ae
join public.catalog_subtopic_dim s
  on s.subtopic_id = nullif(trim(ae.topic_id), '')
  and coalesce(s.is_enabled, true) = true
  and coalesce(s.is_hidden, false) = false
where nullif(trim(ae.section_id), '') is null
  and nullif(trim(ae.topic_id), '') is not null;

-- ─── 2. Бэкфилл ─────────────────────────────────────────────────────────────
-- Ставим section_id = theme_id из catalog_subtopic_dim.
-- DISTINCT ON гарантирует: если subtopic_id вдруг в нескольких темах — берём одну
-- (по алфавиту theme_id, детерминировано).

with candidates as (
  select distinct on (ae.id)
    ae.id as event_id,
    s.theme_id as inferred_section_id
  from public.answer_events ae
  join public.catalog_subtopic_dim s
    on s.subtopic_id = nullif(trim(ae.topic_id), '')
    and coalesce(s.is_enabled, true) = true
    and coalesce(s.is_hidden, false) = false
  where nullif(trim(ae.section_id), '') is null
    and nullif(trim(ae.topic_id), '') is not null
  order by ae.id, s.theme_id
)
update public.answer_events ae
set    section_id = c.inferred_section_id
from   candidates c
where  ae.id = c.event_id;

-- ─── 3. Верификация после UPDATE ────────────────────────────────────────────
-- Проверяем что не осталось строк с topic_id IS NOT NULL и section_id IS NULL.

select
  count(*) as remaining_null_section
from public.answer_events
where nullif(trim(section_id), '') is null
  and nullif(trim(topic_id), '') is not null;

-- Ожидаем 0. Если > 0 — topic_id не нашёлся в каталоге (события с несуществующим
-- subtopic_id), это нормально, такие события корректно игнорируются events CTE.

-- ─── 4. Smoke: итоговый счётчик событий для каждого студента ───────────────
-- (опционально, для ручной проверки паритета перед коммитом)

select
  ae.student_id,
  count(*) as total_events,
  count(*) filter (where nullif(trim(ae.section_id), '') is not null) as with_section_id,
  count(*) filter (where nullif(trim(ae.section_id), '') is null and nullif(trim(ae.topic_id), '') is not null) as still_null_section
from public.answer_events ae
where nullif(trim(ae.topic_id), '') is not null
group by ae.student_id
order by still_null_section desc
limit 20;

-- ─── Коммит (убедиться что remaining_null_section = 0 или объяснено) ───────
commit;

-- После коммита:
-- 1. Перезапустить Stage 4 parity smoke (tasks/stage4_parity_browser_smoke.html).
-- 2. Проверить checks 6 (overall.all_time), 9 (topic.all_time), 11 (topic.last10).
-- 3. Если паритет зелёный — можно закрыть Stage 4 и переходить к Stage 5.
