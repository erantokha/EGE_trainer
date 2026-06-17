# W13.2b — самооценка ученика части 2. Отчёт (завершён)

Дата 2026-06-18. Слайс W13.2b: ученик ставит самооценку 0/1/2 за №13 → пишется в БД → отдельный прогноз
«самооценка» в градуснике. **Официальный балл (teacher_score) — W13.2c.** build `2026-06-18-5-030326`.

## SQL (залито оператором)
`docs/supabase/part2_attempt_reviews.sql`: таблица + RLS (ученик читает свои) + RPC
`submit_part2_self_score_v1` (security definer, пишет только self_score для auth.uid()). Зарегистрирован
в `runtime_rpc_registry` (53/53). Проверки на проде прошли (таблица/RLS/RPC live).

## FE (готово, НЕ закоммичено)
- **Контрол самооценки** — `tasks/part2_render.js` `buildPart2SelfScore` (0/1/2 + статус); проводка в
  `tasks/trainer.js` (renderCurrent + renderSheetList, после эталона, source='test'); провайдер
  `app/providers/part2.js` `submitPart2SelfScore`→RPC. CSS в `tasks/trainer/part2.css`.
- **Прогноз «самооценка»** — `picker_stats.js`: вынесен `forecastPrimaryFromSections` (per-task max,
  часть 1 = 1, №13 = 2) + `updateSelfScoreForecast` (официальный прогноз/градусник НЕ трогает, пишет
  отдельную видимую строку `#sfSelfNote` = часть 1 + вклад self_score части 2). Read self-баллов —
  `getMyPart2SelfScores` (прямой select, RLS свои); `picker.js` читает (гейт `IS_STUDENT_PAGE`) и зовёт
  в `applyDashboardHomeStats`. DOM `#sfSelfNote` в `home_student.html` + `.sf-self-note` в
  `home-student.css` (готча: `.sf-note` оказался sr-only → сделан отдельный ВИДИМЫЙ класс).

## Проверки
- Часть 1 scoring **байт-в-байт** (`reports/w13_2/_scale_check.mjs`); `forecastPrimaryFromSections`:
  part1 base 2.30, №13×2 → 3.00 — корректно.
- `node --check` (picker_stats/picker/part2/part2_render/trainer) — OK; governance (rpc 53/53, no_eval) —
  зелёное; `print-features` 36/0.
- Скриншоты через реальные модули: `shot_selfscore.png` (контрол «1»/Сохранено), `shot_forecast.png`
  (официальный 25,8 / Первичные 4,75 + строка «С учётом самооценки части 2: 5,75 перв → 32,3 втор»).

## Не верифицировано вживую (флаг)
`getMyPart2SelfScores` (прямой select на новую таблицу) полагается на дефолт-гранты Supabase для
`authenticated` (как каталог-dims). Если при live-тесте select даст permission denied — нужен
`grant select on public.part2_attempt_reviews to authenticated;` (1 строка, деплой оператора). Сейчас
деградирует мягко: try/catch→`[]`, строка «самооценка» просто скрыта (официальный прогноз не страдает).

## Накопленный незакоммиченный фронт
На проде SQL актуален (W13.1 + W13.2a-таблица), но FE-код **не запушен**: W13.1-fix, W13.2a (шкала),
W13.2b (самооценка). До commit+push на живом сайте part-2-UI не появится. Коммит/пуш — за оператором.

## Дальше — W13.2c (учитель), блокер §5.0
teacher_score + teacher-write RPC (гейт accepted-связь + скоуп + аудит) + teacher-select RLS + read-side
official + прогноз «подтверждённый» + UI в `renderReviewCards`. Предусловие: §5.0-выгрузка гейтов из прода
(`reports/w13_2/extract_prod_gates.sql`).
