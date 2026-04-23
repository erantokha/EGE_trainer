# wP4 Report — Orchestration / HOW_TO_RUN

Метаданные:

- `task_id`: `2026-04-23-w-p4-orchestration`
- Дата: 2026-04-23
- Волна: `W P4`
- Статус: `executor_done` (приём — оператором вручную, см. §17 packet-а)

## Цель волны

Собрать operator runbook (`process/HOW_TO_RUN.md`), по которому можно запустить любую задачу agent-based процесса EGE_rep от intent до verdict без реконструкции «а как мы договорились запускать». Runbook оператор-ориентирован: больше команд и шаблонов вызова, меньше пересказа внутренних правил агентов; ветвления (stop-ask, rework, replan, split, infinite-loop) покрыты так же конкретно, как happy path. По итогам W P4 оператор может открыть `HOW_TO_RUN.md` и без вопросов прогнать игрушечную задачу из W P5.

## Что сделано

2 новых файла + 1 modified (only additive), 0 других изменённых:

- `process/HOW_TO_RUN.md` — operator runbook, **359 строк**, 11 H2-секций (§0 Что это … §10 Что НЕ делать). Включает: §1 Предусловия (5 пунктов), §2 Quick start (9 шагов шпаргалкой), §3 Режимы автономии (рабочая таблица-памятка), §4 Полный walkthrough (7 пошаговых разделов с фрагментами Agent-вызовов), §5 Failure paths (ровно 7 H3-подсекций §5.1–§5.7: curator/executor stop-ask, rework execution, replan curator, pause, split, infinite-loop), §6 Quickfix mini-flow, §7 Командная справка (точные форматы промптов для всех 7 комбинаций — curator initial/replan, executor initial/rework/quickfix, reviewer initial/re-review, плюс manual fallback на `subagent_type="general-purpose"`), §8 Troubleshooting (таблица симптом→действие), §9 Gotchas/FAQ, §10 Anti-patterns. Файл ссылается на `process/templates/`, `process/policy/`, `process/agent-prompts/`, `.claude/agents/`, `PROCESS_CONTRACT.md`.
- `process/policy/autonomy_modes.md` — **modified, только additive** (см. отдельный раздел ниже).
- `wP4_report.md` (этот файл) — отчёт волны.

## DoD-чек

- ✅ `process/HOW_TO_RUN.md` существует, содержит 11 обязательных разделов (§0–§10), объём 359 строк (внутри DoD 280–600 и target 280–500).
- ✅ §2 Quick start — шпаргальный формат без прозы, 9 шагов.
- ✅ §4 Full walkthrough — детальный проход по happy path с фрагментами `Agent(subagent_type=...)` вызовов на каждом шаге.
- ✅ §5 Failure paths покрывает все 7 сценариев из спецификации (5.1 curator stop-ask, 5.2 executor stop-ask, 5.3 rework execution, 5.4 planning defect → curator replan, 5.5 pause, 5.6 split, 5.7 infinite-loop). `grep -c '^### 5\.'` возвращает ровно 7.
- ✅ §7 Командная справка содержит промпты для всех 7 комбинаций (curator initial, curator replan, executor initial, executor rework, executor quickfix, reviewer initial, reviewer re-review). `grep -c 'subagent_type='` возвращает 18 — комфортно выше минимума 7.
- ✅ HOW_TO_RUN.md не дублирует agent-prompt-ы — описывает взаимодействие оператора с системой, а не внутренние правила ролей. На повторяющиеся внутренние инварианты ставит ссылки в исходные `*_AGENT.md`, `process/policy/`, `PROCESS_CONTRACT.md`.
- ✅ HOW_TO_RUN.md ссылается на: `process/README.md`, `process/templates/*`, `process/policy/*`, `process/agent-prompts/*`, `.claude/agents/*`, `PROCESS_CONTRACT.md`, `CLAUDE.md` — где уместно.
- ✅ `process/policy/autonomy_modes.md` изменён только additive (без изменения контрактов трёх режимов). Решение зафиксировано в следующем разделе.
- ✅ `wP4_report.md` в корне с этим DoD-чеком и явным решением по `autonomy_modes.md`.
- ✅ `git ls-files --others --exclude-standard` показывает новые untracked в зоне W P4; в зоне нет посторонних modified.
- ✅ Ни один файл вне `process/HOW_TO_RUN.md`, `process/policy/autonomy_modes.md` и корневого `wP4_report.md` не изменён в рамках W P4.

## Решение по `process/policy/autonomy_modes.md`

**Решение:** применены минимальные additive-правки — без изменения контрактов трёх режимов, без изменения правил применимости, без изменения default (`supervised`) и без изменения условий auto-accept.

