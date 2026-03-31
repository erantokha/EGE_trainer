# EGE_repo — Контекст проекта

> Последнее обновление: 2026-03-31

---

## Что это за проект

Веб-приложение для подготовки к ЕГЭ. Включает тренажёр задач, домашние задания, аналитику ученика и учителя. Backend — Supabase (PostgreSQL + RPC). Frontend — vanilla JS + HTML.

---

## Текущий глобальный план: переход на четырёхслойную архитектуру

### Четыре слоя:

| Слой | Название | Суть |
|---|---|---|
| **Layer 1** | Source of Truth | `answer_events` — всё что ученик ответил |
| **Layer 2** | Catalog | Backend-каталог: `catalog_theme_dim`, `catalog_subtopic_dim`, `catalog_unic_dim`, `catalog_question_dim` |
| **Layer 3** | Aggregates | Backend-агрегаты на уровнях question / unic / subtopic / theme |
| **Layer 4** | Read API | Единственный допустимый источник чтения для UI (screen payload RPC) |

**Запрещено:** прямое чтение `answer_events` на фронте, чтение `content/tasks/index.json`, самосборка агрегатов на фронте.

### Канонические метрики (из контракта):
- `covered` — есть хотя бы один answer_event по любому question в unic
- `solved` — есть хотя бы один **правильный** answer_event
- `weak` — ≥2 попыток И accuracy < 70%
- `stale` — solved=true, weak=false, ≥2 попыток, последний event >30 дней назад
- `accuracy` — correct / total answer_events

---

## Статус этапов

```
Stage 0    ✅ CLOSED  — Архитектурный контракт, RPC реестр, guardrails
Stage 1    ✅ CLOSED  — catalog_tree_v1 + catalog_index_like_v1 live; фронт мигрирован с index.json
Stage 2    ✅ CLOSED  — Subtopic/unic/question lookup contracts live; smoke ok=16
Stage 3.5  ✅ CLOSED  — Teacher-picking v2: фильтры, screen payload, batch resolve; smoke ok=19
Stage 3.X  🟡 IN PROGRESS — Student Analytics Screen v1 (~70%)
Stage 4–10 ⬜ NOT STARTED
```

---

## Stage 3 — что сделано и что осталось

### Закрыто в Stage 3 (Teacher-Picking slice):
- `student_proto_state_v1` — proto-level состояние ученика (live)
- `student_topic_state_v1` — topic-level состояние (live)
- `teacher_picking_screen_v2` — backend-driven screen payload (live)
- `teacher_picking_resolve_batch_v1` — batch resolve вместо fan-out (live)
- `question_stats_for_teacher_v2` — статистика для учителя (live)
- `home_teacher.html` переведён на canonical фильтры (`unseen_low`, `stale`, `unstable`)
- `picker.js`, `homework.js`, `list.js`, `trainer.js`, `hw_create.js` — переведены
- Exception `EX-PICKER-DIRECT-DASHBOARD-RPC` — закрыта
- Smoke tests: `teacher_picking_v2_browser_smoke.html`, `teacher_picking_filters_browser_smoke.html` — GREEN

### Осталось для закрытия Stage 3 (Student Analytics slice):
- [ ] Раскатить `student_analytics_screen_v1.sql` в live Supabase
- [ ] Завершить рефакторинг `tasks/student.js` (WIP, в git diff)
- [ ] Запустить `student_analytics_screen_v1_browser_smoke.html` → должно быть GREEN
- [ ] Закоммитить все неотслеживаемые файлы:
  - `docs/navigation/student_analytics_screen_v1_spec.md`
  - `docs/supabase/student_analytics_screen_v1.sql`
  - `docs/supabase/student_analytics_screen_v1_rollout_smoke_summary.sql`
  - `tasks/student_analytics_screen_v1_browser_smoke.html`
  - `tasks/student_analytics_screen_v1_browser_smoke.js`
- [ ] Обновить `temporary_migration_exceptions.md` — закрыть `EX-RAW-ANSWER-EVENTS-STUDENT-SCREEN`
- [ ] Обновить `current_dev_context.md` — зафиксировать handoff

---

## Открытые Migration Exceptions

| ID | Проблема | Файл | Target stage |
|---|---|---|---|
| `EX-RAW-ANSWER-EVENTS-STUDENT-SCREEN` | Прямое чтение raw events для variant12/worst3 | `student.js:636`, `variant12.js` | Stage 6 |
| `EX-STUDENT-DASHBOARD-SELF-RPC-FALLBACK` | Fallback между old/new dashboard RPC | `stats.js:193-194` | Stage 8 |
| `EX-TEACHER-DASHBOARD-RPC-FALLBACK` | Fallback в teacher dashboard | `student.js:691-692, 1187-1188, 1399-1400` | Stage 8 |
| `EX-FRONTEND-RECOMMENDATIONS-AND-SMART-PLAN` | Recommendations считаются на фронте | `recommendations.js`, `smart_select.js`, `stats.js:247` | Stage 7 |
| `EX-FRONTEND-TEACHER-PICKING-ORCHESTRATION` | UI orchestration, preview, local state | `picker.js`, `list.js`, ... | Stage 8 |

---

## Текущий WIP (на 2026-03-31)

**Ветка:** `main`

**Изменены (не закоммичены):**
- `tasks/student.js` — рефакторинг под `student_analytics_screen_v1` payload

**Не отслеживаются (не закоммичены):**
- `docs/navigation/student_analytics_screen_v1_spec.md` — полная спецификация (544 строк)
- `docs/supabase/student_analytics_screen_v1.sql` — SQL реализация
- `docs/supabase/student_analytics_screen_v1_rollout_smoke_summary.sql` — rollout smoke
- `tasks/student_analytics_screen_v1_browser_smoke.html` — browser smoke
- `tasks/student_analytics_screen_v1_browser_smoke.js`

**Контракт `student_analytics_screen_v1`:**
```
student_analytics_screen_v1(
  p_viewer_scope = 'teacher' | 'self',
  p_student_id  = uuid,
  p_days        = 30,
  p_source      = 'all' | 'hw' | 'test',
  p_mode        = 'init'
)
→ {
    student: { id, display_name, grade, last_seen_at, ... },
    screen: { mode, source_contract, supports: { variant12, recommendations, works } },
    overall: { last3, last10, period, all_time },
    sections: [ { theme_id, coverage, last10, period, all_time, ... } ],
    topics:   [ { subtopic_id, coverage, last3/10/period, derived states, ... } ],
    variant12: { uncovered: [...], worst3: [...] },
    recommendations: [],
    warnings: [],
    generated_at: timestamp
  }
```

---

## Ключевые файлы

| Файл | Назначение |
|---|---|
| `docs/navigation/architecture_contract_4layer.md` | Главный архитектурный контракт |
| `docs/navigation/current_dev_context.md` | Handoff-документ (актуальный контекст) |
| `docs/navigation/temporary_migration_exceptions.md` | Открытые исключения из контракта |
| `docs/supabase/runtime_rpc_registry.md` | Реестр всех 32 runtime RPC |
| `app/providers/catalog.js` | Layer-2 catalog provider |
| `tasks/student.js` | Экран аналитики ученика (WIP) |

---

## Следующий блок после закрытия Stage 3

Stage 4+ — dual-run и перевод student/teacher UI на Layer-4. Конкретный следующий шаг определяется после закрытия Stage 3.X.
