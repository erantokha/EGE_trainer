# W2 · Шаг 1 — Вынос `tasks/picker_common.js` (отчёт исполнителя)

Дата: 2026-05-29
Исполнитель: Claude Code (роль исполнителя)
План: `W2_step1_common_PLAN.md`
Тип: правка продуктового кода (`tasks/picker.js`) — red-zone-adjacent (модуль обеих home-страниц)
Статус: **GREEN** — механический lift 25 чистых утилит; charnet-гейт зелёный (golden не менялись); conservation 169 = 144 + 25; новых reds нет.
Новый build-id: **`2026-05-29-1`**

---

## 0. Краткий итог (TL;DR)

- Вынесены **25 чистых stateless-утилит** из `tasks/picker.js` в новый `tasks/picker_common.js` (с `export`),
  определения заменены на импорт. **Ни одного исключения** — все кандидаты Tier A+B прошли инвариант чистоты.
- `picker_common.js` импортирует **только** `toAbsUrl` из `app/*`; **ничего** из `picker.js`/`picker_added_tasks.js`.
  Граф ацикличен: `picker_common.js` — лист, его никто не импортирует, кроме `picker.js`.
- **Регресс-гейт (charnet Шага 0): обе специи зелёные, golden НЕ изменены** → data→DOM-контракт статистики идентичен.
- Полный `npm run e2e`: **28 passed, 2 failed** — те же два known pre-existing reds (`teacher/home` smoke,
  `w2-6-fix` horizontal full-width flake); **новых reds нет**. Governance-trio зелёный.
- Browser-smoke обеих home: аккордеон (12 секций / 84 подтемы) + статистика рендерятся, **прото-модалка
  открывается и рендерит предпросмотр (stemNodes=4 на обеих страницах)** — Tier B (buildStemPreview/interpolate/
  asset/escapeHtml/typesetMathIfNeeded/ensureMathJaxLoaded) работает. **Ноль refactor-relevant ошибок в консоли.**
- **Conservation:** picker.js до = 169 функций; после = 144; picker_common.js = 25; 144 + 25 = 169, без дублей,
  без осиротевших ссылок.
- `bump_build.mjs` прогнан; **логика только в 2 файлах**, все прочие изменённые файлы — только build-id/`?v=`.

---

## 1. Финальный список вынесенных функций (25)

Все перенесены **verbatim** (тела не изменены, добавлен только `export`). Группировка в `picker_common.js`:

**Tier A — generic pure utils (21):**
`safeJsonParse`, `fmtName`, `emailLocalPart`, `esc`, `escapeHtml`, `interpolate`, `compareId`,
`inferTopicIdFromQuestionId`, `anyPositive`, `getAppBuildTag`, `readCache`, `writeCache`, `pct`,
`badgeClassByPct`, `fmtPct`, `fmtCnt`, `fmtDateTimeRu`, `fmtDateShortRu`, `badgeClassByLastAttemptAt`,
`supabaseRefFromUrl`, `sessionTtlSec`.

