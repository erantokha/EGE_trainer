# wP1 Report — Scaffold process/

Метаданные:

- `task_id`: `2026-04-22-w-p1-scaffold`
- Дата: 2026-04-22
- Волна: `W P1`
- Статус: `executor_done` (приём — оператором вручную)

## Цель волны

Создать каркас `process/` — папки, шаблоны handoff packet-ов и политики автономии/ретрая — чтобы дальше (W P2–P5) можно было собрать агент-промпты и кастомные субагенты поверх уже зафиксированного формата. После W P1 человек может вручную создать `process/tasks/<task_id>/`, скопировать туда шаблоны и пройти задачу по новому процессу даже без агент-инфраструктуры.

## Что сделано

Создано 12 новых файлов, ноль изменённых:

- `process/README.md` — индекс папки: цель, структура, конвенции `task_id` и папки задачи, связь с `PROCESS_CONTRACT.md`, статус P1.
- `process/templates/operator_request_card.md` — шаблон Operator Request Card (12 секций по PROCESS_CONTRACT.md §13.1).
- `process/templates/execution_packet.md` — шаблон Curator Execution Packet (17 секций по PROCESS_CONTRACT.md §13.2).
- `process/templates/completion_packet.md` — шаблон Executor Completion Packet с разделением «Результаты проверок» на 4 подгруппы.
- `process/templates/review_packet.md` — шаблон Reviewer Review Packet с фиксированным порядком severity (critical → major → minor → note) и закрытым множеством recommendation.
- `process/templates/verdict.md` — шаблон final verdict оператора (короткая форма + override-флаг).
- `process/templates/quickfix.md` — объединённый шаблон quickfix-цикла с жёстким блоком допустимости.
- `process/policy/stop_ask_and_retry.md` — политика 1 auto-retry, planning defect → куратор, формат stop-ask, red-zone overlay, infinite-loop protection.
- `process/policy/autonomy_modes.md` — три режима (`manual` / `supervised` / `auto`) с таблицей и правилами применения.
- `process/tasks/.gitkeep` — пустой stub, чтобы папка попала в git.
- `process/decisions/.gitkeep` — пустой stub для append-only override-журнала.
- `wP1_report.md` (этот файл) — отчёт волны.

## DoD-чек

- ✅ `process/` содержит 4 подпапки: `templates/`, `policy/`, `tasks/`, `decisions/`.
- ✅ 6 шаблонов в `process/templates/` существуют и содержат все обязательные секции из §6.2–6.7 packet-а.
- ✅ 2 файла в `process/policy/` зафиксировали правило 1 auto-retry и три режима автономии.
- ✅ `process/README.md` описывает конвенцию `task_id`, структуру папки задачи и явно ссылается на `PROCESS_CONTRACT.md` как на источник истины.
- ✅ `wP1_report.md` в корне содержит этот чек-лист DoD со всеми галочками.
- ✅ `git status` показывает только добавление 12 новых файлов и никаких modified, относящихся к W P1 (см. секцию «Открытые follow-up» — иные modified-файлы являются предсуществующим untouched baseline-ом репо и в scope W P1 не входят).
- ✅ Ни один файл вне `process/` и корневого `wP1_report.md` не изменён в рамках W P1.

## Открытые follow-up

- Обновить `CLAUDE.md` ссылкой на `process/README.md` — отдельная мелкая задача после W P1.
- Тримминг дубликатов в корневых `CURATOR.md` / `EXECUTOR.md` / `REVIEWER.md` / `OPERATOR.md` после стабилизации агент-промптов — самостоятельная волна после W P5.
- Внести трек «Agent-based process» (P1–P5) в `GLOBAL_PLAN.md` как, например, B3 — отдельной задачей после P5.
- В `PROJECT_STATUS.md` добавить раздел про agent-based process — после закрытия всей track P1–P5.

## Замечание о baseline репо

На момент старта W P1 рабочее дерево уже содержало большое число modified-файлов (см. `git status`), не связанных с этой волной. W P1 их не трогал; финальная проверка по §10 (`git status -s` с фокусом на `??`) подтверждает, что W P1 добавил ровно 12 новых файлов и не модифицировал ни одного существующего.

## Next wave

**W P2** — `CURATOR_AGENT.md` + `EXECUTOR_AGENT.md`: компактные агент-промпты (~250 строк каждый), формат вывода — строго по шаблонам из `process/templates/`.

## Отправка reviewer-у

N/A. W P1 — bootstrap-волна; reviewer-роль играет оператор вручную через приёмку этого отчёта и беглую проверку структуры `process/`. Формальный `review.md` не требуется, потому что review-инфраструктура (REVIEWER_AGENT.md и кастомный subagent) появится только в W P3.
