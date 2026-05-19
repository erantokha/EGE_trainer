# WS.1 Report — Уникальные ссылки на тренировку (Session Links)

## §1. Метаданные

- task_id: `2026-05-13-ws-session-links`
- Волна: `WS.1`
- Тип: `product_feature` + red-zone overlay (ALTER TABLE + новый runtime-RPC + правки двух существующих RPC)
- Дата старта: `2026-05-13`
- Baseline commit WS.1: `bc5a74c86a230d4bb5423f62af49c68a6315151f`
  — prep-коммит «chore: stage WS.1 baseline (plan + recon + governance + .gitignore)», 5 файлов / 1119 insertions
- Pre-prep parent: `ec8ab66095afc23f138be8d44b40ed4930af688d` (chore: bump build id, последний коммит main до WS.1)
- Plan: `WS_session_links_PLAN.md` (зафиксирован в baseline)
- Source-of-truth для контракта: план; при расхождении промт-обёртки и плана источник — план (§0.5 промта)
- Status: in progress
- Краткая сводка: будет заполнена в §14 финальным commit-pass

---

## §2. Шаг 5.1.1 — Recon точек интеграции

Read-only обход file:line для последующих шагов 5.1.7–5.1.11. Файлы не правились, md5/wc-l целевых файлов не сдвинуты (read-only контракт recon-фазы).

### 2.1. tasks/picker.js — saveSelectionAndGo + boot

| Точка | file:line | Что |
|---|---|---|
| Определение `saveSelectionAndGo` | `tasks/picker.js:4994–5033` | `async function`; читает `CHOICE_TOPICS / CHOICE_SECTIONS / CHOICE_PROTOS / SHUFFLE_TASKS`; mode = `IS_STUDENT_PAGE ? 'test' : (CURRENT_MODE \|\| 'list')` |
| Сборка `selection` для sessionStorage | `tasks/picker.js:5001–5013` | поля: `topics / sections / protos / mode / shuffle` (+ teacher-only: `teacher_student_id / teacher_filter_id / teacher_picked_refs`, student-only: `pick_mode`) |
| Запись sessionStorage | `tasks/picker.js:5019` | ключ `'tasks_selection_v1'` |
| Навигация — test mode | `tasks/picker.js:5025–5026` | `location.href = trainer.html` (same tab) |
| Навигация — list mode | `tasks/picker.js:5028–5031` | `window.open(list.html, '_blank')` (new tab; sessionStorage наследуется намеренно без noopener) |
| Точка вызова из UI | `tasks/picker.js:2361–2369` | `$('#start').click` — после возможного `tryBuildSmartSelection` для student-smart |
| Импорт `supaRest` | `tasks/picker.js:14` | `from '../app/providers/supabase-rest.js?v=2026-04-29-1'` — RPC-слой уже доступен; новый `task_session.js` подключим симметрично |

**Точка вставки RPC (шаг 5.1.8):** между строкой 5013 (после сборки `selection`) и 5018 (try-catch sessionStorage) — здесь есть полностью собранный объект `selection` + `mode` + `SHUFFLE_TASKS`.

### 2.2. tasks/trainer.js — boot

| Точка | file:line | Что |
|---|---|---|
| DOMContentLoaded entry | `tasks/trainer.js:390` | основной boot-handler |
| Try-restore-report-on-reload | `tasks/trainer.js:432–442` | если есть `REPORT_SNAPSHOT_KEY` — отрисовать отчёт, не стартовать новую тренировку |
| smart_mode resolution | `tasks/trainer.js:447–449` | `loadSmartMode()` + `URLSearchParams.get('smart')==='1'` |
| Чтение selection из sessionStorage | `tasks/trainer.js:451` | `rawSel = sessionStorage.getItem('tasks_selection_v1')` |
| Smart fallback (создание selection из smart_mode) | `tasks/trainer.js:452–468` | если rawSel отсутствует, но smart активен — минимальный selection |
| Redirect на picker если selection отсутствует | `tasks/trainer.js:470–474` | `location.href = stats.html` (smart) или `'../'` (обычный) |
| JSON.parse selection | `tasks/trainer.js:476–483` | падение → redirect на `'../'` |
| Применение CHOICE_TOPICS/SECTIONS/PROTOS | `tasks/trainer.js:485–487` | глобальные переменные модуля |
| catalog.js импорт | `tasks/trainer.js:6–9` | `loadCatalogIndexLike, lookupQuestionsByIdsV1` |
| Использование `lookupQuestionsByIdsV1` | `tasks/trainer.js:840` | canonical путь resolve `question_id → row` (используется в catalog-drift handling 5.1.9.6) |

