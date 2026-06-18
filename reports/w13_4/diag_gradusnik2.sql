-- ============================================================================
-- W13.4 ДИАГНОСТИКА 2 — решающие тесты. Supabase SQL editor (service role).
-- Студент из D1: 69a60e96-0aa2-4df8-99d3-4b6dcb961b38
-- Скопируй вывод T1, T2, T3 обратно в чат.
-- ============================================================================

-- T1 (РЕШАЮЩИЙ). Зовём РЕАЛЬНУЮ задеплоенную student_proto_state_v1 от имени ученика
--     (auth.uid() берётся из jwt-claims). Это проверяет ВСЁ разом: деплой новой версии,
--     исключение answer_events для '13', part2-ветку, и видимость каталога.
--   • Если строки №13 есть и last3_accuracy>0 → proto_state РАБОТАЕТ (проблема в FE/кеше/p_source).
--   • Если строки №13 есть, но всё по нулям/last3_total=0 → part2-ветка не матчит.
--   • Если строк №13 НЕТ вовсе → visible-цепочка отсекает №13 (см. T2).
begin;
set local request.jwt.claims = '{"sub":"69a60e96-0aa2-4df8-99d3-4b6dcb961b38","role":"authenticated"}';
select theme_id, subtopic_id, unic_id,
       attempt_count_total, correct_count_total, accuracy,
       last3_total, last3_correct, last3_accuracy
from public.student_proto_state_v1('69a60e96-0aa2-4df8-99d3-4b6dcb961b38', 'all')
where theme_id = '13'
order by subtopic_id, unic_id;
commit;

-- T2. По уровням: есть ли №13 в dim-таблицах и не скрыт ли (visible_* требует enabled AND NOT hidden).
--     Если на каком-то уровне строк нет ИЛИ is_hidden=true/is_enabled=false — корень тут.
select 'theme'    as lvl, theme_id    as id, is_enabled, is_hidden from public.catalog_theme_dim    where theme_id = '13'
union all
select 'subtopic' as lvl, subtopic_id as id, is_enabled, is_hidden from public.catalog_subtopic_dim where theme_id = '13'
union all
select 'unic'     as lvl, unic_id     as id, is_enabled, is_hidden from public.catalog_unic_dim     where theme_id = '13'
order by 1, 2;

-- T3. Подтверждение деплоя: содержит ли тело функции part2-ветку (part2_attempt_reviews)
--     и исключение answer_events (theme_id <> '13'). true/true = новая версия применена.
select
  position('part2_attempt_reviews' in def) > 0 as has_part2_branch,
  position('vq.theme_id <> ''13''' in def)  > 0 as has_answerevents_exclusion
from (
  select pg_get_functiondef('public.student_proto_state_v1(uuid,text)'::regprocedure) as def
) s;
