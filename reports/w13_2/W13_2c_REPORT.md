# W13.2c — учительское подтверждение балла части 2. Отчёт

Дата 2026-06-18. build `2026-06-18-6-033942`. SQL залит оператором; FE готов, не закоммичен.

## SQL (залито)
`docs/supabase/part2_teacher_review.sql`: RPC `confirm_part2_teacher_score_v1` (гейт ownership
`homework_links.owner_id` + accepted `teacher_students` + скоуп на attempt; teacher_score+аудит) +
teacher-select RLS. **§5.0 не понадобилась** (гейт на teacher_students, не is_teacher). Реестр 54/54.

## FE (готово)
- **Провайдер** `app/providers/part2.js`: `confirmPart2TeacherScore`, `getPart2ReviewsForAttempt`,
  `getMyPart2Scores` (self+teacher).
- **Teacher-review UI** `tasks/hw.js`: `buildQuestion` несёт part-2; `renderReviewCards` — ветка part-2
  (stem а/б + эталон для сверки + «Самооценка ученика: N · Балл учителя: M» + контрол 0/1/2 «подтвердить»
  → RPC, **только при `?as_teacher=1`**); `ensurePart2ReviewsLoaded` пред-заполняет баллы; `part2.css`
  подключён к `hw.html`.
- **Прогноз «подтверждённый»** `tasks/picker.js`+`picker_stats.js`: официальный градусник ученика =
  часть 1 + **teacher_score** части 2; строка «самооценка» = self_score (раздельно). До подтверждения
  учителем teacher_score нет → официальный = часть 1 (без регресса).

## Проверки (зелёные)
Синтаксис (hw/picker/picker_stats/part2/part2_render) — OK; часть 1 scoring **байт-в-байт**; governance
(RPC 54/54, no_eval, catalog) — ok; print 36/0. **Forecast verified** (`reports/w13_2/shot_forecast_confirmed.png`):
официальный 38,5 (Первичные 6,75 = часть 1 4,75 + teacher №13 2,0) + строка «самооценка» 5,75→32,3. console clean.

## НЕ верифицировано вживую (флаг)
- **Teacher-review флоу в hw.js** — нет teacher-харнесса; нужен **live-тест оператора**: ДЗ с №13 → ученик
  сдаёт → учитель открывает отчёт `?as_teacher=1` → видит эталон + ставит 0/1/2 → RPC пишет teacher_score →
  у ученика официальный прогноз «подтверждённый» растёт.
- Чтения `part2_attempt_reviews` (self/teacher) — те же дефолт-гранты Supabase, что и в W13.2b (если
  permission denied — `grant select ... to authenticated`). Деградация мягкая (баллы «—», прогноз скрыт).

## Остаток / follow-up
- **ДЗ part-2 SOLVE UX** (`hw.js` solve-флоу): ученик решает №13 в ДЗ с эталоном + самооценкой (source='hw').
  Сейчас teacher-review работает независимо (RPC upsert создаёт строку), но student-solve part-2 в ДЗ
  рендерится базово — отдельный шаг.
- **Глубокая аналитика teacher_score** (`student_topic_state_v1` и пр., §5.6) — отдельная будущая волна
  (там понадобится §5.0-выгрузка `is_teacher_for_student`).

## Накопленный незакоммиченный фронт
W13.1-fix + W13.2a + W13.2b + W13.2c — всё **не запушено**. На проде SQL актуален; FE на сайте только из
W13.1. Для live-теста W13.2 нужен commit+push (оператор).
