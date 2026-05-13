# WS_PLAN — Уникальные ссылки на тренировку (Session Links)

## Метаданные

- task_id: `2026-05-13-ws-session-links`
- Волна: `WS` (новый продуктовый трек, параллельный активной W1; **не сдвигает критический путь W1**)
- Подволны: `WS.1` (минимально работающая ссылка), `WS.2` (защита от повтора + result-overlay)
- Тип: `product_feature` со SQL-составляющей (red-zone overlay по `CLAUDE.md`: меняем существующий runtime-контракт `get_homework_by_token` и расширяем существующую таблицу `homeworks`)
- Risk WS.1: `yellow` (ALTER TABLE с default, точечная правка одного runtime-RPC, новый RPC). Без write-path-изменений.
- Risk WS.2: `yellow→red` на участке submit-цепочки (новые RPC параллельно `submit_homework_attempt_v2`; идемпотентность критична).
- Baseline commit: фиксируется исполнителем при старте WS.1.
- Связанные документы: `GLOBAL_PLAN.md §8` (Stage 9 canonical write-path), `PROJECT_STATUS.md §2.1`, `CURATOR.md §6`, `docs/navigation/architecture_contract_4layer.md §2`, `docs/supabase/runtime_rpc_registry.md` (раздел Homework / Student Homework), `reports/wR_student_stats_recon_report.md`.

---

## 1. Цель

Дать пользователю (ученику или учителю) возможность из picker'а получить **короткий уникальный URL**, по которому открывается тренажёр (`tasks/trainer.html?session=<token>`) или список задач (`tasks/list.html?session=<token>`) с **тем же замороженным набором задач**, что был собран в момент создания ссылки.

В WS.1 ссылка работает «как есть»: открыл, прорешал, ответы пишутся в `answer_events` через стандартный non-homework write-path. Никакой защиты от повторного открытия.

В WS.2 повторное открытие после успешного прохождения показывает overlay с результатом и не даёт пройти ещё раз; submit идемпотентен, защищён локальным backup'ом от сетевых сбоев. Накрутка статистики становится невозможной по конструкции БД.

## 2. Контекст и мотивация

- Ученики у оператора активно ждут возможность **сохранять конфигурацию тренировки** и **отправлять её друг другу**. Текущий picker сохраняет выбор только в `sessionStorage` — теряется при закрытии вкладки, не делится.
- Подробное обсуждение архитектурных альтернатив (включая 9 вариантов encode-стратегий) проведено в переписке оператор↔куратор от 2026-05-13. Зафиксированные решения:
  - **Путь B** (расширяем существующую `homeworks` колонкой `kind`, а не создаём параллельный домен).
  - **URL чистый без `hw.html`**: `tasks/trainer.html?session=<token>` и `tasks/list.html?session=<token>`.
  - **Анонимный доступ запрещён** — open без auth → redirect на `tasks/auth.html?next=<current>`.
  - **`source='test'`** в `answer_events`, нового значения не вводим.
  - **Без features**: «создать новую тренировку по тем же темам», «мои сессии» (кабинет), title/expiration. Они выносятся в follow-up.
  - **Catalog-drift** = warning + best-effort: если часть `question_id` уже не резолвится — показываем оставшиеся, выводим warning, не ошибку.
  - **Этапная выдача**: WS.1 выпускаем как можно быстрее (без result-overlay), WS.2 — отдельным релизом с защитой и UX-надёжностью.
- По `GLOBAL_PLAN.md §3, §4`, активная волна — W1 (CSS-декомпозиция). WS открывается как **параллельный продуктовый трек по запросу оператора**, не сдвигает критический путь W1. Это решение оператора, зафиксированное в этой переписке.

## 3. Out of scope (обеих подволн вместе)

- Кабинет «мои сессии» (новый экран со списком созданных пользователем сессий).
- Title для сессии (создаётся с `title=null` или авто-генерируется).
- Expiration / GC старых записей.
- Учительская агрегация «кто проходил мою ссылку».
- Кнопка «создать новую тренировку по тем же темам» в result-overlay (WS.2).
- Шаринг через системный share-sheet (только «копировать ссылку»).
- Возобновление частично пройденной попытки на backend (только локально через `localStorage`, WS.2).
- Изменения в roadmap: WS не претендует на роль критического пути; W1.1 продолжает идти параллельно или после WS.1.
- Никакие изменения в существующих ДЗ-сценариях (`tasks/hw.html`, `tasks/hw_create.html`, `tasks/my_homeworks*`) — только точечные правки backend RPC, не затрагивающие user-facing UX.

