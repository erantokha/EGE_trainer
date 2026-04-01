# Current Dev Context

Дата обновления: 2026-04-01 (Stage 10 — финальный acceptance закрыт)

Этот файл нужен как быстрый handoff для нового окна или новой сессии, чтобы за 5-10 минут войти в контекст текущей миграции.

## 1. Snapshot

- Репозиторий: `EGE_repo`
- Ветка: `main`
- Stages 0–9: **закрыты**
- Stage 7: **отложен** (`deferred` — без конкретной даты)
- Stage 10: **закрыт** (финальный acceptance)
- Следующий рабочий блок: нет активной миграции; deferred Stage 7 возобновляется отдельно по решению команды

Быстрые маркеры финального состояния:
- `runtime_rpc_registry ok`
- `rows=31 standalone_sql=31 snapshot_only=0 missing_in_repo=0`
- `runtime catalog read checks ok`
- `build ok`
- `student_analytics_screen_v1` — canonical Layer-4 read contract (student + teacher scope)
- `teacher_picking_screen_v2` — canonical Layer-4 teacher-picking contract
- `write_answer_events_v1` — canonical non-homework write contract
- `submit_homework_attempt_v2` — canonical homework write contract

## 2. Архитектурный Итог

Цель 4-layer архитектуры достигнута:

| Слой | Что | Статус |
|---|---|---|
| Layer 1 | `answer_events` как source of truth | ✅ |
| Layer 2 | `catalog_*_dim` как canonical backend catalog | ✅ |
| Layer 3 | `student_proto_state_v1`, `student_topic_state_v1` | ✅ |
| Layer 4 | `student_analytics_screen_v1`, `teacher_picking_screen_v2` | ✅ |
| Write path | `write_answer_events_v1`, `submit_homework_attempt_v2` | ✅ |

## 3. Что Отложено

Открытых migration exceptions: **1**

- `EX-FRONTEND-RECOMMENDATIONS-AND-SMART-PLAN` — recommendations и smart-plan считаются на фронте поверх `student_analytics_screen_v1` payload.
  - Затрагивает: `recommendations.js`, `smart_select.js`, `student.js:1194`, `stats.js:247`, `smart_hw.js:104`
  - Целевой этап: Stage 7 (deferred)
  - Frontend-вычисления работают корректно; backend-driven алгоритм не утверждён

## 4. Финальный Smoke (подтверждён 2026-04-01)

Все ручные шаги выполнены:

**Supabase DROP** — выполнен (`stage8_deprecated_rpc_drop.sql`):
- `teacher_picking_screen_v1` — dropped ✅
- `student_dashboard_self_v2` — dropped ✅
- `student_dashboard_for_teacher_v2` — dropped ✅
- `subtopic_coverage_for_teacher_v1` — dropped ✅

**Browser smoke** — все зелёные:
- `teacher_picking_v2_browser_smoke` → `ok=14 warn=0 fail=0` ✅
- `teacher_picking_filters_browser_smoke` → `ok=19 warn=0 fail=0` ✅
- `stats_self_browser_smoke` → `ok=12 warn=0 fail=0` ✅

## 5. Что Читать Первым (для нового контекста)

Если нужно быстро войти в архитектурный контекст:
1. [architecture_contract_4layer.md](architecture_contract_4layer.md) — финальный living document
2. [temporary_migration_exceptions.md](temporary_migration_exceptions.md) — 1 открытый exception
3. [runtime_rpc_registry.md](../supabase/runtime_rpc_registry.md) — 31 RPC, rows=31

Если нужно войти в read-path:
1. [student_analytics_screen_v1_spec.md](student_analytics_screen_v1_spec.md)
2. [teacher_picking_screen_v2_spec.md](teacher_picking_screen_v2_spec.md)

Если нужно войти в write-path:
1. [stage9_canonical_write_seam_spec.md](stage9_canonical_write_seam_spec.md)
2. [stage9_homework_submit_seam_spec.md](stage9_homework_submit_seam_spec.md)

Если нужно войти в catalog runtime:
1. [catalog_tree_v1_spec.md](catalog_tree_v1_spec.md)
2. [catalog_index_like_v1_spec.md](catalog_index_like_v1_spec.md)
3. [app/providers/catalog.js](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/app/providers/catalog.js)

## 6. Полезные Проверки

```powershell
node tools/check_runtime_rpc_registry.mjs
node tools/check_runtime_catalog_reads.mjs
node tools/check_build.mjs
```

## 7. Что Сказать Новому Окну Одной Фразой

Миграция на 4-layer архитектуру завершена (Stages 0–9 закрыты, Stage 10 acceptance получен): `answer_events` — source of truth, canonical read-contracts `student_analytics_screen_v1` и `teacher_picking_screen_v2`, canonical write-contracts `write_answer_events_v1` и `submit_homework_attempt_v2`; deferred exception `EX-FRONTEND-RECOMMENDATIONS-AND-SMART-PLAN` (Stage 7) остаётся открытым без блокирующего влияния.
