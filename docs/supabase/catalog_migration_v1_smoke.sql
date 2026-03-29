-- catalog_migration_v1_smoke.sql
-- Smoke-тесты для проверки catalog_migration_v1.sql после применения.
-- Применение: Supabase SQL Editor. Все запросы — только SELECT.
-- Ожидаемый результат: каждая строка содержит 'OK' в колонке result.

-- ============================================================
-- 1. Таблицы существуют
-- ============================================================

select
    table_name,
    case when count(*) = 1 then 'OK' else 'FAIL — таблица не найдена' end as result
from information_schema.tables
where table_schema = 'public'
  and table_name in (
      'catalog_theme_dim',
      'catalog_subtopic_dim',
      'catalog_unic_dim',
      'catalog_question_dim'
  )
group by table_name
order by table_name;

-- ============================================================
-- 2. Критичные столбцы существуют с правильным типом
-- ============================================================

select
    table_name,
    column_name,
    data_type,
    case
        when (table_name = 'catalog_theme_dim'    and column_name = 'theme_id'               and data_type = 'text')                           then 'OK'
        when (table_name = 'catalog_theme_dim'    and column_name = 'sort_order'             and data_type = 'integer')                        then 'OK'
        when (table_name = 'catalog_theme_dim'    and column_name = 'is_counted_in_coverage' and data_type = 'boolean')                        then 'OK'
        when (table_name = 'catalog_theme_dim'    and column_name = 'catalog_version'        and data_type = 'text')                           then 'OK'
        when (table_name = 'catalog_theme_dim'    and column_name = 'updated_at'             and data_type = 'timestamp with time zone')       then 'OK'
        when (table_name = 'catalog_subtopic_dim' and column_name = 'subtopic_id'            and data_type = 'text')                           then 'OK'
        when (table_name = 'catalog_subtopic_dim' and column_name = 'theme_id'               and data_type = 'text')                           then 'OK'
        when (table_name = 'catalog_subtopic_dim' and column_name = 'source_path'            and data_type = 'text')                           then 'OK'
        when (table_name = 'catalog_unic_dim'     and column_name = 'unic_id'               and data_type = 'text')                           then 'OK'
        when (table_name = 'catalog_unic_dim'     and column_name = 'subtopic_id'            and data_type = 'text')                           then 'OK'
        when (table_name = 'catalog_unic_dim'     and column_name = 'theme_id'               and data_type = 'text')                           then 'OK'
        when (table_name = 'catalog_unic_dim'     and column_name = 'is_counted_in_coverage' and data_type = 'boolean')                        then 'OK'
        when (table_name = 'catalog_question_dim' and column_name = 'question_id'            and data_type = 'text')                           then 'OK'
        when (table_name = 'catalog_question_dim' and column_name = 'unic_id'               and data_type = 'text')                           then 'OK'
        when (table_name = 'catalog_question_dim' and column_name = 'subtopic_id'            and data_type = 'text')                           then 'OK'
        when (table_name = 'catalog_question_dim' and column_name = 'theme_id'               and data_type = 'text')                           then 'OK'
        else 'FAIL — столбец или тип не совпадает'
    end as result
from information_schema.columns
where table_schema = 'public'
  and (table_name, column_name) in (
      ('catalog_theme_dim',    'theme_id'),
      ('catalog_theme_dim',    'sort_order'),
      ('catalog_theme_dim',    'is_counted_in_coverage'),
      ('catalog_theme_dim',    'catalog_version'),
      ('catalog_theme_dim',    'updated_at'),
      ('catalog_subtopic_dim', 'subtopic_id'),
      ('catalog_subtopic_dim', 'theme_id'),
      ('catalog_subtopic_dim', 'source_path'),
      ('catalog_unic_dim',     'unic_id'),
      ('catalog_unic_dim',     'subtopic_id'),
      ('catalog_unic_dim',     'theme_id'),
      ('catalog_unic_dim',     'is_counted_in_coverage'),
      ('catalog_question_dim', 'question_id'),
      ('catalog_question_dim', 'unic_id'),
      ('catalog_question_dim', 'subtopic_id'),
      ('catalog_question_dim', 'theme_id')
  )
order by table_name, column_name;

-- ============================================================
-- 3. CHECK-ограничения на sort_order и счётчики
-- ============================================================

select
    tc.table_name,
    tc.constraint_name,
    cc.check_clause,
    case when cc.check_clause is not null then 'OK' else 'FAIL — CHECK не найден' end as result
from information_schema.table_constraints tc
join information_schema.check_constraints cc
    on tc.constraint_name = cc.constraint_name
   and tc.constraint_schema = cc.constraint_schema