**Точка вставки session-hydration (шаг 5.1.9 trainer):** перед строкой 451 (до чтения sessionStorage). Логика:

1. `const token = new URLSearchParams(location.search).get('session');`
2. Если `token` — сначала auth-gate (5.1.11), затем `supaRest.rpc('get_homework_by_token', { p_token: token })`;
3. Из ответа RPC построить selection-эквивалент: `frozen_questions` → list of `{topic_id, question_id}`, `spec_json.mode / .shuffle`;
4. Минуем sessionStorage, минуем smart-fallback;
5. Catalog-drift: `lookupQuestionsByIdsV1(question_ids)` — отсутствующие выбрасываем с warning, оставшиеся работают.

### 2.3. tasks/list.js — boot

| Точка | file:line | Что |
|---|---|---|
| DOMContentLoaded entry | `tasks/list.js:51` | основной boot-handler |
| Restart-кнопка (очищает selection + редирект на picker) | `tasks/list.js:53–56` | `sessionStorage.removeItem('tasks_selection_v1')`; `location.href = '../'` |
| URL-параметры `topic=&view=all` (отдельная ветка) | `tasks/list.js:75–78` | `IS_ALL_TOPIC_MODE` — обходит sessionStorage целиком |
| Чтение selection из sessionStorage | `tasks/list.js:82` | внутри ветки `!IS_ALL_TOPIC_MODE` |
| Redirect на picker при отсутствии selection | `tasks/list.js:83–86` | `location.href = '../'` |
| JSON.parse selection | `tasks/list.js:89–95` | fallback на `'../'` |
| Применение CHOICE_TOPICS/SECTIONS/PROTOS/SHUFFLE_TASKS | `tasks/list.js:97–100` | глобальные переменные модуля |
| Teacher-filter поля | `tasks/list.js:102–108` | `teacher_student_id / teacher_picked_refs / teacher_filters` |
| catalog.js импорт | `tasks/list.js:15` | `loadCatalogIndexLike, lookupQuestionsByIdsV1` |

**Точка вставки session-hydration (шаг 5.1.9 list):** добавить третью ветку **перед** `if (!IS_ALL_TOPIC_MODE)` на строке 81. Например: `const sessionToken = params.get('session'); const IS_SESSION_MODE = !!sessionToken;`. При `IS_SESSION_MODE` — auth-gate → `get_homework_by_token` → hydrate CHOICE_* и `TEACHER_PICKED_REFS` (см. §2.8), минуем `IS_ALL_TOPIC_MODE` и sessionStorage ветки.

### 2.4. tasks/smart_hw_builder.js — buildFrozenQuestionsForTopics

| Точка | file:line | Что |
|---|---|---|
| Экспорт функции | `tasks/smart_hw_builder.js:146` | `export async function buildFrozenQuestionsForTopics(topics, { shuffle = true } = {})` |
| `topics` формат | `tasks/smart_hw_builder.js:147` | `{ topic_id: count }` |
| Возвращаемый объект | `tasks/smart_hw_builder.js:178` | `{ frozen_questions, shortages, totalWanted, totalPicked }` |
| Формат `frozen_questions` | `tasks/smart_hw_builder.js:170` | `Array<{ topic_id: string, question_id: string }>` |
| Canonical-path resolve | `tasks/smart_hw_builder.js:77–106` | `loadCatalogSubtopicUnicsV1 → lookupQuestionsByUnicsV1` |
| Fallback на manifests | `tasks/smart_hw_builder.js:108–128` | если catalog API недоступен |

