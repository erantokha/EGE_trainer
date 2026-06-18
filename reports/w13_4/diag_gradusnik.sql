-- ============================================================================
-- W13.4 ДИАГНОСТИКА: почему градусник/% №13 не растёт после self-балла
-- Запускать в Supabase SQL editor (service role → RLS off, auth.uid() = null).
-- Скопируй ВЫВОД каждого блока D1..D5 обратно в чат.
-- НИЧЕГО НЕ МЕНЯЕТ (только select). RPC не зовём — они требуют auth.uid().
-- ============================================================================

-- D1. Записалась ли самооценка вообще? (последние строки ревью части 2)
--     Смотрим: есть ли строки, какой question_id, self_score, source, max_primary.
select student_id, question_id, source, self_score, teacher_score, max_primary,
       created_at, updated_at
from public.part2_attempt_reviews
order by updated_at desc
limit 10;

-- D2. Сходится ли join question_id → каталог? (in_catalog=true → найдено в catalog_question_dim)
--     ЕСЛИ in_catalog=false → формат/гранулярность id в ревью ≠ catalog_question_dim (корень).
select r.question_id,
       (q.question_id is not null) as in_catalog,
       q.unic_id, q.subtopic_id, q.theme_id,
       q.is_enabled, q.is_hidden
from (select distinct question_id from public.part2_attempt_reviews) r
left join public.catalog_question_dim q on q.question_id = r.question_id
order by r.question_id
limit 50;

-- D3. Видимость цепочки theme→subtopic→unic для №13.
--     visible_* в proto_state требует (is_enabled=true AND is_hidden=false).
--     ЕСЛИ строк нет ИЛИ is_hidden=true/is_enabled=false → №13 отсекается из visible_* (корень).
select 'theme'    as lvl, theme_id    as id, is_enabled, is_hidden from public.catalog_theme_dim    where theme_id = '13'
union all
select 'subtopic' as lvl, subtopic_id as id, is_enabled, is_hidden from public.catalog_subtopic_dim where theme_id = '13'
union all
select 'unic'     as lvl, unic_id     as id, is_enabled, is_hidden from public.catalog_unic_dim     where theme_id = '13'
order by 1, 2
limit 80;

-- D4. Ручная репликация part2_events: что аналитика ДОЛЖНА посчитать (accuracy по прото).
--     ЕСЛИ тут есть строки с accuracy_pct>0 → источник+join+агрегация в порядке,
--     значит проблема ниже по течению (topic_state-дрейф / p_source / кеш FE).
select vq.unic_id, vq.subtopic_id,
       count(*) as attempts,
       round(avg(coalesce(r.teacher_score, r.self_score)::numeric / nullif(r.max_primary, 0)) * 100) as accuracy_pct
from public.part2_attempt_reviews r
join public.catalog_question_dim vq on vq.question_id = r.question_id
where coalesce(r.teacher_score, r.self_score) is not null
group by vq.unic_id, vq.subtopic_id
order by vq.subtopic_id;

-- D5. Дрейф: читает ли прод-версия student_topic_state_v1 именно student_proto_state_v1?
--     Если в теле НЕТ вызова student_proto_state_v1, а есть прямой answer_events →
--     мой фикс proto_state до градусника не доходит (нужно править topic_state).
select pg_get_functiondef('public.student_topic_state_v1(uuid,text)'::regprocedure);
