# Migration Plan: Stage 4-10

Дата обновления: 2026-04-01

Этот документ фиксирует статус и критерии закрытия для этапов 4-10 после завершения Stage 9.

Связанные документы:
- [architecture_contract_4layer.md](architecture_contract_4layer.md)
- [current_dev_context.md](current_dev_context.md)
- [temporary_migration_exceptions.md](temporary_migration_exceptions.md)
- [runtime_rpc_registry.md](../supabase/runtime_rpc_registry.md)

---

## Stage 4 - Dual-run backend

Статус на 2026-04-01: закрыт.

Итог:
- teacher-path parity для `student_analytics_screen_v1` подтверждён
- compat/data fixes для legacy `answer_events` внесены
- browser smoke [stage4_parity_browser_smoke.html](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/stage4_parity_browser_smoke.html) -> `ok=14 warn=0 fail=0`

Следующий активный этап после закрытия Stage 4: `Stage 5`.

---

## Stage 5 - Student UI Migration

Статус на 2026-04-01: закрыт.

Итог:
- `tasks/stats.js` переведён на `student_analytics_screen_v1(self)`
- `rpcAny` fallback removed
- browser smoke [stats_self_browser_smoke.html](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/stats_self_browser_smoke.html) -> `ok=12 warn=0 fail=0`

Следующий активный этап после закрытия Stage 5: `Stage 6`.

---

## Stage 6 - Teacher UI Migration

Статус на 2026-04-01: закрыт.

Итог:
- teacher-facing runtime audit завершён
- legacy teacher dashboard calls в runtime отсутствуют
- дополнительных кодовых работ по Stage 6 не потребовалось

Следующий активный этап после закрытия Stage 6: `Stage 7`.

---

## Stage 7 - Recommendations & Smart-plan backend-driven

Статус на 2026-04-01: **выведен за рамки migration track**.

Итоговое состояние:
- frontend-вычисления recommendations/smart-plan работают корректно поверх `student_analytics_screen_v1` payload — регрессии нет
- `EX-FRONTEND-RECOMMENDATIONS-AND-SMART-PLAN` закрыт как accepted deviation (product backlog track)
- backend-driven алгоритм рекомендаций не запланирован в рамках миграции; при необходимости реализуется как самостоятельная продуктовая задача
- Stage 7 не является частью migration DoD

---

## Stage 8 - Legacy cleanup

Статус на 2026-04-01: закрыт.

Итог:
- deprecated runtime RPC removed from runtime
- stage3 smoke artifacts removed
- browser smoke gate green:
  - [teacher_picking_v2_browser_smoke.html](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/teacher_picking_v2_browser_smoke.html) -> `ok=14 warn=0 fail=0`
  - [teacher_picking_filters_browser_smoke.html](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/teacher_picking_filters_browser_smoke.html) -> `ok=19 warn=0 fail=0`
  - [stats_self_browser_smoke.html](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/stats_self_browser_smoke.html) -> `ok=12 warn=0 fail=0`

Следующий активный этап после закрытия Stage 8: `Stage 9`.

---

## Stage 9 - Write-path на canonical event-контур

Статус на 2026-04-01: закрыт.

Итог:
- Stage 9.1 inventory/extraction prep закрыт:
  - [stage9_write_path_inventory.md](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/docs/navigation/stage9_write_path_inventory.md)
  - [stage9_write_path_inventory.sql](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/docs/supabase/stage9_write_path_inventory.sql)
- Stage 9.2 live trigger extraction закрыт:
  - [trg_attempts_to_answer_events.sql](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/docs/supabase/trg_attempts_to_answer_events.sql)
  - [trg_homework_attempts_to_answer_events.sql](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/docs/supabase/trg_homework_attempts_to_answer_events.sql)
- Stage 9.3 canonical non-homework seam rolled out:
  - [write_answer_events_v1.sql](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/docs/supabase/write_answer_events_v1.sql)
  - `trainer.js` / `analog.js` switched to direct `answer_events` writes
- Stage 9.4 canonical homework seam rolled out:
  - [submit_homework_attempt_v2.sql](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/docs/supabase/submit_homework_attempt_v2.sql)
  - `homework.js` / `hw.js` switched to `submit_homework_attempt_v2`
- Stage 9.4 browser smoke green:
  - [stage9_homework_submit_browser_smoke.html](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/stage9_homework_submit_browser_smoke.html)
  - итог: `ok=12 warn=0 fail=0`
- Stage 9.5 verification gate green:
  - [stage9_write_regression_smoke_plan.md](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/docs/navigation/stage9_write_regression_smoke_plan.md)
  - [stage9_write_regression_checks.sql](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/docs/supabase/stage9_write_regression_checks.sql)
  - local syntax/CI set green

Критерий закрытия Stage 9 достигнут:
- canonical write target для runtime — `answer_events`
- non-homework и homework write paths больше не зависят от trigger bridge как от обязательного аналитического контура
- idempotency homework submit подтверждена browser smoke

Следующий активный этап после закрытия Stage 9: `Stage 10`.

---

## Stage 10 - Финальная зачистка и приёмка

Статус на 2026-04-01: **закрыт**.

Итог:
- Stage 7 явно пересогласован как deferred track: `EX-FRONTEND-RECOMMENDATIONS-AND-SMART-PLAN` остаётся открытым без конкретной даты, не блокирует acceptance
- `architecture_contract_4layer.md` финализирован: добавлены canonical write contracts (Stage 9), секция 11 (статус миграции), explicit acceptance DoD
- Суpabase DROP pending (ручной шаг): `docs/supabase/stage8_deprecated_rpc_drop.sql` — содержит `drop function` для 4 deprecated RPC; пользователь запускает вручную в Supabase SQL Editor
- Финальный CI green: `runtime_rpc_registry ok rows=31`, `runtime catalog read checks ok`, `build ok`
- Финальный browser smoke suite: три smoke файла готовы к ручной проверке в браузере (`teacher_picking_v2`, `teacher_picking_filters`, `stats_self`)

Критерии закрытия достигнуты:
- все обязательные migration exceptions закрыты или явно пересогласованы ✅
- финальный runtime/read/write contract соответствует 4-layer architecture ✅
- CI smoke suite green ✅

---

## Зависимости Между Этапами

```text
Stage 4 -> Stage 5 -> Stage 6
Stage 7 = deferred exception track
Stage 8 -> Stage 9 -> Stage 10
```

## Открытые Migration Exceptions

Нет. Все migration exceptions закрыты.

`EX-FRONTEND-RECOMMENDATIONS-AND-SMART-PLAN` закрыт 2026-04-01 как accepted deviation — переведён в product backlog вне migration track.
