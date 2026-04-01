# Stage 9.4 Homework Write Migration

Дата обновления: 2026-04-01

Этот документ раскладывает Stage 9.4 в конкретный backlog для homework submit-path.

Связанные документы:
- [Stage 9.4 Homework Submit Seam Spec](stage9_homework_submit_seam_spec.md)
- [submit_homework_attempt_v2.sql](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/docs/supabase/submit_homework_attempt_v2.sql)
- [Scenario: homework submit](scenarios/homework_submit.md)
- [app/providers/homework.js](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/app/providers/homework.js)
- [hw.js](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/hw.js)

## 1. Scope

В этот подэтап входят:
- submit homework attempt
- write-through в `homework_attempts`
- write-through в `answer_events`
- retry/idempotency поведение finish-кнопки

Не входят:
- старт homework attempt
- teacher report redesign
- финальный live-drop старых trigger-функций

## 2. Точки изменения

### 2.1. `docs/supabase/submit_homework_attempt_v2.sql`

Новый целевой RPC:
- атомарно обновляет `homework_attempts`
- атомарно пишет `answer_events`
- возвращает структурированный результат submit

### 2.2. `app/providers/homework.js`

Текущее состояние:
- `submitHomeworkAttempt(...)` вызывает `submit_homework_attempt`
- возвращает только `{ ok: true }` без payload

Target:
- вызывать `submit_homework_attempt_v2`
- возвращать нормализованный результат:
  - `attempt_id`
  - `already_submitted`
  - `written_events`
  - `finished_at`
  - `total`
  - `correct`

### 2.3. `tasks/hw.js`

Текущее состояние:
- payload questions не содержит `section_id`
- UI после submit делает follow-up read результата

Target:
- либо добавить `section_id` в `payloadQuestions`,
  либо сохранить live-compat и выводить его на сервере из `topic_id`
- сохранить текущий UX finish/result
- считать `already_submitted=true` успешным replay исходом

## 3. Ключевой runtime gap

До реализации Stage 9.4 нужно зафиксировать явную модель `section_id`.

Существующая live-семантика:
- `trg_homework_attempts_to_answer_events()` выводит `section_id`
  как `split_part(topic_id, '.', 1)`

Поэтому в Stage 9.4 нужно выбрать один из двух явных вариантов:
- клиент передаёт `section_id`
- сервер выводит `section_id` из `topic_id`

Иные question fields в [hw.js](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/hw.js) должны
остаться в payload:
- `topic_id`
- `question_id`
- `difficulty`
- `correct`
- `time_ms`

## 4. Рекомендуемый порядок реализации

1. Реализовать [submit_homework_attempt_v2.sql](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/docs/supabase/submit_homework_attempt_v2.sql)
2. Обновить [app/providers/homework.js](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/app/providers/homework.js)
3. Выбрать модель `section_id` для [hw.js](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/hw.js)
4. Прогнать idempotency smoke
5. Прогнать analytics regression smoke

## 5. Smoke и проверки для Stage 9.4

Минимальные syntax-check:

```powershell
node --check app/providers/homework.js
node --check tasks/hw.js
```

Обязательные ручные сценарии:
- первый submit homework attempt -> итог green, события записаны
- повторный клик/повторный submit -> дублей нет, результат детерминирован
- refresh страницы после submit -> result screen поднимается корректно
- teacher open by `attempt_id` -> отчёт не сломан

Желательный SQL sanity-check:
- количество `answer_events` для одного `hw_attempt_id`
  равно числу уникальных `question_id` в payload;
- повторный submit не увеличивает count.

## 6. Риски

1. Вставка `answer_events` после update, но без общей транзакции.
Это даст частично завершённый submit.

2. Сохранить `void` return contract.
Тогда фронт продолжит гадать, новый это submit или retry.

3. Не зафиксировать явную модель `section_id`.
Это снова создаст плавающую семантику event-contract.

4. Оставить старый trigger активным параллельно новому write-through без контроля.
Это легко приведёт к дублям.

## 7. Definition of Done

Stage 9.4 по homework slice считается готовым к реализации, когда:
- есть один явный migration backlog по SQL и двум runtime-файлам;
- выбран атомарный submit seam;
- известна и зафиксирована модель `section_id`
  (payload-поле или server-derived из `topic_id`);
- подготовлен smoke-набор на retry и result-screen восстановление.
