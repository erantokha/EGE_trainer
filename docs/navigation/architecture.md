
# Архитектура (L0)

Оглавление
- Контур системы
- Жизненный цикл страницы
- Доменные сущности
- Диаграммы
  - Компонентная схема
  - Вход через Google (sequence)
  - Выполнение ДЗ до результата (sequence)
  - Data-flow по таблицам/RPC

## Контур системы

Фронтенд: статические страницы в tasks/ и общие модули в app/.
Данные задач: content/ (JSON-манифесты + изображения).
Бэкенд: Supabase (Auth + Postgres + PostgREST RPC + RLS).

## Жизненный цикл страницы

Типичный цикл:
1) загрузка html
2) подключение модулей (type="module")
3) initHeader (если на странице используется шапка)
4) загрузка данных (content JSON, затем Supabase)
5) рендер DOM
6) обработчики событий
7) MathJax typeset после вставки формул

Где это реализовано:
- шапка: ../../../app/ui/header.js
- Supabase клиент и finalize redirect: ../../../app/providers/supabase.js
- тренажёр: ../../../tasks/trainer.js
- ДЗ: ../../../tasks/hw.js
- статистика: ../../../tasks/stats.js (через REST rpc)

## Доменные сущности

- пользователь и роль: profiles (ученик/учитель), teachers (whitelist), teacher_students (связь)
- задание (ДЗ): homeworks
- ссылка на ДЗ: homework_links (token)
- попытка ДЗ: homework_attempts
- попытка решения задачи вне ДЗ: attempts
- событие ответа: answer_events (обычно наполняется сервером и используется для статистики)

## Диаграммы

### Компонентная схема

```mermaid
graph TD
  A[tasks/*.html] --> B[tasks/*.js]
  B --> C[app/ui/header.js]
  B --> D[app/providers/supabase.js]
  B --> E[app/providers/homework.js]
  B --> F[content/tasks/index.json + manifests]
  D --> S[Supabase Auth]
  D --> P[PostgREST / RPC]
  P --> DB[(Postgres tables)]
  DB --> RLS[RLS policies]
```

### Вход через Google (sequence)

Подробный сценарий: scenarios/login_google.md

```mermaid
sequenceDiagram
  participant U as User
  participant P as tasks/auth.js
  participant SA as Supabase Auth
  participant C as tasks/auth_callback.js
  participant SP as app/providers/supabase.js

  U->>P: click "Войти через Google"
  P->>SA: signInWithOAuth(google, redirectTo=auth_callback.html)
  SA-->>C: redirect back with code/state
  C->>SP: finalizeAuthRedirect()
  SP->>SA: exchangeCodeForSession (PKCE)
  SA-->>SP: session (access/refresh)
  SP-->>C: ok, clean URL
  C-->>U: redirect to next
```

### Выполнение ДЗ до результата (sequence)

Подробные сценарии:
- scenarios/homework_start.md
- scenarios/homework_submit.md

```mermaid
sequenceDiagram
  participant U as User
  participant H as tasks/hw.js
  participant HW as app/providers/homework.js
  participant DB as Supabase RPC

  U->>H: открыть /tasks/hw.html?token=...
  H->>HW: getHomeworkByToken(token)
  HW->>DB: rpc get_homework_by_token
  DB-->>HW: spec + frozen_questions
  H->>HW: startHomeworkAttempt(token)
  HW->>DB: rpc start_homework_attempt
  DB-->>HW: attempt_id
  U->>H: решает, нажимает "Завершить"
  H->>HW: submitHomeworkAttempt(attempt_id, payload)
  HW->>DB: rpc submit_homework_attempt
  DB-->>HW: ok
  H-->>U: экран результатов
```

### Data-flow по таблицам/RPC

```mermaid
flowchart LR
  subgraph Frontend
    T[trainer.js] -->|insert| A1[attempts]
    HWJ[hw.js] -->|rpc| R1[get_homework_by_token]
    HWJ -->|rpc| R2[start_homework_attempt]
    HWJ -->|rpc| R3[submit_homework_attempt]
    S[stats.js] -->|rpc| D1[student_dashboard_self]
    TS[student.js] -->|rpc| D2[student_dashboard_for_teacher]
  end

  R1 --> HL[homework_links]
  R1 --> HWT[homeworks]
  R2 --> HWA[homework_attempts]
  R3 --> HWA

  A1 --> AE[answer_events]
  HWA --> AE
  AE --> D1
  AE --> D2
```
