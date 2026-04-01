# Stage 9.3 Canonical Write Seam Spec

Дата обновления: 2026-04-01

Этот документ подготавливает Stage 9.3: выбор целевого write seam для записи
ученических ответов после Stage 9.1 inventory и Stage 9.2 extraction.

Связанные документы:
- [Stage 9.1 Write-Path Inventory](stage9_write_path_inventory.md)
- [Stage 9.2 Trigger Extraction Runbook](stage9_trigger_extraction_runbook.md)
- [Migration Plan: Stage 4-10](migration_stage4_10_plan.md)
- [4-layer Architecture Contract](architecture_contract_4layer.md)
- [write_answer_events_v1.sql](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/docs/supabase/write_answer_events_v1.sql)

## 1. Решение Stage 9.3

Целевой write seam для non-homework сценариев:
- явный backend RPC `write_answer_events_v1`

Его роль:
- принимать question-level события напрямую от `trainer.js` и `analog.js`;
- писать их в `answer_events` как в canonical layer-1 source;
- перестать зависеть от side effect через `attempts -> trigger -> answer_events`.

Ключевое правило:
- для аналитики canonical write target теперь задаётся явно;
- operational table `attempts` больше не считается обязательным мостом для Stage 9.3.

Homework flow на Stage 9.3 не переводится полностью:
- `start_homework_attempt` остаётся как есть;
- `submit_homework_attempt` ещё не меняется в live-contract;
- его явная миграция на прямую запись в `answer_events` выносится в следующий подэтап Stage 9.4.

## 2. Почему выбран именно такой seam

Причины:
- текущий non-homework path уже собирает question-level payload на фронте;
- `answer_events` уже содержит все аналитически важные поля;
- в схеме уже есть dedupe-модель для `source='test'` через `answer_events_uniq_test`;
- прямой RPC проще контролировать, чем неявную trigger-логику поверх агрегированной строки `attempts`.

Практический вывод:
- для `trainer.js` и `analog.js` не нужен промежуточный insert в `attempts`, чтобы статистика обновилась;
- достаточно отправить question-level batch с устойчивым `attempt_ref`.

## 3. Целевой контракт `write_answer_events_v1`

Планируемый SQL-артефакт:
- [write_answer_events_v1.sql](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/docs/supabase/write_answer_events_v1.sql)

Планируемый смысл аргументов:
- `p_source text`
  - на Stage 9.3 ожидается только `'test'`
  - новый enum не вводится: текущий check на `answer_events.source` уже допускает только `'test'` и `'hw'`
- `p_attempt_ref text`
  - устойчивый идентификатор одной non-homework попытки
  - пишется в `answer_events.test_attempt_id`
  - используется для идемпотентности вместе с `question_id`
- `p_events jsonb`
  - массив question-level событий
- `p_attempt_started_at timestamptz`
- `p_attempt_finished_at timestamptz`
- `p_attempt_meta jsonb`
  - необязательная operational/meta информация для трассировки

Минимальная форма одного элемента `p_events`:
- `section_id text | null`
- `topic_id text`
- `question_id text`
- `correct boolean`
- `time_ms integer | null`
- `difficulty integer | null`
- `occurred_at timestamptz | null`

Серверные инварианты:
- `student_id` всегда берётся из `auth.uid()`, а не из клиента;
- `source='test'` валидируется сервером;
- `question_id`, `topic_id`, `correct` обязательны;
- `section_id` может приходить из клиента, но при отсутствии должен выводиться
  сервером как `split_part(topic_id, '.', 1)`;
- `occurred_at` при отсутствии может быть нормализован к `p_attempt_finished_at` или `now()`;
- повторный вызов с тем же `p_attempt_ref` не должен плодить дублей.

Live-compat заметка:
- выгруженные `trg_attempts_to_answer_events()` и
  `trg_homework_attempts_to_answer_events()` уже используют модель
  `section_id = split_part(topic_id, '.', 1)`;
- новый Stage 9 write seam должен сохранить ту же семантику по умолчанию,
  чтобы не вносить лишний regression diff относительно текущего bridge.

