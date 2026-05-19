-- homeworks_add_kind_migration.sql
-- WS.1 migration (2026-05-13): добавить колонку `kind` в `public.homeworks`
-- для разделения обычных ДЗ ('graded') и одноразовых session-ссылок ('session').
-- Связанные документы: WS_session_links_PLAN.md §5.1.2, §6.1.
--
-- Идемпотентность:
-- - `add column if not exists` с `NOT NULL DEFAULT 'graded'` — Postgres
--   backfill'ит существующие row'ы значением 'graded' при добавлении колонки.
-- - check-constraint выносим отдельно через drop+add, чтобы повторный прогон
--   миграции не падал на «constraint already exists».
-- - Индекс на `kind` намеренно не создаётся (план Q3): cardinality=2, planner
--   не возьмёт; нет запросов с одиночным фильтром по `kind`.

begin;

alter table public.homeworks
  add column if not exists kind text not null default 'graded';

alter table public.homeworks
  drop constraint if exists homeworks_kind_check;

alter table public.homeworks
  add constraint homeworks_kind_check
  check (kind in ('graded', 'session'));

commit;

-- Smoke (после прогона, оператор вручную):
--   select kind, count(*) from public.homeworks group by kind;
-- Ожидаемое: все ранее существовавшие row'ы → kind='graded'.