### Зафиксированные follow-up волны (вне scope WS.1/WS.2)

- **WS.3 — Кабинет session-ссылок** (по запросу оператора, 2026-05-13). Новый отдельный экран и/или раздел в существующем учительском интерфейсе, где отображаются все созданные пользователем session-ссылки (для учителя — особенно важно). НЕ перепутывать с «Мои ДЗ»: это **отдельный** surface с собственными RPC (например, `list_my_session_links()`). Тайминг — после WS.2 и/или после стабилизации W1, по решению оператора.

## 4. Затрагиваемые файлы

### WS.1 — изменяем

**Backend (SQL):**
- `docs/supabase/homeworks_add_kind_migration.sql` (создание) — миграция ALTER TABLE.
- `docs/supabase/get_homework_by_token.sql` (правка) — добавить `kind` в RETURN, без изменения логики.
- `docs/supabase/create_session_link.sql` (создание) — новый RPC.
- `docs/supabase/assign_homework_to_student.sql` (правка) — guard на `kind='session'`.
- `docs/supabase/runtime_rpc_registry.md` (правка) — добавить `create_session_link` в раздел Homework, отметить обновление `get_homework_by_token`.

**Frontend:**
- `app/providers/task_session.js` (создание) — обёртка `createSessionLink({mode, shuffle, spec, frozen_questions})`.
- `tasks/picker.js` (правка) — `saveSelectionAndGo()` ветка с RPC + навигация на `?session=`.
- `tasks/trainer.js` (правка) — на старте: hydrate из `?session=` через `get_homework_by_token`.
- `tasks/list.js` (правка) — симметрично trainer.
- `tasks/trainer.html` (правка) — добавить кнопку «Скопировать ссылку» в шапку, если `?session=` присутствует.
- `tasks/list.html` (правка) — симметрично trainer.html.
- `tools/bump_build.mjs` — запускается в конце для синхронизации `?v=`.

### WS.2 — изменяем (поверх WS.1)

**Backend (SQL):**
- `docs/supabase/start_session_attempt.sql` (создание) — новый RPC.
- `docs/supabase/submit_session_attempt.sql` (создание) — новый RPC.
- `docs/supabase/runtime_rpc_registry.md` (правка) — добавить два RPC.

**Frontend:**
- `app/providers/task_session.js` (правка) — добавить `startAttempt`, `submitAttempt` с retry-логикой.
- `tasks/trainer.js`, `tasks/list.js` (правка) — start_session_attempt на boot, submit_session_attempt на финише, localStorage-backup.
- `tasks/session_result.js` (создание) — render result-overlay.
- `tasks/trainer.css` или новый `tasks/session_result.css` — стили overlay.

### Только чтение (обе подволны)

- `docs/supabase/get_homework_by_token.sql`, `submit_homework_attempt_v2.sql`, `start_homework_attempt.sql`, `assign_homework_to_student.sql` — образцы.
- `tasks/homework_api.js`, `app/providers/homework.js`, `tasks/smart_hw_builder.js` — образцы FE-провайдеров.
- `app/providers/supabase-rest.js`, `app/providers/supabase.js` — RPC/auth слой.
- `docs/navigation/architecture_contract_4layer.md` — для проверки канона.

### Запрещено

- Любые правки `answer_events` schema, `write_answer_events_v1`, `submit_homework_attempt_v2` (canonical write-path Stage 9 — не трогаем).
- Удаление колонок из `homeworks`, изменение `attempts_per_student`, переименование существующих RPC.
- Изменение существующих ДЗ-сценариев на frontend (только дополнения для `kind='session'`-ветки).
- Открытие любых других продуктовых треков параллельно.

## 5. Пошаговый план

### 5.0 Task-tracking (обязательно)

В начале каждой подволны создать TaskList через `TaskCreate` с пунктами 5.1.x / 5.2.x. По мере выполнения — `TaskUpdate` (`in_progress` при старте, `completed` при завершении). Это требование `CURATOR.md §6.1` для волн от 3 шагов.

### 5.1 Подволна WS.1 — «работает по ссылке»