**Tier B — preview/MathJax (4) + приватный `let __mjLoading`:**
`asset` (зависит от `toAbsUrl` ← app/*), `buildStemPreview` (зависит от `interpolate`/`asset`/`escapeHtml` — все
в common), `typesetMathIfNeeded` (зависит от `ensureMathJaxLoaded`), `ensureMathJaxLoaded` (несёт приватный
module-level кэш `__mjLoading`, перенесён вместе).

### 1.1 Исключённые кандидаты

**Нет.** Все 25 кандидатов из плана §5.1 (Tier A + Tier B) прошли жёсткий инвариант чистоты (§5.1 плана) —
проверено чтением тела каждой функции + сверкой со `state_flow.csv`:
- ни одна не читает/мутирует изменяемое module-state `picker.js` (`CHOICE_*`, `SECTIONS`, `CATALOG`, `LAST_DASH`,
  `TEACHER_VIEW_STUDENT_ID`, `PICK_MODE`, `$`/`$$`);
- DOM-чтения, что встречаются (`getAppBuildTag` → `<meta app-build>`; `ensureMathJaxLoaded`/`typesetMathIfNeeded`
  → `window.MathJax`/`document`), это глобалы платформы, не picker-state, и доступны из любого модуля → чисты;
- `readCache`/`writeCache` принимают `storage` аргументом (не завязаны на picker-state);
- `asset` зависит только от `toAbsUrl` (app/*), `buildStemPreview` — только от перенесённых `interpolate`/`asset`/
  `escapeHtml`.

`BADGE_COLOR_CLASSES` (const) **оставлен в picker.js** — он не входил в список выноса и используется
stats-писателями бейджей (`setHomeBadge`/`setHomeCoverageBadge`), которые относятся к Шагу 2.

## 2. Инвариант ацикличности (DoD §8 п.1)

```
$ grep "^import" tasks/picker_common.js
import { toAbsUrl } from '../app/core/url_path.js?v=2026-05-29-1';      # единственный импорт — из app/*

$ grep -rn "from './picker(_common)?.js" --include=*.js tasks/ | grep -v picker_added_tasks
tasks/picker.js:30: } from './picker_common.js?v=2026-05-29-1';        # ТОЛЬКО picker.js импортирует common
```

- `picker_common.js` импортирует **только** `toAbsUrl` из `app/*`; **ничего** из `picker.js`/`picker_added_tasks.js`.
- `picker_common.js` — **лист**: его импортирует исключительно `picker.js`. Никакого цикла.
- `picker_added_tasks.js` **не тронут** (он не использует ни одного вынесенного кандидата — подтверждено grep'ом,
  изменена только его `?v=`-строка через bump_build).

## 3. Conservation-учёт (DoD §8 п.7)

```
picker.js BEFORE (git HEAD): 169 top-level function declarations
picker.js AFTER:             144
picker_common.js (export):    25
                  144 + 25  = 169  ✓ (= BEFORE, без дублей)
```

- Точно **25 определений** удалено из `picker.js` и **25 export-функций** добавлено в `picker_common.js`.
- Дублей нет: в `picker.js` после выноса — 0 определений перенесённых имён (проверено grep'ом `^function NAME`).
- Осиротевших ссылок нет: перенесённые функции были **module-private** в `picker.js` (никогда не
  экспортировались) → ни один внешний файл не мог на них ссылаться. Подтверждено: **никто не импортирует
  `picker.js`/`picker_common.js`** (кроме самого `picker.js` → `picker_common.js`).
- **Наблюдение (вне scope):** одноимённые функции (`buildStemPreview`, `typesetMathIfNeeded`,
  `ensureMathJaxLoaded`, `inferTopicIdFromQuestionId`) существуют как **независимые локальные копии** в других
  page-модулях (`question_preview.js`, `hw.js`, `hw_create.js`, `list.js`). Это не ссылки на picker.js, а
  дублирование кода в no-build-проекте — потенциальная цель будущего дедупа, **в этот шаг не входит** (план §3).

## 4. Регресс-гейт charnet (DoD §8 п.3 — главное)

```
npm run e2e -- e2e/student/picker-stats-charnet.spec.js e2e/teacher/picker-stats-charnet.spec.js
  ✓ [student] charnet: home_student stats DOM fingerprint
  ✓ [teacher] charnet: home_teacher stats DOM fingerprint (student selected)   (выбран student=891cd1b5… «Инеса Nahapetyan»)
  2 passed
```

- Обе специи **зелёные против неизменных golden** (нет «A snapshot doesn't exist / writing actual» — golden НЕ
  переписывались). Golden Шага 0 остались untracked и идентичны.
- Вывод: чистый вынос **не изменил data→DOM-контракт** ни одного из двух рендереров статистики
  (`applyDashboardHomeStats` / `applyTeacherPickingHomeStats`). Stop-ask §6.3 п.10a НЕ потребовался.

## 5. Полная проверка

### 5.1 Governance-trio — 3/3 зелёные
```
node tools/check_runtime_rpc_registry.mjs   → runtime-rpc registry ok
node tools/check_runtime_catalog_reads.mjs  → runtime catalog read checks ok
node tools/check_no_eval.mjs                → no eval/new Function ok
```

### 5.2 Полный `npm run e2e` — 28 passed, 2 failed (без новых reds)
```
Running 30 tests using 6 workers
  ✓ [student] picker-stats-charnet            ✓ [teacher] picker-stats-charnet
  ✓ home / visual-walkthrough / w2-4-print-layout×3 / w2-6-acceptance×4 / w2-6-fix×5 / ws1×3 / whf1×2 / whf2-fix-1×3
  ✘ [teacher] home.spec.js:5  teacher picking smoke              ← known pre-existing (находка Шага 0)
  ✘ [student] w2-6-fix.spec.js:429  horizontal full-width        ← known pre-existing flake (PROJECT_STATUS §7.1)
  28 passed, 2 failed
```
Оба падения — **те же два known pre-existing reds** Шага 0, не связаны с этим изменением. **Новых reds нет**
(§6.3 п.10c не сработал). Примечательно: `ws1` (bulk-pick `#bulkPickAll` → `#start` → trainer) и `home` (student)
зелёные — start-флоу и базовый рендер не задеты.

### 5.3 Browser-smoke обеих home (DoD §8 п.5)

Throwaway-скрипт (вне репо, не коммитится), storageState из `.auth/*.json`, локальный `python3 -m http.server`:

| Страница | accordion | proto-modal | refactor-relevant ошибки | прочие ошибки консоли |
|---|---|---|---|---|
| `home_student.html` | 12 секций / 84 подтемы | open ✓, **stemNodes=4** | **0** | 1 — Sentry CSP-блок (pre-existing) |
| `home_teacher.html` (выбран ученик) | 12 секций / 84 подтемы | open ✓, **stemNodes=4**, listHtmlLen=2185 | **0** | транзиентный `TypeError: Failed to fetch` на catalog-RPC (сетевая флака live-backend; страница восстанавливается, прото-модалка рендерит предпросмотр) |

- **Прото-модалка — главный непокрытый passing-спеками путь** — исполняет весь Tier B-кластер
  (`buildStemPreview`→`interpolate`/`asset`/`escapeHtml`; `typesetMathIfNeeded`→`ensureMathJaxLoaded`). На обеих
  страницах открывается и рендерит `.tp-stem`-предпросмотр → Tier B работает.
- `esc` упражняется рендером аккордеона (`esc(${id}. ${title})` в заголовках узлов — рендер зелёный).
- Кэш/build-tag (`getAppBuildTag`/`readCache`/`writeCache`), `safeJsonParse`/`fmtName`/`emailLocalPart`
  (teacher-select label «Инеса Nahapetyan»), `pct`/`badgeClassByPct`/`fmtPct`/`fmtCnt`/`fmtDateTimeRu` (бейджи +
  дата «11.01.2026, 16:34» в teacher-тултипе) — упражняются charnet-прогонами.
- **Ноль ошибок вида `is not defined`/`is not a function`/`ReferenceError`** на обеих страницах в нескольких
  прогонах → ни одна вынесенная функция не «потеряла» вызов. `Failed to fetch` и Sentry CSP — environmental,
  не регрессии (та же live-backend/CSP-флакость наблюдалась независимо от этого изменения).

## 6. `bump_build` + scope-чистота (DoD §8 п.6)

- `node tools/bump_build.mjs` прогнан → новый build-id **`2026-05-29-1`** (был `2026-05-26-2`).
- `git diff --stat`: 71 файл. **Логические правки — только в двух:**
  - `tasks/picker.js` (−25 определений, +1 import-блок, +breadcrumb-комментарии);
  - `tasks/picker_common.js` (новый, untracked).
- **Все прочие 69 изменённых файлов содержат ТОЛЬКО распространение build-id** тем же sanctioned `bump_build`:
  `?v=`-строки импортов, `<meta name="app-build">`, `version.json`, `app/config.js:version`, комментарий в
  `app/build.js`. Проверено diff-фильтром: ни одной не-build-id правки вне `picker.js`.

## 7. Затронутые / созданные файлы

| Файл | Тип | Что |
|---|---|---|
| `tasks/picker_common.js` | **NEW** | 25 export-функций (Tier A+B) + приватный `__mjLoading`; импорт только `toAbsUrl` из app/* |
| `tasks/picker.js` | **MODIFY (логика)** | удалены 25 определений; добавлен `import {…} from './picker_common.js?v=2026-05-29-1'`; breadcrumb-комментарии на местах выноса |
| 69 файлов (HTML/JS/json) | **MECHANICAL** | только build-id `2026-05-26-2` → `2026-05-29-1` (bump_build): `?v=`, `<meta app-build>`, `version.json`, `config.version`, `build.js`-комментарий |
| `reports/w2_step1_common_report.md` | **NEW** | этот отчёт |

## 8. Отклонения от плана

Нет. Набор выноса = ровно план §5.1 (Tier A 21 + Tier B 4), исключений нет. `data-auth-ready` здесь не
используется (charnet-специи Шага 0 уже на корректном readiness-паттерне). Golden не трогались.

## 9. Зачем именно так / готовность к Шагу 2

Чистый вынос 25 generic-утилит — нулевое изменение логики при готовом регресс-гейте (charnet). `picker.js`
ужался (169 → 144 функции, −260 строк diff). Появилась чистая роле-агностичная база `picker_common.js`, на
которую обопрётся Шаг 2 (вынос статистики/`picker_stats.js`) и будущие экраны. Изменяемое состояние и движок не
тронуты → R1/R2 полного `W2_2_PLAN.md` не задеты; развилка стратегий по-прежнему открыта.