Что добавлено:

1. **Cross-reference абзац после introductory параграфа** (новая строка 5):
   > «Рабочий runbook по применению режимов на конкретной задаче — `process/HOW_TO_RUN.md`. Конкретные `subagent_type` имена, которые orchestrator вызывает (`curator`, `executor`, `reviewer`), описаны в `.claude/agents/` (project-local subagent definitions из W P3) и в `process/agent-prompts/README.md`.»

2. **`subagent_type`-имена как parenthetical в supervised/auto строках таблицы**:
   - supervised: «Запуск curator/executor/reviewer-субагентов **(`subagent_type=curator|executor|reviewer`)**, передача артефактов между ними»
   - auto: «Полная цепочка curator → executor → reviewer **(`subagent_type=curator|executor|reviewer`)** + auto-accept при `accept_recommended`»

   Исходные слова сохранены — добавлен только parenthetical, как разрешено §7.2 packet-а («В описании supervised и auto режимов добавить в скобках или как footnote названия `subagent_type`»).

Что НЕ менялось:

- Контракты ни одного из трёх режимов (что делает каждый, где обязателен оператор, для какого risk допустим).
- Правила применения (red-zone ≡ manual, default `supervised`, переход между режимами запрещён без stop-ask, режим — свойство задачи).
- Раздел «Что значит auto-accept в режиме `auto`» (закрытое множество условий auto-accept).
- Порядок и состав разделов файла, тон.

Замечание про `git diff` файла: `process/policy/autonomy_modes.md` находится в untracked-папке `process/` (`?? process/` из W P1), поэтому `git diff` для него возвращает пустой вывод — git считает его новым целиком. Additive-характер правок верифицирован пере-чтением файла глазами, см. `process/policy/autonomy_modes.md:1-13` (исходные строки 7–11 из W P1 = новые строки 9–13 с добавленными parenthetical-блоками; исходные строки 13–32 не тронуты).

## Открытые follow-up

- Первый реальный тестовый прогон всей цепочки на игрушечной задаче — W P5.
- Tuning `HOW_TO_RUN.md` после W P5 — отдельный small-fix; первый реальный прогон почти гарантированно выявит зазоры.
- Ссылка на `process/HOW_TO_RUN.md` в `CLAUDE.md` и в `process/README.md` — мелкая follow-up задача после W P5.
- Оценка целесообразности shell-скрипта `process/run.sh` (автомат для оркестратора) — после 3–5 реальных задач, когда будет понятна повторяющаяся часть.
- Опциональный self-test перед W P5: прогнать аналитическую (без правок кода) игрушечную задачу по §2 Quick start — даст уверенность в runbook-е до первого content-change прогона.

## Замечание о baseline репо

На момент старта W P4 рабочее дерево содержало предсуществующий baseline (множество modified-файлов, не связанных с P-треком) и untracked-структуру `process/`, `.claude/agents/`, `wP1_report.md`, `wP2_report.md`, `wP3_report.md` из предыдущих волн. W P4 не трогал ничего за пределами своей зоны. Финальная проверка подтверждает, что W P4 добавил 2 новых файла (`process/HOW_TO_RUN.md`, `wP4_report.md`) и выполнил additive правки одного untracked-файла (`process/policy/autonomy_modes.md`) — без модификации существующих tracked-файлов.

## Next wave

**W P5** — первый тестовый прогон всей цепочки на игрушечной задаче. Цель: пройти полный happy path (request → curator packet → executor completion → reviewer review → operator verdict) на минимальной задаче (например, doc-sync или тривиальный local_fix), проверить, что субагенты корректно стартуют по wrapper-ам из `.claude/agents/`, что артефакты создаются в `process/tasks/<task_id>/` по шаблонам, что reviewer выставляет recommendation из закрытого множества и planning_defect, что итоговый verdict ложится в `verdict.md`. По итогам — список tuning-правок для curator/executor/reviewer-промптов и `HOW_TO_RUN.md`, оформляемых отдельным small-fix-ом, не возвратом W P1–P4.

## Отправка reviewer-у

N/A. W P4 — последняя bootstrap-волна перед W P5; reviewer-инфраструктура существует с W P3, но первый реальный прогон через неё запланирован именно на W P5. В W P4 reviewer-роль играет оператор вручную через приёмку этого отчёта и беглый просмотр `HOW_TO_RUN.md` на предмет: реалистичности happy path в §4, полноты §5 failure paths против `REVIEWER_AGENT.md` §10 (5 recommendations), соответствия §7 командной справки wrapper-ам в `.claude/agents/`, оператор-ориентированного тона документа.
