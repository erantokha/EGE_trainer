# WTC5 · Фикс «Ошибка загрузки каталога» на unique.html (session-gate перед каталогом) — отчёт исполнителя

Дата: 2026-05-29
Исполнитель: Claude Code (роль исполнителя)
План: `WTC5_catalog_session_gate_PLAN.md`
Тип: изменение boot-логики страничных модулей (FE) — путь **А** (FE-гейт). Auth-ядро НЕ трогали.
Ветка: `main`. Новый build-id: **`2026-05-29-8`**.

---

## 0. Краткий итог (TL;DR)

- Корень `AUTH_REQUIRED`/«Ошибка загрузки каталога»: `unique.js` (и `analog.js`) на boot сразу зовут
  `loadCatalogIndexLike()` (RPC `catalog_index_like_v1`, grant→`authenticated`) **не подняв сессию** → на холодном
  старте токен не гидратирован → `requireSession` бросает `AUTH_REQUIRED`.
- **Фикс (путь А):** перед чтением каталога — `ensureSessionReady()` (`finalizeOAuthRedirect()` + `await
  getSession({timeoutMs:2200, skewSec:30})`, паттерн рабочих страниц); genuine-anon → redirect на
  `auth.html?next=<url>` (WHF1/WS.1), а НЕ каталог-ошибка; в `unique.js` — one-shot retry на `AUTH_REQUIRED`.
- Вынесено в крошечный общий хелпер **`app/ui/ensure_session.js`** (2 потребителя).
- **Аудит §5.1:** пофикшены 2 page-entry (`unique.js`, `analog.js`); 4 кандидата — **модули** у гейтящих хостов
  (пропущены с обоснованием).
- **e2e:** A1 (тёплый teacher → каталог рендерится, нет ошибки) **GREEN**; A2 (genuine-anon → redirect на
  `auth.html?next=`) **GREEN** (детерминированно тестирует новую anon-ветку).
- **charnet + governance-trio — GREEN.** auth-ядро (`supabase.js`/`supabase-rest.js`) и каталог-провайдер
  (`catalog.js`) — НЕ изменены (только `?v=`).
- **Честно про cold-race:** happy-path с тёплой storageState — регресс-гарантия (гейт не ломает рабочий путь), НЕ
  доказательство устранения гонки. Гонка устранена **by construction** (перенос проверенного паттерна) + **ручной
  cold-nav чек оператора** (§5).

---

## 1. Аудит кандидатов (§5.1)

| Файл | own DOMContentLoaded | loadCatalog на boot | session-gate был | подключён в HTML | Вердикт |
|---|---|---|---|---|---|
| `unique.js` | да | да (`loadCatalogIndexLike` @172) | **нет** | `unique.html` (`<script src>`) | **page-entry → ФИКС** |
| `analog.js` | да (`main`) | да (`loadCatalogIndexLike` @353 в `startAnalogSolve`) | **нет** | `analog.html` (`<script src>`) | **page-entry → ФИКС** |
| `smart_hw.js` | нет | да (2×) | — | нет (export-модуль) | **модуль** (импортит `student.js`, который гейтит `getSession`) → пропуск |
| `smart_hw_builder.js` | нет | нет | — | нет | **модуль** (нет catalog-чтения) → пропуск |
| `question_preview.js` | нет | нет | — | нет | **модуль** (нет catalog-чтения на boot) → пропуск |
| `stats_view.js` | нет | да (1×, `loadCatalogLegacy`) | — | нет (export-модуль) | **модуль**; хосты `stats.js` (гейтит `await requireSession` @169 ДО loadCatalog @181) и `student.js` (`getSession`) — **уже гейтят** → пропуск |

**Не-кандидат, проверен попутно:** `stats.js` (host `stats_view`) — это page-entry, но **уже гейтит** через
`requireSession` перед каталогом → бага нет, scope НЕ расширялся (триггер 10a/3 не сработал; мой первичный grep считал
`getSession`, а stats.js использует `requireSession`).

## 2. Что добавлено (`file:line`)

### NEW `app/ui/ensure_session.js`
`ensureSessionReady({timeoutMs=2200, skewSec=30, redirectOnAnon=true})` → `try{finalizeOAuthRedirect()}catch{}` +
`await getSession(...)`; при `null` и `redirectOnAnon` → `location.replace('./auth.html?next='+encodeURIComponent(location.href))`;
возвращает `session|null`. Импортирует ТОЛЬКО публичный API `app/providers/supabase.js` (auth-ядро не меняется).

### MODIFY `tasks/unique.js`
- import `ensureSessionReady` (стр.16).
- `init()` перед `loadCatalog()` (стр.~76): `const session = await ensureSessionReady(); if (!session) return;`
  (genuine-anon → redirect уже сделан).
- one-shot retry в `catch`: при `AUTH_REQUIRED` → `ensureSessionReady({redirectOnAnon:false})` + повтор `loadCatalog()`;
  иначе/повтор-фейл → прежняя «Ошибка загрузки каталога».