## 4. Dedupe-модель для Stage 9.3

Stage 9.3 опирается на уже существующий уникальный индекс:
- `answer_events_uniq_test`

Планируемое сопоставление:
- `answer_events.source = 'test'`
- `answer_events.test_attempt_id = p_attempt_ref`

Идемпотентность:
- уникальность держится на паре `source + test_attempt_id + question_id`
- повторная отправка той же finished-session должна быть безопасной
- фронт всё равно должен слать стабильный `attempt_ref`, а не генерировать новый на каждый retry

## 5. Mapping текущих runtime payload в новый seam

### 5.1. `trainer.js`

Текущее состояние:
- экран уже собирает `payload.questions`
- сейчас они заворачиваются в `attemptRow` и идут в `insertAttempt()`

Target mapping:
- `attemptRow.payload.questions[]` -> `p_events[]`
- `attemptRow.started_at` -> `p_attempt_started_at`
- `attemptRow.finished_at` -> `p_attempt_finished_at`
- `attemptRow.mode`, `topic_ids`, `total`, `correct`, `avg_ms`, `duration_ms` -> `p_attempt_meta`

Новый обязательный runtime элемент:
- `SESSION.attempt_ref`

Он должен:
- создаваться один раз на старт session;
- сохраняться до finish/retry;
- использоваться как `p_attempt_ref`.

### 5.2. `analog.js`

Текущее состояние:
- экран уже формирует batch из одного `payloadQuestions`
- дальше тоже идёт через `insertAttempt()`

Target mapping:
- один analog solve = один `attempt_ref`
- единственный question payload = массив `p_events` из одного элемента

Новый обязательный runtime элемент:
- `ASESSION.attempt_ref`

## 6. Transitional rule для `attempts`

Stage 9.3 не обязан немедленно удалять `attempts`.

На этом подэтапе достаточно:
- перестать использовать `attempts` как обязательный источник записи для аналитики;
- перевести `trainer.js` и `analog.js` на прямой canonical write в `answer_events`;
- оставить судьбу `attempts` как отдельный cleanup/follow-up после стабилизации.

Допустимый transitional вариант:
- `insertAttempt()` временно остаётся экспортируемым именем,
  но внутри превращается в thin wrapper поверх `write_answer_events_v1`
  для минимального diff в runtime.

## 7. Что входит в Stage 9.3

- выбрать и зафиксировать canonical non-homework write seam;
- подготовить SQL-артефакт под новый RPC;
- подготовить runtime backlog для:
  - [supabase-write.js](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/app/providers/supabase-write.js)
  - [trainer.js](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/trainer.js)
  - [analog.js](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/analog.js)
- определить dedupe contract через `test_attempt_id`
- описать smoke/CI набор для non-homework migration

## 8. Что не входит в Stage 9.3

- полная миграция homework submit-path;
- удаление trigger-функций `trg_attempts_to_answer_events()` и `trg_homework_attempts_to_answer_events()`;
- превращение `homework_attempts` в read-проекцию;
- финальная live cleanup old write bridge.

## 9. Definition of Done для Stage 9.3

Stage 9.3 можно считать подготовленным к реализации, когда:
- выбран один явный target seam для non-homework writes;
- SQL-контракт `write_answer_events_v1` зафиксирован в repo;
- определён stable `attempt_ref` contract для `trainer.js` и `analog.js`;
- dedupe-модель привязана к текущему `answer_events_uniq_test`;
- составлен конкретный migration backlog по runtime-файлам;
- следующий шаг уже не про разведку, а про реализацию RPC и переключение runtime.

## 10. Что делать сразу после подготовки

Следующий прикладной шаг:
- реализовать `write_answer_events_v1` в SQL;
- перевести [supabase-write.js](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/app/providers/supabase-write.js)
  на этот RPC;
- затем переключить [trainer.js](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/trainer.js)
  и [analog.js](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/analog.js);
- после этого прогнать отдельный non-homework write smoke.
