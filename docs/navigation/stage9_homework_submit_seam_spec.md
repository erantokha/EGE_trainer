# Stage 9.4 Homework Submit Seam Spec

Дата обновления: 2026-04-01

Этот документ подготавливает Stage 9.4: миграцию homework write-path с
`homework_attempts -> trigger -> answer_events` на явный backend submit seam.

Связанные документы:
- [Scenario: homework submit](scenarios/homework_submit.md)
- [Stage 9.2 Trigger Extraction Runbook](stage9_trigger_extraction_runbook.md)
- [Stage 9.3 Canonical Write Seam Spec](stage9_canonical_write_seam_spec.md)
- [Migration Plan: Stage 4-10](migration_stage4_10_plan.md)
- [submit_homework_attempt_v2.sql](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/docs/supabase/submit_homework_attempt_v2.sql)

## 1. Решение Stage 9.4

Целевой seam для homework submit:
- новый явный RPC `submit_homework_attempt_v2`

Его роль:
- финализировать строку в `homework_attempts`;
- записывать `answer_events` напрямую в той же транзакции;
- перестать зависеть от trigger bridge на `homework_attempts`.

Что остаётся без изменений:
- `start_homework_attempt` остаётся точкой старта/резервации attempt;
- `get_homework_attempt_by_token` остаётся canonical read-path для result screen;
- UI-контракт "после ok можно читать итог по attempt/token" сохраняется.

## 2. Почему homework требует отдельный seam

Homework path отличается от non-homework:
- ему нужен persistent `attempt_id`, созданный заранее;
- ему нужен operational record в `homework_attempts` для result screen,
  teacher review и student archive;
- submit должен быть атомарным: либо обновились и `homework_attempts`, и
  `answer_events`, либо не обновилось ничего;
- идемпотентность должна учитывать повторный клик и повторный submit той же attempt.

Из этого следует:
- `write_answer_events_v1` недостаточно как единственный seam для homework;
- homework submit лучше оформлять отдельной RPC с write-through в оба контура.

## 3. Целевой контракт `submit_homework_attempt_v2`

Планируемый SQL-артефакт:
- [submit_homework_attempt_v2.sql](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/docs/supabase/submit_homework_attempt_v2.sql)

Планируемые аргументы:
- `p_attempt_id uuid`
- `p_payload jsonb`
- `p_total integer`
- `p_correct integer`
- `p_duration_ms integer`

Планируемый return contract:
- `attempt_id uuid`
- `already_submitted boolean`
- `written_events integer`
- `finished_at timestamptz`
- `total integer`
- `correct integer`
- `duration_ms integer`

Почему return лучше сделать табличным, а не `void`:
- фронт перестаёт гадать, был ли submit новым или idempotent retry;
- проще диагностировать частичный баг без вторичного запроса;
- можно стабильно тестировать `written_events=0` при повторном submit.

## 4. Серверная логика v2

Ожидаемая последовательность внутри одной транзакции:

1. Взять `auth.uid()` и провалидировать доступ к attempt.
2. Найти `homework_attempts` по `p_attempt_id`.
3. Если attempt уже finished:
   - не писать повторно `answer_events`;
   - вернуть `already_submitted=true` и существующие итоговые поля.
4. Если attempt ещё не finished:
   - обновить `homework_attempts.payload`, `total`, `correct`, `duration_ms`, `finished_at`
   - развернуть `p_payload.questions[]` в question-level rows
   - вставить их в `answer_events` с:
     - `source='hw'`
     - `hw_attempt_id = attempt_id`
     - `homework_id` из строки attempt
     - `student_id` из attempt/auth
   - опереться на `answer_events_uniq_hw` для идемпотентности
   - вернуть `already_submitted=false`

Критично:
- вставка `answer_events` не должна жить в trigger-функции;
- логика должна быть reviewable прямо в SQL-файле RPC.

## 5. Mapping homework payload в `answer_events`

Текущий payload из [hw.js](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/hw.js):
- `payload.homework_id`
- `payload.title`
- `payload.student_name`
- `payload.questions[]`

Для `answer_events` нужны поля:
- `student_id`
- `source='hw'`
- `section_id`
- `topic_id`
- `question_id`
- `correct`
- `time_ms`
- `difficulty`
- `occurred_at`
- `hw_attempt_id`
- `homework_id`

Проблема/решение Stage 9.4:
- текущий `payloadQuestions` в [hw.js](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/hw.js)
  не несёт `section_id`;
- однако live `trg_homework_attempts_to_answer_events()` уже компенсирует это и
  вычисляет `section_id` из `topic_id` как `split_part(topic_id, '.', 1)`.

Следствие:
- для `submit_homework_attempt_v2` нужна явная модель `section_id`;
- наиболее безопасный вариант Stage 9.4: сохранить live-compat и выводить
  `section_id` на сервере из `topic_id`;
- добавление `section_id` в payload может остаться как optional hardening,
  но не как blocker для rollout.

## 6. Идемпотентность

Stage 9.4 должен опираться на уже существующий индекс:
- `answer_events_uniq_hw`

Планируемое сопоставление:
- `answer_events.source = 'hw'`
- `answer_events.hw_attempt_id = p_attempt_id`

Ключевой инвариант:
- один homework attempt может породить не более одной event-row на `question_id`
  для данного `hw_attempt_id`

Повторный submit:
- не должен падать как hard error;
- не должен создавать дублей;
- должен возвращать детерминированный ответ `already_submitted=true`.

## 7. Runtime backlog для Stage 9.4

Затрагиваемые файлы:
- [app/providers/homework.js](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/app/providers/homework.js)
- [tasks/hw.js](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/hw.js)

Что придётся поменять:
- `app/providers/homework.js`
  - добавить вызов `submit_homework_attempt_v2`
  - нормализовать return payload
- `tasks/hw.js`
  - либо включить `section_id` в `payload.questions[]`,
    либо осознанно оставить его server-derived
  - не менять UX-контракт finish/result screen
  - использовать `already_submitted` как нормальный исход retry-сценария

## 8. Что не входит в Stage 9.4

- удаление `trg_homework_attempts_to_answer_events()` из live Supabase;
- cleanup старого `submit_homework_attempt` сразу после rollout;
- переписывание teacher read/report contracts;
- смена `start_homework_attempt` на новый интерфейс.

## 9. Definition of Done для Stage 9.4

Stage 9.4 считается подготовленным к реализации, когда:
- выбран один явный homework submit seam;
- SQL-контракт `submit_homework_attempt_v2` зафиксирован в repo;
- описана атомарная модель `homework_attempts + answer_events`;
- dedupe-модель привязана к `answer_events_uniq_hw`;
- зафиксирована явная модель `section_id` для homework path:
  клиентский payload или server-derived из `topic_id`;
- следующий шаг уже не про анализ, а про реализацию SQL и runtime switch.

## 10. Что делать сразу после подготовки

Следующий прикладной шаг:
- реализовать [submit_homework_attempt_v2.sql](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/docs/supabase/submit_homework_attempt_v2.sql);
- обновить [app/providers/homework.js](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/app/providers/homework.js);
- определить финальную модель `section_id` внутри
  [hw.js](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/hw.js) или на стороне SQL;
- затем прогнать homework submit smoke и idempotency smoke.
