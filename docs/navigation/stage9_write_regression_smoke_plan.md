# Stage 9.5 Write Regression Smoke Plan

Дата обновления: 2026-04-01

Этот документ подготавливает Stage 9.5: финальную проверку write-path после
реализации Stage 9.3 и Stage 9.4.

Связанные документы:
- [Stage 9.3 Non-homework Write Migration](stage9_non_homework_write_migration.md)
- [Stage 9.4 Homework Write Migration](stage9_homework_write_migration.md)
- [Stage 9.5 Write Regression SQL Checks](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/docs/supabase/stage9_write_regression_checks.sql)
- [stage9_homework_submit_browser_smoke.html](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/stage9_homework_submit_browser_smoke.html)
- [student_analytics_screen_v1_browser_smoke.html](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/student_analytics_screen_v1_browser_smoke.html)
- [stats_self_browser_smoke.html](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/stats_self_browser_smoke.html)

## 1. Цель Stage 9.5

Подтвердить три вещи одновременно:
- новые write seams реально пишут в `answer_events`;
- retry/idempotency не создаёт дублей;
- layer-3 / layer-4 read-side не сломан после смены write-path.

Stage 9.5 не вводит новые runtime контракты.
Это verification gate после внедрения Stage 9.3 и 9.4.

## 2. Обязательные срезы проверки

### 2.1. Non-homework write

Проверяются сценарии:
- короткая trainer-session
- один analog solve
- retry того же submit/path, если реализован retry-flow

Что должно подтвердиться:
- строки появились в `answer_events` с `source='test'`
- `test_attempt_id` заполнен
- число строк равно числу уникальных `question_id`
- повтор не создаёт дублей

### 2.2. Homework write

Проверяются сценарии:
- первый submit homework attempt
- повторный submit той же attempt
- refresh result screen после submit

Что должно подтвердиться:
- строки появились в `answer_events` с `source='hw'`
- `hw_attempt_id` и `homework_id` заполнены
- число строк равно числу уникальных `question_id` в payload
- повторный submit не создаёт дублей
- `homework_attempts.finished_at` и result-screen восстановление работают стабильно

### 2.3. Analytics regression

Проверяются сценарии:
- self analytics
- teacher analytics
- teacher summary / topic-state consumers не теряют новые события

Что должно подтвердиться:
- новые записи видны в canonical read contracts
- regression в `student_analytics_screen_v1` отсутствует
- regression в downstream aggregates отсутствует

## 3. CI и syntax-check

Минимальный набор после Stage 9 write changes:

```powershell
node tools/check_runtime_rpc_registry.mjs
node --check app/providers/supabase-write.js
node --check app/providers/homework.js
node --check tasks/trainer.js
node --check tasks/analog.js
node --check tasks/hw.js
node --check tasks/stats_self_browser_smoke.js
node --check tasks/student_analytics_screen_v1_browser_smoke.js
```

Если write-path меняет ещё и SQL registry/process:

```powershell
node tools/check_build.mjs
```

## 4. SQL sanity-checks

Базовый SQL checklist:
- [stage9_write_regression_checks.sql](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/docs/supabase/stage9_write_regression_checks.sql)

Он должен позволять быстро проверить:
- последние `answer_events` по `student_id`
- отсутствие дублей по `test_attempt_id + question_id`
- отсутствие дублей по `hw_attempt_id + question_id`
- заполненность `section_id`, `topic_id`, `question_id`
- связку `homework_attempts.finished_at` -> `answer_events`

## 5. Browser/manual smoke gate

После реальной записи новых событий нужно прогнать:

- [stats_self_browser_smoke.html](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/stats_self_browser_smoke.html)
  - self analytics после новых writes
- [student_analytics_screen_v1_browser_smoke.html](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/student_analytics_screen_v1_browser_smoke.html)
  - teacher/self analytics payload целиком

Если изменения затронули teacher-facing summary flow, дополнительно:
- [teacher_picking_v2_browser_smoke.html](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/teacher_picking_v2_browser_smoke.html)
- [teacher_picking_filters_browser_smoke.html](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/teacher_picking_filters_browser_smoke.html)

## 6. Рекомендуемый порядок прогона

1. Syntax-check и registry check
2. Non-homework manual write
3. SQL sanity-check для `source='test'`
4. Homework manual write
5. SQL sanity-check для `source='hw'`
6. Browser smoke по analytics
7. Если всё зелёное, обновить навигационные документы и статус Stage 9

## 7. Красные флаги

Stage 9.5 нельзя считать зелёным, если обнаружено хотя бы одно из:
- дубль по `source='test' + test_attempt_id + question_id`
- дубль по `source='hw' + hw_attempt_id + question_id`
- новые события без `section_id`
- write прошёл, но analytics payload не отражает новые данные
- homework result screen восстанавливается, но `answer_events` не записались
- `answer_events` записались, но `homework_attempts.finished_at` не проставился

## 8. Definition of Done

Stage 9.5 считается подготовленным, когда:
- есть единый smoke plan для non-homework, homework и analytics regression;
- есть SQL checklist для quick sanity-check;
- известен минимальный CI/syntax набор;
- можно однозначно сказать, что именно считать green после реализации 9.3 и 9.4.
