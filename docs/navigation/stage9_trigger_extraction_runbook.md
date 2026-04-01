# Stage 9.2 Trigger Extraction Runbook

Дата обновления: 2026-04-01

Этот документ подготавливает Stage 9.2: выгрузку live trigger-функций,
которые сейчас связывают operational tables (`attempts`, `homework_attempts`)
с canonical analytics source (`answer_events`).

Цель подэтапа 9.2:
- вытащить реальное поведение write-bridge из live Supabase;
- сохранить его в репозитории как reviewable standalone SQL;
- зафиксировать trigger attachments и дедупликационные инварианты;
- создать базу для Stage 9.3, где уже можно менять write-path без слепых предположений.

Связанные документы:
- [Stage 9.1 Write-Path Inventory](stage9_write_path_inventory.md)
- [Migration Plan: Stage 4–10](migration_stage4_10_plan.md)
- [Supabase Schema Overview](supabase_schema_overview.md)
- [Stage 9 Trigger Extraction SQL](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/docs/supabase/stage9_trigger_extraction.sql)
- [trg_attempts_to_answer_events.sql](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/docs/supabase/trg_attempts_to_answer_events.sql)
- [trg_homework_attempts_to_answer_events.sql](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/docs/supabase/trg_homework_attempts_to_answer_events.sql)

## 1. Что именно нужно выгрузить

Обязательные live-функции:
- `public.trg_attempts_to_answer_events()`
- `public.trg_homework_attempts_to_answer_events()`

Обязательные trigger attachments:
- `after_attempts_insert_answer_events`
- `after_hw_attempts_insert_answer_events`
- `after_hw_attempts_payload_answer_events`

Обязательные инварианты дедупликации:
- `answer_events_uniq_hw`
- `answer_events_uniq_test`

## 2. Целевые артефакты в репозитории

После extraction должны быть заполнены и закоммичены:
- [trg_attempts_to_answer_events.sql](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/docs/supabase/trg_attempts_to_answer_events.sql)
- [trg_homework_attempts_to_answer_events.sql](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/docs/supabase/trg_homework_attempts_to_answer_events.sql)

Дополнительно рекомендуется обновить:
- [stage9_write_path_inventory.md](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/docs/navigation/stage9_write_path_inventory.md)
- [current_dev_context.md](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/docs/navigation/current_dev_context.md)

## 3. Порядок extraction

1. Запустить read-only SQL из [stage9_trigger_extraction.sql](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/docs/supabase/stage9_trigger_extraction.sql) в Supabase SQL Editor.

2. Скопировать verbatim результат `pg_get_functiondef(...)` для:
   - `trg_attempts_to_answer_events()`
   - `trg_homework_attempts_to_answer_events()`

3. Вставить их в соответствующие standalone SQL-файлы в `docs/supabase/`.

4. Убедиться, что в заголовках файлов указано:
   - точное `regprocedure`
   - дата extraction
   - источник `pg_get_functiondef(...)`

5. Отдельно сохранить в заметках или commit message:
   - trigger definitions (`pg_get_triggerdef`)
   - наличие уникальных индексов `answer_events_uniq_hw` / `answer_events_uniq_test`

## 4. Что проверить сразу после extraction

### 4.1. Поведение `attempts`

Нужно ответить на вопросы:
- какие поля из `attempts` реально маппятся в `answer_events`;
- как определяется `source` для non-homework событий;
- как формируются `section_id`, `topic_id`, `question_id`;
- есть ли защита от дублей по одному и тому же `attempt`;
- есть ли ветвление по `payload.questions`.

### 4.2. Поведение `homework_attempts`

Нужно ответить на вопросы:
- пишет ли trigger по всему payload целиком или по каждой `question`;
- что происходит при повторном `submit_homework_attempt`;
- как trigger выбирает `source='hw'`;
- как используется `hw_attempt_id`;
- есть ли защита от повторного формирования событий при update payload.

### 4.3. Инварианты дедупликации

Нужно подтвердить, что текущая защита реально согласована с trigger behavior:
- `answer_events_uniq_hw`
- `answer_events_uniq_test`

Если trigger опирается на иную форму идемпотентности, это надо явно задокументировать.

## 5. Красные флаги

Extraction нельзя считать достаточным, если обнаружится хотя бы одно из:

- trigger-функция использует скрытые helper functions, которых нет в repo;
- logic ветвится по полям, не описанным в inventory;
- trigger silently skips rows без явного логирования/raise;
- идемпотентность держится не на индексах и не на явной проверке, а на неочевидном side effect;
- разные write-path используют несовместимые формы payload.

В таком случае Stage 9.2 нужно расширить до extraction dependent helpers, а не идти дальше.

## 6. Expected Output после Stage 9.2

После завершения подэтапа команда должна иметь:

- reviewable SQL source обеих trigger-функций в репозитории;
- зафиксированный current behavior write-bridge;
- подтверждённые trigger attachments;
- подтверждённую или уточнённую модель дедупликации;
- список конкретных мест, которые надо менять в Stage 9.3.

## 7. Definition of Done для Stage 9.2

Stage 9.2 считается закрытым, когда одновременно выполнены условия:

- `trg_attempts_to_answer_events()` сохранён как standalone SQL;
- `trg_homework_attempts_to_answer_events()` сохранён как standalone SQL;
- trigger attachments сверены с live schema;
- дедупликационные индексы и trigger behavior сопоставлены;
- если обнаружены hidden helper dependencies, они тоже перечислены и вынесены в follow-up.

## 8. Что делать сразу после 9.2

Следующий подэтап: `Stage 9.3`.

Его стартовая цель:
- выбрать target write seam;
- решить, остаётся ли trigger bridge временным механизмом или заменяется явным canonical write API;
- расписать миграцию отдельно для `trainer/analog` и для `homework`.