where tc.table_schema = 'public'
  and tc.table_name in (
      'catalog_theme_dim',
      'catalog_subtopic_dim',
      'catalog_unic_dim',
      'catalog_question_dim'
  )
  and tc.constraint_type = 'CHECK'
  and cc.check_clause not ilike '%not null%'   -- исключаем авто-NOT NULL checks
order by tc.table_name, tc.constraint_name;

-- ============================================================
-- 4. Внешние ключи
-- ============================================================

select
    tc.table_name       as fk_table,
    kcu.column_name     as fk_column,
    ccu.table_name      as ref_table,
    ccu.column_name     as ref_column,
    case when ccu.table_name is not null then 'OK' else 'FAIL — FK не найден' end as result
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
    on tc.constraint_name = kcu.constraint_name
   and tc.table_schema = kcu.table_schema
join information_schema.constraint_column_usage ccu
    on tc.constraint_name = ccu.constraint_name
   and tc.table_schema = ccu.table_schema
where tc.table_schema = 'public'
  and tc.constraint_type = 'FOREIGN KEY'
  and tc.table_name in (
      'catalog_subtopic_dim',
      'catalog_unic_dim',
      'catalog_question_dim'
  )
order by tc.table_name, kcu.column_name;

-- ============================================================
-- 5. Индексы
-- ============================================================

select
    indexname,
    case when indexname is not null then 'OK' else 'FAIL — индекс не найден' end as result
from pg_indexes
where schemaname = 'public'
  and indexname in (
      'idx_catalog_subtopic_dim_theme_sort',
      'idx_catalog_unic_dim_subtopic_sort',
      'idx_catalog_unic_dim_theme_id',
      'idx_catalog_unic_dim_counted',
      'idx_catalog_question_dim_unic_sort',
      'idx_catalog_question_dim_subtopic_id',
      'idx_catalog_question_dim_theme_id'
  )
order by indexname;

-- ============================================================
-- 6. Триггеры updated_at
-- ============================================================

select
    event_object_table as table_name,
    trigger_name,
    case when trigger_name is not null then 'OK' else 'FAIL — триггер не найден' end as result
from information_schema.triggers
where trigger_schema = 'public'
  and trigger_name in (
      'trg_catalog_theme_dim_updated_at',
      'trg_catalog_subtopic_dim_updated_at',
      'trg_catalog_unic_dim_updated_at',
      'trg_catalog_question_dim_updated_at'
  )
order by event_object_table;

-- ============================================================
-- 7. RLS включён
-- ============================================================

select
    relname as table_name,
    case when relrowsecurity then 'OK' else 'FAIL — RLS выключен' end as result
from pg_class
where relnamespace = 'public'::regnamespace
  and relname in (
      'catalog_theme_dim',
      'catalog_subtopic_dim',
      'catalog_unic_dim',
      'catalog_question_dim'
  )
order by relname;

-- ============================================================
-- 8. RLS-политики существуют
-- ============================================================

select
    tablename,
    policyname,
    cmd,
    roles,
    case when policyname is not null then 'OK' else 'FAIL — политика не найдена' end as result
from pg_policies
where schemaname = 'public'
  and tablename in (
      'catalog_theme_dim',
      'catalog_subtopic_dim',
      'catalog_unic_dim',
      'catalog_question_dim'
  )
order by tablename;

-- ============================================================
-- 9. Целостность FK: catalog_question_dim → catalog_unic_dim
--    (актуально после наполнения данными в Etap 4)
-- ============================================================

select
    'orphan questions → unic' as check_name,
    count(*) as orphan_count,
    case when count(*) = 0 then 'OK' else 'FAIL — осиротевшие записи' end as result
from public.catalog_question_dim q
where not exists (
    select 1 from public.catalog_unic_dim u where u.unic_id = q.unic_id
);

select
    'orphan unics → subtopic' as check_name,
    count(*) as orphan_count,
    case when count(*) = 0 then 'OK' else 'FAIL — осиротевшие записи' end as result
from public.catalog_unic_dim u
where not exists (
    select 1 from public.catalog_subtopic_dim s where s.subtopic_id = u.subtopic_id
);

-- ============================================================
-- 10. Счётчик строк (после наполнения данными в Etap 4)
--     Ожидаемые значения: 12 тем, 84 подтемы, ~196 уников, ~3561 вопрос
-- ============================================================

select
    'catalog_theme_dim'    as table_name, count(*) as rows, '12'   as expected from public.catalog_theme_dim
union all
select
    'catalog_subtopic_dim' as table_name, count(*) as rows, '84'   as expected from public.catalog_subtopic_dim
union all
select
    'catalog_unic_dim'     as table_name, count(*) as rows, '~196' as expected from public.catalog_unic_dim
union all
select
    'catalog_question_dim' as table_name, count(*) as rows, '~3561' as expected from public.catalog_question_dim
order by table_name;
