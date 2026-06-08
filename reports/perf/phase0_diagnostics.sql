-- ============================================================================
-- ФАЗА 0 — ДИАГНОСТИКА производительности подбора задач (READ-ONLY, безопасно).
-- Запускать в Supabase → SQL Editor. Ничего не меняет (только SELECT/EXPLAIN).
-- Цель: подтвердить Seq Scan по answer_events + снять базовое время сканов,
-- чтобы потом (после индекса, Фаза 1) сравнить.
--
-- ПОРЯДОК: выполнить блок 1 → взять оттуда student_id с наибольшим n →
-- подставить его вместо  '<STUDENT_UUID>'  в блоках 3 и 4 → выполнить 2,3,4.
-- Вывод каждого блока пришли мне (особенно строки "Seq Scan"/"Index Scan" и "actual time=").
-- ============================================================================


-- ── Блок 1. Кто из учеников «тяжёлый» (много истории) — на нём меряем худший случай ──
SELECT student_id, count(*) AS events
FROM public.answer_events
GROUP BY student_id
ORDER BY events DESC
LIMIT 5;


-- ── Блок 2. Какие индексы СЕЙЧАС есть на answer_events (ждём: только uniq-дедуп записи) ──
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'answer_events';


-- ── Блок 3. EXPLAIN скана #1 (all-time агрегаты по прототипам) — это CTE proto_events
--    из student_proto_state_v1. Подставь реальный student_id из блока 1. ──
EXPLAIN (ANALYZE, BUFFERS)
WITH visible_questions AS (
  SELECT q.question_id, q.unic_id
  FROM public.catalog_question_dim q
  JOIN public.catalog_unic_dim u
    ON u.unic_id = q.unic_id AND u.subtopic_id = q.subtopic_id AND u.theme_id = q.theme_id
  JOIN public.catalog_subtopic_dim s
    ON s.subtopic_id = u.subtopic_id AND s.theme_id = u.theme_id
  JOIN public.catalog_theme_dim t
    ON t.theme_id = s.theme_id
  WHERE coalesce(q.is_enabled, true) AND NOT coalesce(q.is_hidden, false)
    AND coalesce(u.is_enabled, true) AND NOT coalesce(u.is_hidden, false)
    AND coalesce(s.is_enabled, true) AND NOT coalesce(s.is_hidden, false)
    AND coalesce(t.is_enabled, true) AND NOT coalesce(t.is_hidden, false)
)
SELECT
  vq.unic_id,
  count(*)::int                                          AS attempt_count_total,
  count(*) FILTER (WHERE ae.correct)::int                AS correct_count_total,
  count(DISTINCT ae.question_id)::int                    AS unique_question_ids_seen,
  max(coalesce(ae.occurred_at, ae.created_at))           AS last_attempt_at
FROM public.answer_events ae
JOIN visible_questions vq ON vq.question_id = ae.question_id
WHERE ae.student_id = 'f1d03f75-08ad-48e6-9128-8f69afefe81e'
GROUP BY vq.unic_id;


-- ── Блок 4. EXPLAIN скана #2 (окно «последние 3 попытки») — CTE proto_last3.
--    Тот же student_id. Этот скан нужен ТОЛЬКО для бейджа %/3 (его уберём в Фазе 2/3). ──
EXPLAIN (ANALYZE, BUFFERS)
WITH visible_questions AS (
  SELECT q.question_id, q.unic_id
  FROM public.catalog_question_dim q
  JOIN public.catalog_unic_dim u
    ON u.unic_id = q.unic_id AND u.subtopic_id = q.subtopic_id AND u.theme_id = q.theme_id
  JOIN public.catalog_subtopic_dim s
    ON s.subtopic_id = u.subtopic_id AND s.theme_id = u.theme_id
  JOIN public.catalog_theme_dim t
    ON t.theme_id = s.theme_id
  WHERE coalesce(q.is_enabled, true) AND NOT coalesce(q.is_hidden, false)
    AND coalesce(u.is_enabled, true) AND NOT coalesce(u.is_hidden, false)
    AND coalesce(s.is_enabled, true) AND NOT coalesce(s.is_hidden, false)
    AND coalesce(t.is_enabled, true) AND NOT coalesce(t.is_hidden, false)
)
SELECT e.unic_id,
       count(*) FILTER (WHERE e.rn <= 3)::int                  AS last3_total,
       count(*) FILTER (WHERE e.rn <= 3 AND e.correct)::int    AS last3_correct
FROM (
  SELECT vq.unic_id, ae.correct,
         row_number() OVER (
           PARTITION BY vq.unic_id
           ORDER BY coalesce(ae.occurred_at, ae.created_at) DESC, ae.created_at DESC, ae.id DESC
         ) AS rn
  FROM public.answer_events ae
  JOIN visible_questions vq ON vq.question_id = ae.question_id
  WHERE ae.student_id = 'f1d03f75-08ad-48e6-9128-8f69afefe81e'
) e
GROUP BY e.unic_id;


-- ── (опц.) Блок 5. Сколько всего событий и сколько у выбранного ученика ──
-- SELECT count(*) AS total_events FROM public.answer_events;
-- SELECT count(*) AS my_events FROM public.answer_events WHERE student_id = '<STUDENT_UUID>';