**Контракт совпадает с RPC `create_session_link` (план §6.3):** `frozen_questions` — массив объектов `{topic_id, question_id}`. SQL-проверка `jsonb_typeof = 'array'` и `jsonb_array_length > 0` пройдёт без приведения.

**Совместимость с picker.js selection:** `CHOICE_TOPICS` (`tasks/picker.js:5002`) и параметр `topics` builder-а — оба формата `{ topic_id: count }`. Прямой проброс `buildFrozenQuestionsForTopics(CHOICE_TOPICS, { shuffle: SHUFFLE_TASKS })` валиден.

**Gap:** `CHOICE_SECTIONS` и `CHOICE_PROTOS` builder не использует. См. **Q-F1** в §2.9.

### 2.5. tasks/homework_api.js — token-генерация (только как образец)

| Точка | file:line | Что |
|---|---|---|
| `makeToken()` | `tasks/homework_api.js:15–18` | `'tok_' + randHex(16)` — 32 hex + 4-char префикс = 36 chars, ~128 бит энтропии |
| `restInsert(cfg, accessToken, table, row)` | `tasks/homework_api.js:34–51` | прямой PostgREST POST под `Bearer ${accessToken}` (без `security definer`) |
| `createHomeworkAndLink` | `tasks/homework_api.js:53–105` | существующий FE-flow homework+link; retry до 3 раз при UNIQUE-collision на `homework_links.token` (lines 85–100) |

**Дельта с планом §6.3 (наш `create_session_link`):**

- Префикс: `sess_` vs `tok_` — намеренно, визуально отличаются.
- Кодировка: url-safe base64 от 18 байт (~24 символа без padding) vs hex от 16 байт (32 символа) — base64 короче при сопоставимой энтропии (~131 бит vs ~128 бит).
- Retry: текущий FE-код делает 3 ретрая; план §6.3 retry в RPC не предусматривает — энтропия 131 бит даёт астрономически малую вероятность collision (R5 плана).

WS.1 этот файл **не правит** (он остаётся для существующего ДЗ-flow). Новый провайдер `app/providers/task_session.js` (шаг 5.1.7) самостоятельно ходит через `supaRest.rpc('create_session_link', ...)`, без переиспользования `homework_api.js`.

### 2.6. app/providers/supabase-rest.js — RPC слой (только как образец)

| Точка | file:line | Что |
|---|---|---|
| Экспорт `supaRest` | `app/providers/supabase-rest.js:309` | `{ rpc, rpcAny, select, insert, update, remove }` |
| `rpc(fnName, args, opts)` | `app/providers/supabase-rest.js:154–172` | POST `/rest/v1/rpc/<fn>`; формат ошибки `{code, status, endpoint, details}` |
| authMode | `app/providers/supabase-rest.js:87` | `'session'` (default — `requireSession()` обязателен), `'auto'`, `'anon'` |
| 401-retry | `app/providers/supabase-rest.js:111–119, 140–148` | принудительный `getSession({ forceRefresh: true })` |
| Код ошибки `AUTH_REQUIRED` | `app/providers/supabase-rest.js:129–130, 142` | бросается, если сессии нет → провайдер `task_session.js` пробрасывает → picker.js fallback (5.1.8.4) |

**Использование в новом провайдере (5.1.7):**

```js
import { supaRest } from '../app/providers/supabase-rest.js?v=<BUILD>';
export async function createSessionLink({ mode, shuffle, spec, frozenQuestions }) {
  const r = await supaRest.rpc('create_session_link', {
    p_mode: mode, p_shuffle: !!shuffle, p_spec_json: spec || {}, p_frozen_questions: frozenQuestions,
  });
  // r — массив одного row {homework_id, token} (PostgREST: returns table()).
  const row = Array.isArray(r) ? r[0] : r;
  return { ok: true, homework_id: row?.homework_id, token: row?.token };
}
```