**5.1.1 Recon (~2 часа)**. Прочесть полностью: `tasks/picker.js:saveSelectionAndGo` (~5 строк вокруг), `tasks/trainer.js` начальная инициализация (~30 строк), `tasks/list.js` то же, `tasks/smart_hw_builder.js:buildFrozenQuestionsForTopics` (формат return). Зафиксировать в `reports/ws1_session_links_report.md §1` точные file:line точек, куда вставлять hydration-ветки.

**5.1.2 SQL — миграция (~1 час)**. Написать `docs/supabase/homeworks_add_kind_migration.sql`:
```sql
alter table public.homeworks
  add column if not exists kind text not null default 'graded'
  check (kind in ('graded', 'session'));
```
Прогон на dev Supabase, проверить что существующие row'ы получили `kind='graded'`. Индекс на колонке `kind` не нужен — низкая cardinality (только два значения), planner не возьмёт; никаких запросов с одиночным предикатом `where kind='X'` пока не существует. Если потом понадобится composite (например, `(owner_id, kind)`) — добавим под конкретный план запроса.

**5.1.3 SQL — обновить `get_homework_by_token` (~30 мин)**. Добавить `kind` в RETURN и SELECT. Сохранить grant для `anon, authenticated`. Внутри функции — никаких изменений логики, только новое поле в проекции.

**5.1.4 SQL — `create_session_link` RPC (~1.5 часа)**. Новый RPC по образцу `start_homework_attempt`:
- сигнатура: `create_session_link(p_mode text, p_shuffle boolean, p_spec_json jsonb, p_frozen_questions jsonb) returns table(homework_id uuid, token text)`;
- проверки: `auth.uid()` not null, `p_mode in ('list','test')`, `p_frozen_questions` is jsonb array non-empty;
- инсерт в `homeworks` с `owner_id=auth.uid()`, `kind='session'`, `is_active=true`, `attempts_per_student=1`, `title=null`, `frozen_questions=p_frozen_questions`, `spec_json=p_spec_json || jsonb_build_object('mode',p_mode,'shuffle',p_shuffle)`;
- инсерт в `homework_links` с генерированным token (BASE64 18 байт = 22 символа, как сейчас в `homework_api.js:makeToken`);
- grant execute to authenticated;
- security definer (чтобы обойти RLS на `homeworks.insert`, который сейчас может требовать teacher-whitelist).

**5.1.5 SQL — guard в `assign_homework_to_student` (~30 мин)**. Добавить в начало функции после auth-checks:
```sql
if (select kind from public.homeworks where id = p_homework_id) = 'session' then
  raise exception 'SESSION_NOT_ASSIGNABLE' using errcode = '42501';
end if;
```

**5.1.6 Registry update (~15 мин)**. Добавить `create_session_link` в раздел Homework `runtime_rpc_registry.md`. Отметить, что `get_homework_by_token` теперь возвращает `kind`.

**5.1.7 Frontend — провайдер (~1 час)**. `app/providers/task_session.js`: функция `createSessionLink({mode, shuffle, spec, frozenQuestions})` → `supaRest.rpc('create_session_link', {...})` → `{ ok, homework_id, token, error }`.

**5.1.8 Frontend — `tasks/picker.js` (~2 часа)**. В `saveSelectionAndGo()`:
1. После сборки `selection` — вызвать `buildFrozenQuestionsForTopics` (тот же путь что у ДЗ);
2. `createSessionLink(...)`;
3. На успех — `location.href = (mode==='test' ? 'trainer.html' : 'list.html') + '?session=' + token`;
4. На ошибку RPC (`AUTH_REQUIRED`/network) — fallback на старый sessionStorage-flow с warning в console (мы не блокируем тренировку при сбоях backend).

**5.1.9 Frontend — `tasks/trainer.js` + `tasks/list.js` (~3 часа)**. На старте каждой страницы:
1. Если `URLSearchParams.get('session')` пуст → старое поведение (sessionStorage).
2. Иначе → `supaRest.rpc('get_homework_by_token', { p_token: token })`.
3. Если `is_active=false` → показать «Ссылка недоступна», предложить вернуться на главную.
4. Если `kind !== 'session'` → не наша ссылка, тоже «недоступно».
5. Hydrate: подменить input questions на `frozen_questions`, режим взять из `spec_json.mode`, shuffle из `spec_json.shuffle`.
6. Catalog-drift handling: если часть `question_id` не резолвится в текущем каталоге через `loadCatalogIndexLike` — warning «Часть задач недоступна — каталог обновился», работать с оставшимися.

