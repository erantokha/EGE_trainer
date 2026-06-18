-- ============================================================================
-- W13.4 ДИАГНОСТИКА 3 — screen_v1 (то, что реально ест фронт). Supabase SQL editor.
-- proto_state УЖЕ доказанно отдаёт числа по №13 (T1). Проверяем: доходят ли они
-- до JSON, который фронт читает: student_analytics_screen_v1('self', source='all').
-- Скопируй вывод T4 и T5 обратно в чат.
-- ============================================================================

-- T4. Сколько элементов в topics/sections ответа screen_v1 и есть ли среди них №13.
begin;
set local request.jwt.claims = '{"sub":"69a60e96-0aa2-4df8-99d3-4b6dcb961b38","role":"authenticated"}';
select
  jsonb_array_length(coalesce(j->'topics',   '[]'::jsonb)) as topics_count,
  jsonb_array_length(coalesce(j->'sections', '[]'::jsonb)) as sections_count,
  (select count(*) from jsonb_array_elements(coalesce(j->'topics','[]'::jsonb)) e
     where coalesce(e->>'theme_id', e->>'section_id') = '13') as topics_13_count,
  (select count(*) from jsonb_array_elements(coalesce(j->'sections','[]'::jsonb)) e
     where coalesce(e->>'section_id', e->>'theme_id') = '13') as sections_13_count
from (
  select public.student_analytics_screen_v1('self', null, 30, 'all', 'init') as j
) r;
commit;

-- T5. Сами элементы topics[] по №13 целиком (видно все поля, в т.ч. subtopic_last3_avg_pct).
--   • Если строк нет → screen_v1 НЕ включает №13 в topics[] (корень — в screen_v1).
--   • Если строки есть, а subtopic_last3_avg_pct=null/0 → screen_v1 теряет поле (корень — в screen_v1).
--   • Если subtopic_last3_avg_pct>0 → JSON корректен, корень чисто во фронте/кеше.
begin;
set local request.jwt.claims = '{"sub":"69a60e96-0aa2-4df8-99d3-4b6dcb961b38","role":"authenticated"}';
select t as topic_element_13
from (
  select public.student_analytics_screen_v1('self', null, 30, 'all', 'init') as j
) r,
lateral jsonb_array_elements(r.j->'topics') t
where coalesce(t->>'theme_id', t->>'section_id') = '13'
order by t->>'subtopic_id';
commit;