### MODIFY `tasks/analog.js`
- import `ensureSessionReady` (стр.12).
- `main()` перед `await startAnalogSolve()` (грузит каталог + `insertAttempt`): `const session = await
  ensureSessionReady(); if (!session) return;`. Пост-boot `startNextAnalog()` (кнопка «следующий аналог») гейт не
  требует — к моменту клика сессия уже тёплая (boot прошёл).

## 3. Проверка

### 3.1 e2e `e2e/teacher/wtc5-unique-catalog.spec.js`
- **A1 (happy-path, тёплый teacher):** `/tasks/unique.html?section=1` → заголовок «1. Планиметрия (уникальные
  прототипы ФИПИ)», `catalog_index_like_v1 → 200`, **нет «Ошибка загрузки каталога»**, на unique-странице (не
  auth-redirect). **GREEN** (2.9с). *(поллинг до success-заголовка `toHaveText(/^1\..*уникальные/, 30s)` — устойчив
  к gate+retry-задержке.)*
- **A2 (genuine-anon, детерминирован):** anon-контекст → `/tasks/unique.html?section=1` →
  `location.replace` на `auth.html?next=<encoded unique.html?section=1>`. **GREEN** (1.2с). Прямо проверяет новую
  anon-ветку гейта (без гонки).

### 3.2 Guard
- **charnet (student+teacher) — GREEN** (рендер статистики не задет; менялись только unique/analog + новый хелпер).
- **governance-trio — GREEN** (`check_runtime_rpc_registry` / `check_runtime_catalog_reads` / `check_no_eval`).
  `check_runtime_catalog_reads` зелёный → каталог по-прежнему читается через canonical RPC (гейт не нарушил дисциплину).

### 3.3 Structural
- `unique.js`: `await ensureSessionReady` (стр.77) **ДО** `catalog = await loadCatalog()` (стр.84). ✓
- `analog.js`: `await ensureSessionReady` (стр.1085) **ДО** `await startAnalogSolve()` (стр.1087, грузит каталог). ✓
- debug-прогон (тёплый teacher, 6с): unique.html отрисовал каталог, `catalog_index_like_v1 → 200`, 0 console-ошибок.

### 3.4 ⚠️ Честно про cold-race (DoD #6)
Гонка «каталог раньше сессии» **плохо воспроизводится в e2e**: в storageState сессия тёплая → старый код часто
проходит тоже. Поэтому корректность фикса гонки — **by construction** (гейт = проверенный паттерн рабочих страниц
picker.js/trainer.js/hw.js) + happy-path-регресс + **A2 anon-ветка**. Happy-path GREEN **не** выдаётся за
доказательство устранения гонки.
**Ручной cold-nav чек оператору:** на проде открыть `unique.html?section=<real>` максимально «холодным» переходом
(новая вкладка/жёсткий reload сразу после логина, медленная сеть РФ/VPS), убедиться, что каталог грузится без
«Ошибка загрузки каталога». Захватить console при необходимости.

## 4. Scope / git diff

- **Логика — только в** `tasks/unique.js` (+25/−7) и `tasks/analog.js` (+13/−6) + новый `app/ui/ensure_session.js` +
  новый e2e-spec.
- Вне них — **только build-id** (`?v=`/`<meta app-build>`/`version.json`). Проверено diff-фильтром.
- **`app/providers/supabase.js`, `app/providers/supabase-rest.js`, `app/providers/catalog.js` — НЕ изменены**
  (только `?v=`). Auth-ядро и каталог-провайдер не тронуты (это A2/путь B, вне scope).
- `bump_build` → **`2026-05-29-8`**.

## 5. Список файлов

| Файл | Тип | Что |
|---|---|---|
| `app/ui/ensure_session.js` | **NEW** | хелпер `ensureSessionReady()` (finalizeOAuthRedirect + getSession + anon-redirect) |
| `tasks/unique.js` | **MODIFY** | session-gate + anon-redirect + one-shot retry перед `loadCatalog` |
| `tasks/analog.js` | **MODIFY** | session-gate + anon-redirect перед `startAnalogSolve` (catalog + insertAttempt) |
| `e2e/teacher/wtc5-unique-catalog.spec.js` | **NEW** | A1 happy-path + A2 anon-redirect |
| `reports/wtc5_catalog_session_gate_report.md` | **NEW** | этот отчёт |
| build-id `…-7 → …-8` во всех импортах/мета | **MECHANICAL** | bump_build |

## 6. Что осталось / follow-up

- **A2 (централизованный future-proof):** ожидание гидратации сессии в auth-ядре (`supabase-rest`/`supabase.js`) —
  убрало бы гонку для ВСЕХ страниц разом, но это red-zone (blast-radius на все RPC). Не делали (план §3). Кандидат на
  будущее, если «голых» страниц станет больше.
- **Путь B (grant `anon` каталогу):** только если решим, что каталог публичный (контракт-изменение) — вне scope.
- **Широкий T0.1** (custom storage adapter и т.п.) — отдельный трек.
- **Деплой:** обычный push FE-билда `2026-05-29-8` (бэкенд/контракт не менялись — деплой безопасный, без миграций).
  Ручной cold-nav чек оператора (§3.4) — финальное подтверждение фикса гонки на проде.