**5.1.10 Frontend — кнопка «Скопировать ссылку» (~1 час)**. В `tasks/trainer.html` и `tasks/list.html` — кнопка в шапке, видна только при `?session=<token>` в URL. Onclick → `navigator.clipboard.writeText(location.href)` + flash «Скопировано».

**5.1.11 Auth-gate (~30 мин)**. Если `?session=<token>` есть и нет `requireSession()` — redirect на `tasks/auth.html?next=<encoded_current_url>`. Поведение симметрично `tasks/hw.html`, можно подсмотреть в `tasks/hw.js`.

**5.1.12 Bump build (~5 мин)**. `node tools/bump_build.mjs`.

**5.1.13 Тесты (~4 часа)**. Playwright e2e в `e2e/student/ws1-session-link.spec.js`:
- E2E.A1: ученик создаёт ссылку из picker → получает URL → открывает в новой вкладке → видит тот же набор задач в trainer.
- E2E.A2: открыть `?session=<token>` без авторизации → redirect на auth.html.
- E2E.A3: открыть с `?session=<invalid_token>` → «Ссылка недоступна».
- Smoke прогон существующих ДЗ-сценариев — не сломалось.

**5.1.14 Отчёт `reports/ws1_session_links_report.md`** (~1 час) и git коммит. **Без push.**

### 5.2 Подволна WS.2 — «защита и result-overlay»

Стартует **только после accept WS.1**. План будет детализирован в `WS2_session_links_protection_PLAN.md` или в отдельных секциях этого же документа после ревью WS.1.

Каркас:
- **5.2.0** Explicit стоп-чек: убедиться, что `list_student_attempts` (учительский экран попыток ученика, `tasks/student.js:1378` → SQL `docs/supabase/list_student_attempts.sql`) корректно отделяет session-attempts от homework-attempts. Сейчас он join'ит `homework_attempts` к `homeworks` только по `homework_id`, **без** фильтра `kind`. Когда WS.2 начнёт писать в `homework_attempts` для `kind='session'`, эти попытки попадут в учительский экран как обычные ДЗ-попытки — это нежелательно, потому что в учительский кабинет идут только ДЗ. Фильтр `where hw.kind = 'graded'` или эквивалент должен быть добавлен в `list_student_attempts.sql` **до** того, как session-attempts начнут писаться. Это блокирующая правка для 5.2.2.
- **5.2.1** Recon точек submit во всех session-открытиях.
- **5.2.2** SQL — `start_session_attempt`, `submit_session_attempt` (по образцу homework-аналогов, с `source='test'` и без `p_student_name`); правка `list_student_attempts` (см. 5.2.0); правка `get_homework_attempt_for_teacher` если он не делает access-check по `kind` (проверить отдельно).
- **5.2.3** Constraint `unique (homework_id, student_id) where homework_id in (select id from homeworks where kind='session')` — partial unique index на `homework_attempts`.
- **5.2.4** Frontend — стартовый бранч `start_session_attempt`: `is_finished=true → result-overlay`, иначе solve-flow.
- **5.2.5** Frontend — submit с retry (3 ретрая 1с/3с/9с) + localStorage backup до submit, cleanup после успеха.
- **5.2.6** Frontend — re-submit from localStorage on boot, если есть pending payload для этого token+uid.
- **5.2.7** `tasks/session_result.js` — общий модуль рендера overlay (по образцу result-блока в `tasks/hw.js`, но без teacher-режима).
- **5.2.8** Тесты + отчёт + bump build.

## 6. Данные / контракты / миграции

### 6.1 Расширение `homeworks`

Колонка `kind text not null default 'graded' check (kind in ('graded', 'session'))`. Без default это бы сломало все существующие row'ы — default обязателен.

### 6.2 Поведение существующих RPC при `kind='session'`

| RPC | Поведение для `kind='session'` | Изменения в WS.1 |
|---|---|---|
| `get_homework_by_token` | Возвращает row как обычно, плюс новое поле `kind` | Добавлено поле в RETURN |
| `assign_homework_to_student` | Raise `SESSION_NOT_ASSIGNABLE` | Добавлен guard |
| `start_homework_attempt` | Не вызывается из session-flow в WS.1 | Без изменений |
| `submit_homework_attempt_v2` | Не вызывается из session-flow в WS.1 | Без изменений |
| `get_homework_attempt_by_token` | Не вызывается из session-flow | Без изменений |
| `student_my_homeworks_summary` | Фильтрует только `kind='graded'` — добавить guard? | **Открытый вопрос Q1** |

