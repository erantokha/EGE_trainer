# W13.2d — ДЗ part-2 SOLVE UX. Отчёт

Дата 2026-06-18. build `2026-06-18-7-042206`. **Frontend-only** (инфра баллов из W13.2b/c уже залита; SQL не
трогался). Не закоммичено. План `W13_2d_PLAN.md`.

## §5.1 RECON (итог: pure-FE)
- `submit_homework_attempt_v2`: `total/correct` берутся из **аргументов** `p_total/p_correct` (не из payload)
  → исключение части 2 из X/Y делается чисто во фронте. Валидация payload: object + questions array
  (BAD_PAYLOAD/BAD_PAYLOAD_QUESTIONS) — наш payload ей соответствует.
- answer_events пишутся из `payload.questions where topic_id is not null` → part-2 (в payload для teacher-review)
  попадёт в answer_events с `correct=false`. **submit/триггер НЕ трогаю** (red-zone) → принял как известное
  следствие (см. ниже).

## Сделано (`tasks/hw.js`, pure-FE)
- **§5.2/§5.3 Solve-рендер part-2** (`renderHomeworkList`): ветка `isPart2Question` — условие а/б через
  `renderPart2Stem`, **вместо текстового поля** — `buildPart2EtalonBlock` + контрол самооценки 0/1/2
  (`buildPart2SelfScore`) → `submitPart2SelfScore(qid, score, {source:'hw', hwAttemptId})`. №1..12 — прежним
  путём (setStem + input). `buildQuestion` уже несёт part-2 (W13.2c).
- **§5.4 Tally/сдача**: `total`/«пусто»/`correct` считаются **только по части 1** (`finishSession` +
  `onFinishClick`); часть 2 пропускается в checkFree. X/Y части 1 не меняется (для ДЗ без part-2 `filter`
  тождественен → нулевой регресс).
- **§5.5 Result-summary**: X/Y = часть 1; часть 2 видна в разборе (`renderReviewCards`, part-2-aware из W13.2c —
  «Самооценка ученика: N · Балл учителя: M» + статус). Отдельный summary-блок не добавлял (разбор покрывает).

## Проверки (зелёные)
`node --check` (hw/part2_render/part2) — OK; часть 1 scoring **байт-в-байт** (`_scale_check.mjs`); governance
(rpc 54/54, catalog, no_eval) — ok; print 36/0. Визуал solve-карточки части 2 = те же компоненты, что на
`reports/w13_2/shot_selfscore.png` (эталон + самооценка 0/1/2).

## Известное следствие (флаг, НЕ блокер)
ДЗ-попытка с №13 пишет для part-2 строки `answer_events` с `correct=false` (т.к. part-2 в payload для разбора).
Следствие: бейдж точности №13 может показывать 0%. **Градусник/прогноз это НЕ затрагивает** (часть 2 в прогнозе
идёт по `part2_attempt_reviews`: self/teacher_score, не по answer_events). Чистая фикса (submit/триггер
пропускают part-2 в answer_events) — red-zone write-path; предлагаю отдать в будущую analytics-волну части 2
(там же §5.0 + интеграция teacher_score в `student_topic_state_v1`).

## Не верифицировано вживую
Полный ДЗ-loop (ученик решает №13 в ДЗ → self_score source='hw' → учитель `?as_teacher=1` подтверждает →
прогноз «подтверждённый») — нужен live-тест оператора (ДЗ с №13 + push фронта). Чтения part2-таблицы — те же
дефолт-гранты Supabase, что в W13.2b/c.

## Накопленный незакоммиченный фронт
W13.1-fix + W13.2a + W13.2b + W13.2c + W13.2d — всё не запушено. Для live-теста нужен commit+push (оператор).
