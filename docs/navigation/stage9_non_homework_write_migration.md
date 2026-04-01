# Stage 9.3 Non-homework Write Migration

Дата обновления: 2026-04-01

Этот документ раскладывает Stage 9.3 в конкретный backlog по runtime-файлам
для `trainer.js` и `analog.js`.

Связанные документы:
- [Stage 9.3 Canonical Write Seam Spec](stage9_canonical_write_seam_spec.md)
- [write_answer_events_v1.sql](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/docs/supabase/write_answer_events_v1.sql)
- [supabase-write.js](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/app/providers/supabase-write.js)
- [trainer.js](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/trainer.js)
- [analog.js](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/analog.js)

## 1. Scope

В этот подэтап входят только non-homework сценарии:
- `tasks/trainer.js`
- `tasks/analog.js`

Не входят:
- `tasks/hw.js`
- `app/providers/homework.js`
- `submit_homework_attempt`

## 2. Точки изменения

### 2.1. `app/providers/supabase-write.js`

Текущее состояние:
- `insertAttempt(attemptRow)` делает PostgREST `INSERT` в `public.attempts`

Target:
- добавить `writeAnswerEventsV1(...)` поверх `supaRest.rpc('write_answer_events_v1', ...)`
- либо временно перевести `insertAttempt()` на этот RPC без смены внешнего имени

Минимальный target payload:
- `p_source: 'test'`
- `p_attempt_ref`
- `p_events`
- `p_attempt_started_at`
- `p_attempt_finished_at`
- `p_attempt_meta`

Требования:
- `student_id` на клиенте не передавать как source of truth;
- ошибка RPC должна возвращаться в том же формате, что сейчас `insertAttempt()`;
- повторный вызов с тем же `attempt_ref` должен считаться safe retry.

### 2.2. `tasks/trainer.js`

Текущее состояние:
- в finish-path формируется `attemptRow`
- вызывается `insertAttempt(attemptRow)`

Target:
- добавить устойчивый `SESSION.attempt_ref`
- формировать events batch из `SESSION.questions`
- вызывать новый writer через provider

Практические изменения:
- создать `attempt_ref` при старте session, а не при finish;
- хранить его в `SESSION`, чтобы retry не создавал новый id;
- в `p_attempt_meta` оставить useful trace:
  - `mode`
  - `topic_ids`
  - `total`
  - `correct`
  - `avg_ms`
  - `duration_ms`

### 2.3. `tasks/analog.js`

Текущее состояние:
- строится batch из одного вопроса
- вызывается `insertAttempt(attemptRow)`

Target:
- добавить устойчивый `ASESSION.attempt_ref`
- вызывать тот же canonical writer

Практические изменения:
- `attempt_ref` создаётся на старт analog solve;
- `p_attempt_meta.meta.kind='hw_analog'` можно сохранить как trace-info,
  но не как аналитический источник истины.

## 3. Рекомендуемый порядок реализации

1. Реализовать [write_answer_events_v1.sql](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/docs/supabase/write_answer_events_v1.sql)
2. Переключить [supabase-write.js](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/app/providers/supabase-write.js)
3. Добавить stable `attempt_ref` в [trainer.js](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/trainer.js)
4. Добавить stable `attempt_ref` в [analog.js](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/analog.js)
5. Прогнать non-homework smoke

## 4. Smoke и проверки для Stage 9.3

Минимальные syntax-check:

```powershell
node --check app/providers/supabase-write.js
node --check tasks/trainer.js
node --check tasks/analog.js
```

Минимальная ручная проверка:
- решить короткую trainer-session под авторизованным учеником;
- убедиться, что статистика ученика обновилась через `answer_events`;
- повторить тот же submit/retry сценарий и убедиться, что дублей нет;
- решить один analog и убедиться, что событие тоже дошло в аналитику.

Желательный SQL sanity-check после каждого сценария:
- у одного `test_attempt_id` число строк равно числу уникальных `question_id`;
- повторный retry не увеличивает count.

## 5. Риски

1. Сгенерировать `attempt_ref` слишком поздно.
Тогда retry после сетевой ошибки создаст новый id и обойдёт dedupe.

2. Потерять стабильность `attempt_ref` между finish и retry.
Нужен один id на одну попытку, а не на один HTTP-вызов.

3. Оставить `student_id` клиентским полем.
Это сломает boundary между фронтом и canonical write contract.

4. Не зафиксировать явную модель `section_id`.
Stage 9.2 показал, что live bridge выводит `section_id` из `topic_id` как
`split_part(topic_id, '.', 1)`. Новый seam должен либо сохранить ту же
server-derived семантику, либо явно требовать `section_id` от клиента.

## 6. Definition of Done

Stage 9.3 по non-homework slice считается готовым к реализации, когда:
- есть один явный migration backlog по трём runtime-файлам;
- выбран stable `attempt_ref` contract;
- подготовлен smoke-набор для retry/idempotency;
- нет открытого вопроса, через какую именно точку `trainer.js` и `analog.js`
  будут писать в `answer_events`.
