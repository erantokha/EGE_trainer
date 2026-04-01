# Migration Plan: Stage 4–10

Дата обновления: 2026-04-01

Этот документ фиксирует детальный план перехода на четырёхслойную архитектуру для этапов 4–10.

Связанные документы:
- [Архитектурный контракт 4 слоёв](architecture_contract_4layer.md)
- [Текущий контекст](current_dev_context.md)
- [Временные исключения](temporary_migration_exceptions.md)
- [Реестр runtime-RPC](../supabase/runtime_rpc_registry.md)

---

## Stage 4 — Dual-run backend

**Суть:** Прежде чем переводить UI, убедиться что новые layer-4 RPC возвращают корректные данные относительно старых. Параллельный запуск нужен чтобы поймать edge cases без риска для пользователей.

**Статус на 2026-04-01:** закрыт.

Фактически закрыто:
- teacher-path parity для `student_analytics_screen_v1` доведён до green
- выполнен compat/data fix для legacy `answer_events` без `section_id`
- browser smoke [stage4_parity_browser_smoke.html](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/stage4_parity_browser_smoke.html) завершился с итогом `ok=14 warn=0 fail=0`
- SQL-артефакты Stage 4 зафиксированы в:
  - [student_analytics_screen_v1.sql](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/docs/supabase/student_analytics_screen_v1.sql)
  - [stage4_parity_smoke.sql](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/docs/supabase/stage4_parity_smoke.sql)
  - [stage4_backfill_section_id.sql](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/docs/supabase/stage4_backfill_section_id.sql)

### Работы:

- Для `student_analytics_screen_v1` с `p_viewer_scope='self'` — сравнить результат с `student_dashboard_self_v2` на реальных студентах
- Зафиксировать расхождения (если есть) и устранить на уровне SQL
- Smoke/rollout check: метрики обоих path'ов совпадают по ключевым полям (`covered`, `solved`, `weak`, `stale`, accuracy)
- Аналогично для teacher path: `student_analytics_screen_v1(teacher)` vs `student_dashboard_for_teacher_v2`

### Критерий закрытия:

Backend-паритет подтверждён на реальных данных, можно переключать UI.

Следующий активный этап: `Stage 5`.

---

## Stage 5 — Student UI Migration

**Суть:** Перевести `stats.js` (self-аналитика ученика) с fallback `rpcAny([old, new])` на единый `student_analytics_screen_v1`.

**Статус на 2026-04-01:** закрыт.

Фактически закрыто:
- `tasks/stats.js` переведён на `student_analytics_screen_v1(p_viewer_scope='self')` — убран `rpcAny`
- подсчёт покрытия в hint исправлен для нового payload-формата (фильтр `all_time.total > 0`)
- browser smoke [stats_self_browser_smoke.html](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/stats_self_browser_smoke.html) завершился с итогом `ok=12 warn=0 fail=0`
- `EX-STUDENT-DASHBOARD-SELF-RPC-FALLBACK` закрыт в [temporary_migration_exceptions.md](temporary_migration_exceptions.md)
- единый canonical contract `student_analytics_screen_v1` теперь покрывает оба viewer-scope: `teacher` и `self`

Следующий активный этап: `Stage 6`.

---

## Stage 6 — Teacher UI Migration

**Суть:** Полный перевод teacher-facing экранов на layer-4. Stage 3 дал backend и перевёл `student.js` — Stage 6 закрывает всё оставшееся.

**Статус на 2026-04-01:** закрыт (аудит подтвердил — работ по коду не потребовалось).

Аудит teacher-facing файлов:
- `tasks/student.js` — 3 call site на `student_analytics_screen_v1(teacher)`, legacy dashboard calls отсутствуют ✅
- `tasks/my_students.js` — использует `teacher_students_summary` (собственный легковесный контракт, не dashboard RPC) ✅
- `tasks/picker.js` teacher-режим — использует `teacher_picking_screen_v2` ✅
- `teacher_students_summary` — достаточен как есть; отдельный layer-4 screen contract для списка учеников не требуется на данном этапе

Следующий активный этап: `Stage 7`.

---

## Stage 7 — Recommendations & Smart-plan backend-driven

**Суть:** Рекомендации (`recommendations.js`, `smart_select.js`) сейчас считаются на фронте поверх dashboard payload. Нужно вынести логику на backend.

**Статус на 2026-04-01:** отложен (deferred).

Причина отсрочки: алгоритмы рекомендаций и smart-plan будут дорабатываться отдельно, в удобное время. Текущие frontend-вычисления (`buildRecommendations`, `buildSmartPlan`) работают корректно поверх нового payload `student_analytics_screen_v1`, поэтому нет технического долга, блокирующего Stage 8. `EX-FRONTEND-RECOMMENDATIONS-AND-SMART-PLAN` остаётся открытым до момента, когда принято решение о переводе алгоритмов на backend.

### Работы (при возобновлении):

- Спроектировать и раскатить `student_recommendations_v1` — backend RPC, возвращающий готовый список рекомендаций на основе канонических метрик (`covered / solved / weak / stale`)
- Спроектировать `student_smart_plan_v1` — заменяет `pickWeakTopicsFromDashboard` в `smart_select.js`
- Перевести следующие файлы на новые RPC:
  - `tasks/recommendations.js`
  - `tasks/smart_select.js`
  - `tasks/smart_hw.js:104`
  - `tasks/stats.js:247`
  - `tasks/student.js` (recommendations block)
