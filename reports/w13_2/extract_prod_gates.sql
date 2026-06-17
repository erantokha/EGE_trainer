-- W13.2 §5.0 — ВЫГРУЗКА из прода (выполняет ОПЕРАТОР в Supabase SQL Editor).
-- Цель: получить реальные дефиниции гейт-хелперов + RLS-политик + DDL таблиц,
-- которых нет в репо (governance-дрейф), чтобы новый teacher-write строился поверх
-- отревьюенного кода, а не вслепую. Результаты вставить в docs/supabase/ (по файлу на
-- объект) и сверить с ожиданием (stop-ask при расхождении репо↔прод).

-- 1) Дефиниции гейт-функций (полный CREATE FUNCTION с телом и security-режимом)
select p.proname,
       pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('is_teacher_for_student', 'is_allowed_teacher', 'is_teacher')
order by p.proname;

-- 2) RLS-политики на ключевых таблицах (qual = USING, with_check = WITH CHECK)
select schemaname, tablename, policyname, cmd, permissive, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('profiles', 'teachers', 'teacher_students', 'answer_events', 'homework_attempts')
order by tablename, policyname;

-- 3) Включён ли RLS на этих таблицах
select c.relname, c.relrowsecurity, c.relforcerowsecurity
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('profiles', 'teachers', 'teacher_students', 'answer_events', 'homework_attempts');

-- 4) DDL-колонки homework_attempts / answer_events / teacher_students
--    (нужно для проектирования хранилища self_score/teacher_score/status)
select table_name, ordinal_position, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in ('homework_attempts', 'answer_events', 'teacher_students')
order by table_name, ordinal_position;

-- 5) Грейфы/гранты на гейт-функции (кто может вызывать)
select p.proname, array_agg(distinct acl.grantee::regrole::text) as grantees
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
left join lateral aclexplode(p.proacl) acl on true
where n.nspname = 'public'
  and p.proname in ('is_teacher_for_student', 'is_allowed_teacher', 'is_teacher')
group by p.proname;