### 6.3 Новый RPC `create_session_link` (WS.1)

```sql
create or replace function public.create_session_link(
  p_mode text,
  p_shuffle boolean,
  p_spec_json jsonb,
  p_frozen_questions jsonb
)
returns table(homework_id uuid, token text)
language plpgsql security definer
set search_path to 'public', 'auth'
as $$
declare
  v_uid uuid := auth.uid();
  v_hw_id uuid;
  v_token text;
  v_spec jsonb;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_mode not in ('list', 'test') then raise exception 'BAD_MODE'; end if;
  if p_shuffle is null then p_shuffle := false; end if;
  if jsonb_typeof(p_frozen_questions) <> 'array' or jsonb_array_length(p_frozen_questions) = 0 then
    raise exception 'BAD_FROZEN_QUESTIONS';
  end if;

  v_spec := coalesce(p_spec_json, '{}'::jsonb)
            || jsonb_build_object('mode', p_mode, 'shuffle', p_shuffle);

  insert into public.homeworks(owner_id, kind, title, spec_json, frozen_questions, is_active, attempts_per_student)
  values (v_uid, 'session', null, v_spec, p_frozen_questions, true, 1)
  returning id into v_hw_id;

  v_token := 'sess_' || encode(gen_random_bytes(18), 'base64');
  -- убрать base64 padding и slash для URL-safety
  v_token := replace(replace(replace(v_token, '+', '-'), '/', '_'), '=', '');

  insert into public.homework_links(token, homework_id, owner_id, is_active)
  values (v_token, v_hw_id, v_uid, true);

  homework_id := v_hw_id;
  token := v_token;
  return next;
end;
$$;
revoke execute on function public.create_session_link(text, boolean, jsonb, jsonb) from anon;
grant execute on function public.create_session_link(text, boolean, jsonb, jsonb) to authenticated;
```

### 6.4 Миграции и safety

- Все ALTER — `add column if not exists`, `create index if not exists`, обратимы.
- Никаких UPDATE/DELETE на существующих row'ах.
- Roll-back план: `drop function create_session_link`; `alter table homeworks drop column kind`. Существующие ДЗ не пострадают.

## 7. Риски и stop-ask

### Риски

- **R1 — RLS-policy на `homeworks.insert`**. Текущий механизм через `restInsert` (`tasks/homework_api.js:34-51`) работает прямым PostgREST INSERT под токеном teacher'а. Если на `homeworks` стоит row-level RLS с teacher-check — наш `create_session_link` под `security definer` его обходит, что приемлемо, но нужно **подтвердить** что мы не нарушаем других политик. **Stop-ask**, если RLS-policy окажется не такой, как ожидалось.
- **R2 — `homework_links.owner_id`**. Колонка передаётся в `homework_api.js:91`. Если в таблице есть NOT NULL constraint и FK на `auth.users` — наш RPC передаст `v_uid` (auth.uid() ученика), всё ок. Но **подтвердить через `\d homework_links`** в Recon (5.1.1).
- **R3 — Catalog drift на момент создания ссылки**. `buildFrozenQuestionsForTopics` строит frozen из текущего каталога. Если catalog поменяется между созданием и открытием — обработка через warning + best-effort (см. 5.1.9.6). Документировать в reports.
- **R4 — Roadmap conflict**. WS открывается параллельно W1 по решению оператора. **Подтверждение оператора зафиксировано в переписке от 2026-05-13** (этот пункт — про governance, не про реализацию).
- **R5 — Token collision**. ~131 бит энтропии (gen_random_bytes(18)). На практике collision вероятность ничтожна, retry на UNIQUE-violation не нужен. Если нужен — добавить.

### Stop-ask триггеры

Исполнитель **обязан** остановиться и спросить оператора, если:
1. RLS на `homeworks` или `homework_links` не позволяет `security definer` обойти политику (R1).
2. ALTER TABLE `homeworks` падает на dev Supabase (любая ошибка миграции).
3. В существующих ДЗ-сценариях наблюдается регрессия после применения SQL-изменений.
4. Catalog API не отдаёт `question_id` в стабильной форме (например, ID меняются при каждом catalog rebuild).
5. Любой scope expansion: добавить title, expiration, cabinet, теacher analytics, smart-build-by-topics — всё это **запрещено** в WS.1/WS.2 без отдельного одобрения оператора.