- Закрыть `EX-FRONTEND-RECOMMENDATIONS-AND-SMART-PLAN` в [temporary_migration_exceptions.md](temporary_migration_exceptions.md)

### Критерий закрытия:

Рекомендации и smart-plan формируются на backend. Фронт только рендерит готовый payload.

---

## Stage 8 — Legacy cleanup

**Суть:** Убрать весь compat/fallback мусор, накопленный за переходный период.

**Статус на 2026-04-01:** закрыт.

Фактически закрыто:
- `picker.js` student home переведён на прямой `student_analytics_screen_v1(self)`; dead compat path удалён
- teacher-mode compat builder в `picker.js` удалён как мёртвый код
- из `app/providers/homework.js` удалены legacy wrappers `loadStudentDashboardSelfV1`, `loadTeacherDashboardForStudentV1`, `loadTeacherPickingScreenV1`
- удалены Stage-3 smoke артефакты, бывшие единственным runtime-consumer `teacher_picking_screen_v1`
- runtime registry очищен от deprecated RPC:
  - `teacher_picking_screen_v1`
  - `student_dashboard_self_v2`
  - `student_dashboard_for_teacher_v2`
  - `subtopic_coverage_for_teacher_v1`
- browser smoke gate после cleanup зелёный:
  - [teacher_picking_v2_browser_smoke.html](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/teacher_picking_v2_browser_smoke.html) → `ok=14 warn=0 fail=0`
  - [teacher_picking_filters_browser_smoke.html](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/teacher_picking_filters_browser_smoke.html) → `ok=19 warn=0 fail=0`
  - [stats_self_browser_smoke.html](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/stats_self_browser_smoke.html) → `ok=12 warn=0 fail=0`
- `EX-FRONTEND-TEACHER-PICKING-ORCHESTRATION` закрыт; `EX-STUDENT-DASHBOARD-SELF-RPC-FALLBACK` уже был закрыт Stage 5

### Работы:

**Teacher picking orchestration:**
- `tasks/picker.js` — убрать transitional compat restore paths, локальный selection-state, badge-cache
- `tasks/list.js`, `tasks/trainer.js`, `tasks/hw_create.js` — убрать fallback логику, оставить тонкий клиент вокруг `teacher_picking_screen_v2`
- Закрыть `EX-FRONTEND-TEACHER-PICKING-ORCHESTRATION`

**Устаревшие RPC:**
- Удалить `teacher_picking_screen_v1` из реестра и Supabase
- Оценить и удалить `student_dashboard_for_teacher_v2`, `student_dashboard_self_v2`, `subtopic_coverage_for_teacher_v1` если они больше не нужны ни одному потребителю

### Критерий закрытия:

Нет ни одного Stage-8 compat/fallback path. Deprecated RPC убраны из runtime-реестра и live cleanup зафиксирован. Каждый экран — тонкий клиент над одним layer-4 RPC или специализированным canonical contract. Допускается, что Stage-7 deferred exception остаётся открытым отдельно от Stage 8.

Следующий активный этап: `Stage 9`.

---

## Stage 9 — Write-path на canonical event-контур

**Суть:** Ученик пишет ответы через `attempts` / `homework_attempts` — это operational write-контуры. Layer 1 (`answer_events`) должен стать единственным canonical write target.

### Работы:

- Выяснить как сейчас данные из `attempts` попадают в `answer_events` (sync, триггер, или вообще нет)
- Перевести write flow: ответ ученика → `answer_events` напрямую
- `attempts` и `homework_attempts` превращаются в read-проекции (view / materialized view) поверх `answer_events`
- Проверить что layer-3 aggregates корректны на новом write-path
- Smoke по всем сценариям записи: тренажёр, домашнее задание, самостоятельная работа

### Критерий закрытия:

Единственный canonical write path — `answer_events`. Нет расщепления между operational и analytical source.

---

## Stage 10 — Финальная зачистка и приёмка

**Суть:** Архитектурная приёмка всего пути миграции.

### Работы:

- Пройти по всем migration exceptions — убедиться что реестр пуст (все `closed`)
- Удалить deprecated SQL artifacts из Supabase
- Обновить `architecture_contract_4layer.md` как финальный живой документ
- Финальный smoke по всем экранам
- CI guardrails — оставить как постоянный guard или демонтировать по решению

### Критерий закрытия:

Все 10 этапов закрыты. Архитектура полностью соответствует четырёхслойному контракту.

---

## Зависимости между этапами

```
Stage 4 (dual-run)
    └── Stage 5 (student UI)
            └── Stage 7 (recommendations backend)
                    └── Stage 8 (legacy cleanup)
                            └── Stage 10 (приёмка)

Stage 6 (teacher UI) ──────────────┘
Stage 9 (write-path) — независим от 4-8, может идти параллельно
```

## Открытые migration exceptions и их этапы

| Exception | Где | Remove by |
|---|---|---|
| `EX-FRONTEND-RECOMMENDATIONS-AND-SMART-PLAN` | `recommendations.js`, `smart_select.js`, `stats.js`, `student.js` | Stage 7 |
