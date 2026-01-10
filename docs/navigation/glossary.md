# Глоссарий

Дата обновления: 2026-01-10

Секция будет расширяться на этапах 2–4.

- topic_id
  - идентификатор темы (строка, обычно формата 1.1 или 7.3)

- question_id
  - идентификатор конкретной задачи (строка, обычно начинается с topic_id)

- prototype
  - запись в JSON‑манифесте темы, которая описывает условие, рисунок и ответ

- baseId
  - агрегированный идентификатор “базы” прототипа для выборки (см. baseIdFromProtoId в app/core/pick.js)

- homework
  - домашнее задание учителя (таблица homeworks)

- homework_link token
  - токен‑ссылка на домашку (таблица homework_links, параметр ?token=...)

- homework_attempt
  - попытка ученика по домашке (таблица homework_attempts)

- attempt
  - попытка тренажёра (таблица attempts)

- answer_event
  - событие ответа (таблица answer_events), основной источник статистики

- RPC
  - функция в Supabase, доступная через /rest/v1/rpc/<fn>

- RLS
  - row level security, политики доступа в Postgres на уровне строк

- PKCE
  - механизм OAuth, используемый Supabase для безопасного обмена code→session
