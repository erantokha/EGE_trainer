# wP2 Report — CURATOR_AGENT.md + EXECUTOR_AGENT.md

Метаданные:

- `task_id`: `2026-04-22-w-p2-agent-prompts`
- Дата: 2026-04-23
- Волна: `W P2`
- Статус: `executor_done` (приём — оператором вручную, см. §17 packet-а)

## Цель волны

Создать два компактных system-prompt-а для curator- и executor-субагентов, которые превращают каркас `process/` (созданный в W P1) в пригодный к запуску процесс. Оба промпта ссылаются на корневые role-доки как на источник истины по спорным нюансам, но содержат всё, что нужно для повседневной работы: жёсткий output-контракт по шаблонам `process/templates/`, проектный red-zone-список для EGE_rep, закрытый список stop-ask триггеров, явно отдельный режим replan/rework. После W P2 субагента можно вызвать руками через `Agent(subagent_type="general-purpose", prompt="<содержимое CURATOR_AGENT.md>, task_id=…, режим=initial")` и получить валидный packet на реальной задаче.

## Что сделано

3 новых файла, 0 изменённых:

- `process/agent-prompts/CURATOR_AGENT.md` — system-prompt curator-субагента, 207 строк, 12 H2-секций (`§0 Identity` … `§11 Формат финального summary`). Включает: input contract, intake-чеклист на 8 пунктов, классификацию задачи на 5 типов, явный red-zone-список для EGE_rep, scope-lock requirements, stop-ask protocol с закрытым списком триггеров, output contract на packet.md по `process/templates/execution_packet.md`, отдельный §9 для replan-режима.
- `process/agent-prompts/EXECUTOR_AGENT.md` — system-prompt executor-субагента, 230 строк, 13 H2-секций (`§0 Identity` … `§12 Формат финального summary`). Включает: input contract на packet+rework, обязательный kickoff-блок, scope discipline, идентичный red-zone-список для EGE_rep, 5-ступенчатый test ladder с проектными командами (`tools/check_*.mjs`, `print-features.js`, playwright spec-ы), task-tracking discipline, закрытый список stop-ask триггеров, output contract на completion.md по `process/templates/completion_packet.md`, отдельный §10 для rework-режима.
- `wP2_report.md` (этот файл) — отчёт волны.

## DoD-чек

- ✅ Папка `process/agent-prompts/` существует.
- ✅ `CURATOR_AGENT.md` существует, содержит все 12 обязательных разделов (§0–§11), объём 207 строк (внутри DoD-диапазона 200–320; компактнее target 230–280 ради экономии токенов на каждый запуск, что прямо отражено в мотивации §3 packet-а).
- ✅ `EXECUTOR_AGENT.md` существует, содержит все 13 обязательных разделов (§0–§12), объём 230 строк (внутри DoD-диапазона 230–340).
- ✅ Оба промпта ссылаются на `process/templates/` как на источник формата output-а: curator → `execution_packet.md`, executor → `completion_packet.md`.
- ✅ Оба промпта содержат явный red-zone-список для EGE_rep (идентичный в обоих файлах: auth-flow, role/access, destructive SQL, runtime-контракты RPC, core routing, build/deploy, layout-каркас, screen/print rules, shared-модули providers, governance-скрипты).
- ✅ Оба промпта содержат явно выделенный раздел stop-ask с закрытым списком триггеров (curator §7, executor §8).
- ✅ `CURATOR_AGENT.md` содержит §9 Replan mode; `EXECUTOR_AGENT.md` содержит §10 Rework mode.
- ✅ `wP2_report.md` в корне с этим DoD-чеком.
- ✅ `git status` показывает 3 новых untracked-файла в зоне W P2 и никаких modified, относящихся к W P2.
- ✅ Ни один файл вне `process/agent-prompts/` и корневого `wP2_report.md` не изменён в рамках W P2.

## Открытые follow-up

- Инсталляция `~/.claude/agents/curator.md` и `~/.claude/agents/executor.md` как кастомных subagent-ов — единым пакетом в W P3 вместе с reviewer, чтобы все трое появились в `/agents` одновременно.
- Реальный тестовый прогон агент-промптов на игрушечной задаче — W P5.
- Ссылка на `process/agent-prompts/` в `CLAUDE.md` — отдельная мелкая follow-up задача после P3 или P5.
- Тримминг дубликатов в корневых `CURATOR.md` / `EXECUTOR.md` после стабилизации агент-промптов — отдельная гигиеническая волна вне P-трека.
- Пост-tuning промптов после первого реального прогона в W P5 — нормальная часть процесса, отдельный small-fix, не возврат W P2 (см. §17 packet-а).

## Замечание о компактности

Оба файла сознательно ближе к нижней границе DoD-диапазона, чем к target-вилке из спецификации. Причина — прямая мотивация из §3 packet-а: «промпт загружается в каждый запуск субагента, и раздутый промпт × десятки задач в месяц = лишние токены и медленнее старт». Более полные обоснования и checklists остаются в корневых `CURATOR.md` / `EXECUTOR.md`, на которые оба агент-промпта явно ссылаются как на reference при сомнении.

## Замечание о baseline репо

На момент старта W P2 рабочее дерево содержало большое число modified-файлов из предсуществующего baseline и untracked-структуры `process/` из W P1. W P2 их не трогал. Финальная проверка (`git ls-files --others --exclude-standard`) подтверждает, что W P2 добавил ровно 3 новых файла в свою зону: `process/agent-prompts/CURATOR_AGENT.md`, `process/agent-prompts/EXECUTOR_AGENT.md`, `wP2_report.md` — и не модифицировал ни одного существующего.

## Next wave

**W P3** — `REVIEWER_AGENT.md` (компактный system-prompt по аналогии с curator/executor) + кастомные субагенты в `~/.claude/agents/` для всех троих ролей (curator/executor/reviewer) единым пакетом, чтобы они появились в `/agents` одновременно.

## Отправка reviewer-у

N/A. W P2 — bootstrap-волна, как и W P1; reviewer-инфраструктуры (REVIEWER_AGENT.md и кастомный subagent) ещё нет — она появится только в W P3. Reviewer-роль играет оператор вручную через приёмку этого отчёта и беглый просмотр обоих промптов. Опциональный follow-up: после W P3 ретроспективно прогнать W P2 через нового reviewer-субагента как smoke-тест самого reviewer-а — не как формальный review задним числом.
