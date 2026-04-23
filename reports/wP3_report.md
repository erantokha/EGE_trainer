# wP3 Report — REVIEWER_AGENT.md + кастомные субагенты

Метаданные:

- `task_id`: `2026-04-23-w-p3-reviewer-and-subagents`
- Дата: 2026-04-23
- Волна: `W P3`
- Статус: `executor_done` (приём — оператором вручную, см. §17 packet-а)

## Цель волны

Завершить триаду ролевых system-prompt-ов созданием `REVIEWER_AGENT.md` и одновременно ввести три project-local subagent-definition-а в `.claude/agents/`, чтобы curator / executor / reviewer стали доступны через `/agents` Claude Code как готовые `subagent_type`-ы с ограниченным tool-set. После W P3 auto-retry policy из `process/policy/stop_ask_and_retry.md` имеет реальный адресат (reviewer-субагент с жёстким planning-defect detection), а оркестратор может вызывать `Agent(subagent_type="reviewer", ...)` и получать валидный `review.md` с recommendation из закрытого множества 5 значений.

## Что сделано

6 новых файлов, 0 изменённых:

- `process/agent-prompts/REVIEWER_AGENT.md` — system-prompt reviewer-субагента, 258 строк, 16 H2-секций (`§0 Identity` … `§15 Формат финального summary`). Включает: 4-осный review protocol (scope / correctness / proof / hygiene), severity-классификацию из 4 уровней (critical / major / minor / note), 4-уровневую evidence-оценку (sufficient / partially_sufficient / insufficient / unacceptable), явный §9 Planning defect detection с закрытыми критериями true/false, recommendation-set из ровно 5 значений в §10, отдельный §12 Red-zone review с default `pause_recommended` при сомнении.
- `process/agent-prompts/README.md` — индекс папки, 60 строк, 6 разделов. Объясняет связь `*_AGENT.md` ↔ `.claude/agents/*.md`, таблицу tool-прав по ролям, три способа вызова, правила обновления (source of truth — `*_AGENT.md`, wrapper-ы не дублируют).
- `.claude/agents/curator.md` — project-local subagent wrapper, 30 строк, tools=`Read, Grep, Glob, Write, Bash` (без Edit — не пишет код). Ссылается на `CURATOR_AGENT.md` как на source of truth.
- `.claude/agents/executor.md` — project-local subagent wrapper, 32 строки, tools=`Read, Grep, Glob, Edit, Write, Bash` (полный kit). Ссылается на `EXECUTOR_AGENT.md`.
- `.claude/agents/reviewer.md` — project-local subagent wrapper, 32 строки, tools=`Read, Grep, Glob, Bash, Write` (без Edit — не правит код; Write только в `review.md` и `stop_ask_review_<N>.md`). Ссылается на `REVIEWER_AGENT.md`.
- `wP3_report.md` (этот файл) — отчёт волны.

## DoD-чек

- ✅ `.claude/agents/` существует с тремя wrapper-ами (`curator.md`, `executor.md`, `reviewer.md`).
- ✅ `process/agent-prompts/REVIEWER_AGENT.md` существует, содержит 16 обязательных разделов (§0–§15), объём 258 строк (внутри target 250–300 и DoD 200–340).
- ✅ `process/agent-prompts/README.md` существует, содержит 6 разделов из §7.2 packet-а (что живёт / связь с `.claude/agents/` / tool-права / как вызывать / как обновлять / статус).
- ✅ Каждый из трёх wrapper-ов имеет валидный YAML frontmatter с `name`, `description`, `tools` и ссылается на соответствующий `*_AGENT.md`. `grep -c '^---$'` возвращает 2 для каждого (frontmatter-границы).
- ✅ `REVIEWER_AGENT.md` содержит явно выделенный §9 Planning defect detection с закрытыми критериями `true` / `false` и правилом сомнения «`planning_defect: true` при неопределённости».
- ✅ `REVIEWER_AGENT.md` содержит recommendation-set из ровно 5 значений в §10: `accept_recommended`, `accept_with_followup_recommended`, `rework_required`, `pause_recommended`, `split_recommended`.
- ✅ `REVIEWER_AGENT.md` содержит red-zone-специфичный §12 с default `pause_recommended` при сомнении.
- ✅ Reviewer wrapper (`.claude/agents/reviewer.md`) **не** содержит `Edit` в `tools:` (строка `tools: Read, Grep, Glob, Bash, Write`).
- ✅ Curator wrapper (`.claude/agents/curator.md`) **не** содержит `Edit` в `tools:` (строка `tools: Read, Grep, Glob, Write, Bash`).
- ✅ `wP3_report.md` в корне содержит этот DoD-чек и инструкцию проверки `/agents` (см. следующий раздел).
- ✅ `git ls-files --others --exclude-standard` показывает 6 новых файлов в зоне W P3; модификаций в зоне W P3 нет.
- ✅ Ни один файл вне `process/agent-prompts/`, `.claude/agents/` и корневого `wP3_report.md` не изменён в рамках W P3.