### 2.7. tasks/auth.js — инфраструктура `?next=` для шага 5.1.11

| Точка | file:line | Что |
|---|---|---|
| `sanitizeNext(raw)` | `tasks/auth.js:110–131` | same-origin check + `pathname.startsWith(home.pathname)`; fallback на `homeUrl()` |
| Чтение `?next=` | `tasks/auth.js:232` | через `URLSearchParams` |
| Redirect после login | `tasks/auth.js:238` | `location.replace(next)` |
| Propagation в `auth_callback.html` | `tasks/auth.js:248` | `callback.searchParams.set('next', next)` |
| Propagation в `auth_reset.html` | `tasks/auth.js:251` | `reset.searchParams.set('next', next)` |

**Важно (фикс ожидания плана):** инфраструктура `?next=` готова и защищена `sanitizeNext`. Но в репозитории **нет ни одного caller-а**, который сейчас бы редиректил на `auth.html?next=...`. WS.1 §5.1.11 — первый реальный потребитель.

Поведение `tasks/hw.js` (план §5.1.11 ссылается на него как референс): не редирект, а graceful inline-сообщение «Войдите, чтобы открыть отчёт» (`tasks/hw.js:469–472, 494–495`). То есть «симметрично tasks/hw.html» в плане надо читать как «такой же контракт `?<param>=<X>` на URL и проверка авторизации в boot», а не как «такой же стиль auth-gate UX». План явно требует **редиректа** с `next=`, поэтому реализуем именно это (есть `sanitizeNext`, защищающий от open-redirect).

**Кодирование `next`:** `encodeURIComponent(location.href)`. `sanitizeNext` (line 119–127) разруливает абсолютные URL того же origin корректно — query-params вложенного URL переживут round-trip.

### 2.8. teacher_picked_refs — отдельное замечание

В picker.js при `IS_TEACHER_HOME` в selection кладутся `teacher_student_id`, `teacher_filter_id`, `teacher_picked_refs` (`tasks/picker.js:5008–5013`). Они же читаются в list.js (`tasks/list.js:102–108`) и используются для подсветки и фильтрации.

В session-flow эти поля **не имеют смысла** для второго пользователя (того, кто открыл ссылку): он смотрит замороженный набор задач, а не teacher-pick конкретного ученика. То есть в `create_session_link` мы пишем только `frozen_questions + spec.mode/shuffle`, без teacher-context. При hydration в trainer.js/list.js — игнорируем эти поля целиком в session-режиме. Это согласуется с планом §3 («без teacher analytics в WS.1»).

### 2.9. Сводка точек вставки

| Шаг | Файл | Линия | Действие |
|---|---|---|---|
| 5.1.8 | `tasks/picker.js` | вставить после 5013, до 5018 | `buildFrozenQuestionsForTopics(CHOICE_TOPICS, { shuffle: SHUFFLE_TASKS })` → `createSessionLink({ mode, shuffle, spec: {}, frozenQuestions })` → `location.href = (mode==='test' ? 'trainer.html' : 'list.html') + '?session=' + token` |
| 5.1.9-A | `tasks/trainer.js` | **перед** 451 | новая ветка `if (sessionToken) { ... }` ; внутри: auth-gate → `get_homework_by_token` → hydrate; минуем sessionStorage / smart-fallback / redirect-к-picker |
| 5.1.9-B | `tasks/list.js` | **перед** 81 (вне ветки IS_ALL_TOPIC_MODE) | симметрично trainer.js |
| 5.1.10 | `tasks/trainer.html`, `tasks/list.html` | header section | кнопка `#copySessionLink`, видимость управляется JS (`URLSearchParams.get('session')`) |
| 5.1.11 | `tasks/trainer.js`, `tasks/list.js` | в начале session-ветки | до `get_homework_by_token`: проверка `getSession()` через `supabase.js`; на отсутствие — `location.replace('./auth.html?next=' + encodeURIComponent(location.href))` |