### НЕ считается экстренным

- Кнопка «копировать ссылку» не работает в каком-то редком браузере → fallback на manual select + Ctrl+C, не блокер.
- Picker-fallback на sessionStorage срабатывает при network error → это by-design (см. 5.1.8.4).

## Режим работы

WS.1 — **автономный до DoD §8.1**. Не останавливаться за подтверждением на каждом шаге. После закрытия DoD WS.1 — пауза на ревью куратора, не стартовать WS.2 без явной команды.

WS.2 — отдельная сессия после accept WS.1. Может потребовать корректировок плана исходя из реальности WS.1.

## 8. Критерии приёмки (DoD)

### 8.1 DoD WS.1

- Существует `homeworks.kind` с `default 'graded'`. Существующие row'ы остались `kind='graded'`.
- `create_session_link` зарегистрирован в `runtime_rpc_registry.md`, доступен через `supaRest.rpc`.
- `get_homework_by_token` возвращает `kind`.
- `assign_homework_to_student` отказывает с явной ошибкой на `kind='session'`.
- Picker на «Начать» создаёт сессию, URL содержит `?session=<token>`, навигация — на `trainer.html` или `list.html`.
- Открытие URL в другой вкладке (с тем же auth) показывает тот же набор задач.
- Открытие URL без auth — redirect на `tasks/auth.html?next=...`.
- Открытие с невалидным token — понятная ошибка, не пустой экран.
- Catalog-drift detected → warning, оставшиеся задачи работают.
- Существующие ДЗ-сценарии (`hw.html`, `hw_create.html`, teacher card) не сломались — Playwright smoke зелёный.
- Все changed файлы (frontend + SQL) идут с обновлённой `?v=` через `bump_build.mjs`.
- Отчёт `reports/ws1_session_links_report.md` написан, коммит создан **без push**.

### 8.2 DoD WS.2

(Описан в каркасе 5.2; детализируется после accept WS.1.)

## 9. План проверки

### WS.1

1. SQL: прогон миграции на dev Supabase, проверить `select count(*) from homeworks group by kind` — все old=graded, новый session при тесте RPC.
2. RPC: вручную `supaRest.rpc('create_session_link', { p_mode: 'test', p_shuffle: false, p_spec_json: {}, p_frozen_questions: [...] })` — получили token.
3. Открыли URL → видим задачи.
4. Открыли в incognito → redirect на auth.
5. Playwright e2e (5.1.13).
6. Smoke: `tasks/hw.html?token=<existing>` — работает как раньше.
7. Governance: `node tools/check_runtime_rpc_registry.mjs && node tools/check_runtime_catalog_reads.mjs && node tools/check_no_eval.mjs` — зелёные.

### WS.2

(Описан позже.)

## 10. Отчётный артефакт

### WS.1
- `reports/ws1_session_links_report.md` — обязательный.
- Структура (по аналогии с `reports/w2_*_report.md`): метаданные + baseline + §1..§N по шагам 5.1.x + результаты тестов + git diff stat + git status + список follow-up.

### WS.2
- `reports/ws2_session_links_protection_report.md` — обязательный, после accept WS.1.

---

## Принятые решения по предзапросам (2026-05-13, переписка оператор↔куратор)

- **Q1 — фильтрация session-row'ов в «Мои ДЗ» ученика**. Не требуется. Существующие RPC `student_my_homeworks_summary` и `student_my_homeworks_archive` driven от `homework_assignments`, а session-ссылки этой таблицы не имеют (создание assignment для `kind='session'` явно блокируется в шаге 5.1.5). Дополнительной правки этих RPC в WS.1 не делаем. Отдельный учительский экран для отображения session-ссылок — see WS.3 (см. §3 «follow-up»).
- **Q2 — `assign_homework_to_student` errcode**. Принято: `42501` (standard for access denied). Закрыт.
- **Q3 — индекс на `homeworks.kind`**. Не нужен. Низкая cardinality (2 значения), planner не возьмёт; нет запросов с одиночным фильтром по kind. Снято из миграции 5.1.2.

Дополнительный стоп-чек, обнаруженный при разборе Q1: в WS.2 потребуется фильтр `kind='graded'` в `list_student_attempts` (учительский экран попыток ученика), потому что эта RPC станет неотличать session-attempts от homework-attempts после введения общей таблицы. См. блокирующий пункт 5.2.0.