## Как проверить установку субагентов

1. Открой Claude Code в корне проекта (`/home/automation/EGE_rep_Вишня./EGE_rep/`).
2. Введи команду `/agents` — в списке должны появиться три project-local субагента: `curator`, `executor`, `reviewer`.
3. Если они не появляются:
   - Перезапусти Claude Code session (`/exit` → снова открыть). Кэш subagent-ов подгружается при старте.
   - Убедись, что `.claude/agents/` находится в корне проекта: `ls .claude/agents/` из корня должен показать три `.md`-файла.
   - Проверь, что `gitignore` не прячет `.claude/agents/` — они должны быть untracked и видимы для git (`git ls-files --others --exclude-standard .claude/`).
4. Быстрый smoke после установки: `Agent(subagent_type="reviewer", prompt="task_id=..., провести review")` — субагент должен прочитать `REVIEWER_AGENT.md` и пройти review protocol. Для реальной задачи используй W P5 (первый тестовый прогон).

## Открытые follow-up

- Первый реальный тестовый прогон reviewer-субагента на живой задаче — W P5.
- Tuning промптов (curator / executor / reviewer) после W P5 — отдельный small-fix, не возврат W P3.
- Ссылка на `.claude/agents/` и `process/agent-prompts/` в `CLAUDE.md` — отдельная мелкая follow-up задача после W P5.
- Опциональный self-test: прогнать reviewer-субагента ретроспективно на одной из уже закрытых волн (например, W P2) как smoke-тест самого reviewer-а (не как формальный review задним числом).
- Тримминг дубликатов в корневом `REVIEWER.md` после стабилизации — отдельная гигиеническая волна вне P-трека.

## Замечание о baseline репо

На момент старта W P3 рабочее дерево содержало предсуществующий baseline (множество modified-файлов, не связанных с P-треком) и untracked-структуру `process/` и корневые `wP1_report.md` / `wP2_report.md` из W P1 / W P2. W P3 их не трогал. Финальная проверка подтверждает, что W P3 добавил ровно 6 новых файлов в свою зону (`process/agent-prompts/REVIEWER_AGENT.md`, `process/agent-prompts/README.md`, `.claude/agents/curator.md`, `.claude/agents/executor.md`, `.claude/agents/reviewer.md`, `wP3_report.md`) и не модифицировал ни одного существующего.

## Next wave

**W P4** — `HOW_TO_RUN.md` (инструкция оркестратора: как поднимать три субагента последовательно, как передавать артефакты между ними, как применять `policy/autonomy_modes.md`) + возможные уточнения `process/policy/autonomy_modes.md` по итогам реальной настройки subagent-вызовов.

## Отправка reviewer-у

N/A. Reviewer-инфраструктура создана только что этой волной; формальный review по новым правилам возможен начиная с W P5, когда будет первый реальный тестовый прогон. В W P3 reviewer-роль играет оператор вручную через: приёмку этого отчёта, беглый просмотр `REVIEWER_AGENT.md` (особенно §9 Planning defect detection и §10 Recommendation — инварианты, на которых держится вся auto-retry / replan-логика) и проверку `/agents` в Claude Code.