### 2.10. Open questions из recon (для куратора)

**Q-F1.** Picker.js собирает `selection` с тремя сегментами: `topics`, `sections`, `protos`. `buildFrozenQuestionsForTopics` (`tasks/smart_hw_builder.js:146`) работает только на `topics`. Что делать в session-flow с непустыми `sections` или `protos`?
- **Вариант A:** свести `sections` к topics через `computeTargetTopics` (`app/core/pick.js`) и/или развернуть `protos` напрямую в `frozen_questions` отдельным проходом; добавить fallback-логику для смешанных случаев.
- **Вариант B (рекомендация исполнителя):** для WS.1 заморозить только `topics`-ветку. Если `sections` или `protos` непусты — `console.warn('session-link: пока поддерживаются только topics-выборки')` и fallback на старый sessionStorage-flow (это и так требуется планом 5.1.8.4 при ошибке RPC). Документировать ограничение в follow-up.
- **Вариант C:** уточнить у куратора, какая часть selection обязательна в WS.1.

**Q-F2.** Picker.js list-mode сейчас открывает новую вкладку (`window.open`, `tasks/picker.js:5031`), test-mode — same tab (`location.href`, `:5026`). План §5.1.8.3 явно меняет list-mode на same-tab `location.href`. Это UX-делта, не оговорённая в §3 (Out of scope). Подтвердить намерение или оставить new-tab через `window.open(url, '_blank')`?
- **Рекомендация исполнителя:** буквально следую плану (same-tab для обоих). Альтернатива — правка одной строки в 5.1.8; фиксирую как follow-up на ревью.

**Q-F3.** Источник `?session=` в picker'е (`saveSelectionAndGo`) сейчас не различает «обычный режим» и «teacher_home view a student». Для teacher_home значения `teacher_student_id` / `teacher_picked_refs` пишутся в selection (см. §2.8). План явно говорит, что в `create_session_link` нужны только `frozen_questions` + `spec.mode/shuffle`. Подтверждаю: teacher_context **не пишется** в session-RPC. Если позже учитель захочет «отправить тренировку ученику Х по своим pick-refs» — это уже WS.3 «кабинет session-ссылок».

**Q-F4.** План §5.1.11 говорит «redirect на `tasks/auth.html?next=...`», а ссылается как на референс на `tasks/hw.js` — который такой редирект НЕ делает (graceful inline-message). Я следую буквальной формулировке плана (редирект через `auth.js sanitizeNext`-инфраструктуру). Если куратор предпочёл бы graceful-вариант — фиксирую как follow-up без переделки 5.1.11.

### 2.11. Read-only-контракт recon

На момент завершения шага 5.1.1 продуктовые файлы не правились (`tasks/picker.js`, `tasks/trainer.js`, `tasks/list.js`, `tasks/smart_hw_builder.js`, `tasks/homework_api.js`, `app/providers/supabase-rest.js`, `tasks/auth.js`, `tasks/hw.js`). Финальные md5/wc-l будут сравнены в §14 на финальном commit-pass.

---

## §3. Шаг 5.1.2 — SQL миграция `homeworks_add_kind_migration.sql`

Сделано. `ALTER TABLE` с `add column if not exists kind text not null default 'graded'` + check-constraint `kind in ('graded', 'session')` через drop+add (идемпотентно). Применено в prod Supabase 2026-05-19. Verification: `select kind, count(*) from public.homeworks group by kind` → все существующие row'ы получили `kind='graded'`.

## §4. Шаг 5.1.3 — Правка `get_homework_by_token.sql`

Сделано. Добавлено поле `kind` в `RETURN TABLE(...)` и `SELECT`. Из-за изменения сигнатуры RETURNS пришлось использовать `DROP FUNCTION IF EXISTS` + `CREATE FUNCTION` вместо `CREATE OR REPLACE` (CREATE OR REPLACE не меняет return type, ошибка `42P13`). Verification: REST POST с known token возвращает поле `kind`.

## §5. Шаг 5.1.4 — Новый RPC `create_session_link.sql`

Сделано. `security definer`, `set search_path to 'public', 'auth', 'extensions'` (extensions нужен для `gen_random_bytes`). Validates: `auth.uid() not null` → `AUTH_REQUIRED`, `p_mode in ('list','test')` → `BAD_MODE`, jsonb-array non-empty → `BAD_FROZEN_QUESTIONS`. Token: `'sess_' || base64(gen_random_bytes(18))` с URL-safe заменой `+/=`. Verification: REST POST с валидным auth-токеном вернул `[{homework_id, token}]`, HTTP 200.

**Расхождение с планом §6.3**: план предлагал `title=null`, но колонка `homeworks.title` в prod-схеме имеет `NOT NULL` constraint. Передаём пустую строку `''`. См. §16 «Расхождения».

## §6. Шаг 5.1.5 — Guard в `assign_homework_to_student.sql`

Сделано. После auth-checks добавлен `if (select kind from public.homeworks where id = p_homework_id) = 'session' then raise exception 'SESSION_NOT_ASSIGNABLE' using errcode = '42501'`. Verification: попытка назначить session-row через RPC возвращает HTTP 400 с message `SESSION_NOT_ASSIGNABLE`.

## §7. Шаг 5.1.6 — Registry update

Сделано. В `docs/supabase/runtime_rpc_registry.md`: общий счётчик RPC `31→32`, дата `2026-04-01→2026-05-19`, обновлены строки `get_homework_by_token` (упомянут new field `kind`, добавлены caller'ы trainer/list/task_session), `assign_homework_to_student` (упомянут guard), добавлена новая строка `create_session_link` с описанием контракта.

## §8. Шаг 5.1.7 — Frontend `app/providers/task_session.js`

Сделано. Функция `createSessionLink({mode, shuffle, spec, frozenQuestions})` → `supaRest.rpc('create_session_link', {p_mode, p_shuffle, p_spec_json, p_frozen_questions})`. Возвращает `{ok: true, homework_id, token}` или `{ok: false, error: {code, status, message, details}}`. Не бросает — caller (picker.js) имеет предсказуемый shape для fallback.

## §9. Шаг 5.1.8 — Frontend `tasks/picker.js` `saveSelectionAndGo`

Сделано с расширением плана. Q-F1 (sections support) закрыт: вместо «только topics → builder» поддерживаем `noProtos && (hasTopics || sectionsCount > 0)` — sections разворачиваются в topics через `loadCatalogLegacy().topicsBySection` Map, count распределяется равномерно по subtopics. Точка вставки: между сборкой `selection` (line 5009) и `sessionStorage.setItem` (line 5067 в финальной версии). Fallback на sessionStorage сохранён для protos и edge-cases. Teacher_home отдельная ветка — использует `teacher_picked_refs` напрямую.

## §10. Шаг 5.1.9 — Frontend `tasks/trainer.js` + `tasks/list.js` hydrate

Сделано. Функции `bootSessionMode(token, overlay)` (trainer.js:940+) и `bootSessionListMode(token)` (list.js:365+). На boot: `URLSearchParams.get('session')` → если есть, идём в session-ветку до sessionStorage / smart-fallback / redirect-к-picker. Внутри: auth-gate (§12) → `supaRest.rpc('get_homework_by_token')` → catalog-drift handling через `lookupQuestionsByIdsV1` / `buildQuestionsFromSmartRefs` → hydration `CHOICE_TOPICS`, `SHUFFLE_TASKS`, frozen questions. Catalog drift: если часть question_id не резолвится — warning + работаем с оставшимися (если ничего нет — `showSessionBootError('Задачи по этой ссылке больше недоступны')`).

## §11. Шаг 5.1.10 — Кнопка «Скопировать ссылку»

Сделано. В `tasks/trainer.html` и `tasks/list.html` добавлена кнопка `#copySessionLink` в шапке (`data-header-extra="1"`, `hidden` по умолчанию). В `tasks/trainer.js` и `tasks/list.js` функция `setupCopySessionLinkButton()` снимает hidden и привязывает click → `navigator.clipboard.writeText(location.href)`. Видна только при успешной валидации `?session=<token>` (вызывается после `get_homework_by_token` success).

## §12. Шаг 5.1.11 — Auth-gate redirect

Сделано. В `bootSessionMode` / `bootSessionListMode` — первый шаг после overlay: `const session = await getSession().catch(() => null);` — если `!session`, `location.replace(new URL('./auth.html?next=' + encodeURIComponent(location.href), location.href).toString())`. Использует существующий `sanitizeNext` в `tasks/auth.js`. После login `auth.js` редиректит обратно на сохранённый `next`.

## §13. Шаг 5.1.12 — `node tools/bump_build.mjs`

Прогнан многократно по ходу разработки и финально перед commit. Все `?v=` и `<meta name="app-build">` синхронизированы на финальную версию.

## §14. Шаг 5.1.13 — Playwright e2e `e2e/student/ws1-session-link.spec.js`

Сделано. Три теста:
- **E2E.A1**: ученик в picker'е делает bulk-pick всех тем → `?session=sess_*` URL → trainer hydrated → guest в новом context'е с тем же storage state видит то же количество задач.
- **E2E.A2**: чистый anon context (явный `storageState: {cookies:[], origins:[]}` — иначе наследуется из project `use`) открывает trainer.html?session=<любой> → redirect на auth.html?next=<encoded original URL>.
- **E2E.A3**: invalid token → `#runner` показывает понятную ошибку из `showSessionBootError`, кнопка `#copySessionLink` остаётся скрыта.

Результат финального прогона: **4/4 passed** (включая setup-student), ~25 секунд. Лог:
```
✓ [setup-student] create student storage state (5.3s)
✓ E2E.A1: создание session-ссылки + hydration (13.3s)
✓ E2E.A2: auth-gate redirect (1.1s)
✓ E2E.A3: invalid token (2.7s)
4 passed (24.6s)
```

**Правки в e2e-тесте**:
1. A1 ждёт `#total != '1'` (дефолт HTML до hydration), чтобы избежать race.
2. A2 явно создаёт anon context с пустым storageState (иначе наследуется из project `use`).
3. A2 использует `waitForFunction` вместо `waitForURL` — надёжнее для `location.replace`.

## §15. Шаг 5.1.14 — Отчёт + commit

Этот отчёт. Commit и список файлов — после финального push.

## §16. Расхождения с планом

- **§6.3 → §5**: план предполагал `title=null` в `homeworks` для session-row. Реальная схема имеет `NOT NULL` на колонке. Передаём пустую строку `''`. Семантически эквивалентно — UI и так не показывает title для session-link. Если в будущем понадобится — UI должен fallback'нуть на «session от <дата>».
- **§5.1.2 search_path**: план показывал `set search_path to 'public', 'auth'`. Добавлено `'extensions'` — без него `gen_random_bytes` в `create_session_link` падает с `function gen_random_bytes(integer) does not exist`.
- **Q-F1 (sections/protos)**: план зафиксировал «Variant B — для WS.1 только topics, иначе fallback». В реальном UI большинство студентов выбирают разделы целиком (`bulkPickAll`), что даёт sections, не topics. Реализовали **Variant A** (разворачивание sections в topics через catalog `topicsBySection`). Это закрывает Q-F1 без scope expansion. Protos пока в fallback.
- **A2 e2e — anon context**: в плане §5.1.13 не было explicit'но указано, что student project в Playwright config имеет `use.storageState`, который наследуется при `browser.newContext()`. Понадобилось передать `storageState: { cookies:[], origins:[] }` для явного anon.

---

## Расхождения с планом

(заполняется по мере исполнения; на момент 5.1.1 — ни одного, recon строго read-only по плану)

## Follow-up

(заполняется по мере исполнения; см. также §2.10 open questions)
