# W1.0b Report — Per-page footprint и design-tokens recon под Вариант E (read-only)

## 1. Резюме

Вариант E (`tokens.css + base.css + print.css + pages/<page>.css`) подтверждён данными и
**даже проще, чем ожидалось** в части public-страниц. Ключевые находки:

- **342 селектора** в `trainer.css` (305 классов, 26 id, 11 data-attr). Распределение по 18 prod-страницам: **96 → `base.css`** (5+ страниц, из них **40 универсальных** — на всех 18), **110 → shared (2–4)**, **108 → одна страница** (`pages/<page>.css`), **28 dead-кандидатов** (0 prod-страниц).
- **Auth-группа почти пустая на page-уровне**: 4 auth-страницы (`auth/callback/reset/google_complete`) имеют **0 эксклюзивных селекторов** — они состоят только из `base.css` + общих (header/page-head/container/panel/form). `pages/auth.css` фактически не нужен. Это сильнее, чем «узкий срез» из W1.0 §6.
- **Cascade-риск split'а минимальный**: из 120 дублированных селекторов только **19 — same-context-конфликты**, и **17 из них — home-student accordion** (`body[data-home-variant="student"]…`), то есть single-page → при per-page split мигрируют вместе в `pages/home-student.css`, порядок сохраняется. **Cross-cutting реально опасных = 2** (`.theme-toggle` — dead toggle; один print-селектор). Это **далеко ниже** stop-ask порога (>20).
- **Print чистый**: 118 `@media print`-селекторов (62 global + 56 `body.print-layout-active`). `print-dialog` — это **14 screen-селекторов** (рендер диалога на экране), они идут в page/base, не в `print.css`. OQ4 решается: `print-dialog` НЕ выносим, и в print.css его нет.
- **Самая большая сложность W1.1'** — `home-student` accordion (17 order-зависимых правил в одном файле) и `data-fig-*` фигурный стек (5+ страниц, dataset-driven). Самое лёгкое — auth/landing/myhw (тонкие, почти только base).

## 2. Метаданные

- Baseline: ветка `main` @ `839ff6ff`, build `2026-05-25-2`, `tasks/trainer.css` = 3930 строк. Governance 4/4 green до и после (§11).
- Входные артефакты W1.0 (переиспользованы): `reports/w1_0_trainer_css_recon_report.md` §2 (22 импортёра), §3 (layer-map L0..L5), §5 (inventory + data-attr источники), §6 (page×feature), §7 (литералы/breakpoints/`!important`), §8 (JS/CSS-хуки). `W1_REPLAN.md` (Вариант E, OQ A/B).
- Методика (полностью в `reports/w1_0b_artifacts/grep_session.log`): селекторы извлекаются только из selector-контекста CSS; footprint — по reachable-source каждой страницы (HTML + транзитивный JS-import-граф, включая concat/`withV`/`buildWithV` и `?v=`-импорты); матч с CSS-identifier-границами, data-attr — через dataset camelCase. Conservative (over-include) per план §5.9, кроме строгой hyphen-границы (`.tp-topic` ≠ `tp-topic-btn`). Все скрипты-артефакты воспроизводимы.

### 2.1 Отклонение от буквы плана (зафиксировано)

Плановый список колонок §5.2.2 (`picker, index, terms, privacy`, без smoke/fixtures) — **аспирационный и расходится с реальностью**. Ground truth (= W1.0 §2, без изменений): **22 импортёра** `trainer.css` = 18 prod + 1 smoke + 3 print-fixture. `tasks/picker.html` не существует (picker.js грузится внутри home-страниц); `index.html`/`terms.html`/`privacy.html`/корневой `student.html` **не импортируют** `trainer.css` (по плановому stop-ask 10c — это flag в отчёте, не stop-ask). Матрица построена по **18 реальным prod-импортёрам**; smoke + 3 fixture сохранены как flagged-колонки.

## 3. Footprint-карта (short-form; полная — `footprint_matrix.csv`)

Per-page **всего селекторов** (`page_selector_counts.txt`, sanity §5.2.3: каждая ≥5 — пройдено):

| Страница | Σ селекторов | single-page (эксклюзив) |
|---|---:|---:|
| home_student | 146 | 19 |
| trainer | 144 | 14 |
| hw | 126 | 2 |
| hw_create | 124 | **27** |
| home_teacher | 122 | (см. примечание) |
| unique | 109 | 6 |
| list | 96 | 1 |
| analog | 86 | 0 |
| student (tasks/) | 84 | 21 |
| my_students | 67 | 12 |
| my_homeworks | 60 | 4 |
| stats | 59 | 0 |
| my_homeworks_archive | 53 | 1 |
| profile | 50 | 1 |
| auth / auth_callback / auth_reset / google_complete | 50 / 51 / 51 / 50 | **0** |

Bucket-классификация (`selector_classification.csv`):

| Bucket | Кол-во | Целевой файл | Примеры |
|---|---:|---|---|
| **base** (5+ страниц) | 96 (40 — все 18) | `base.css` | `.container`, `.panel`, `.page-head`, `.muted`, `.hidden`, `.btn`, header/user-menu, `.task-card` |
| **shared** (2–4 страницы) | 110 | `base.css` если тематически разрозненны, иначе `pages/<group>.css` | фигурный стек (`.task-fig*`, `data-fig-*`), `.q-card`, `.vs-modal*`, `.print-dialog*` |
| **page** (1 страница) | 108 | `pages/<page>.css` | hw_create: `.added-head`, `.tp-sec`, `.editable-*`; student: `.is-active`, `.btn-danger`; trainer: `.smart-panel` |
| **dead** (0 prod) | 28 | — (hygiene, НЕ удаляем здесь) | см. §6 |

> Примечание home_teacher: его «эксклюзив» в основном `body[data-home-variant="student"]`-vs-`teacher` ветки; см. §5 — большая часть home-аккордеона делится между двумя home-страницами как контекст-gated. spot-check (§11) подтвердил корректность атрибуции single-page и base.

## 4. Design-tokens (итог; полный `tokens_candidates.csv`)

Naming-конвенция `--<group>-<role>` (стандартные CSS custom properties в `:root`, OQ A).

### Confirmed (freq ≥ 3 → token)

| Группа | Значения (freq) | Предлагаемые tokens |
|---|---|---|
| **font-size** | 12px(23), 13px(15), 14px(9), 11px(5), 18px(4), 20px(3), 16px(3), 15px(3), 10px(3) | `--fs-2xs:11px --fs-xs:12px --fs-sm:13px --fs-md:14px --fs-lg:16px --fs-xl:18px --fs-2xl:20px` (15px/10px — probable, склейка решается в W1.1') |
| **spacing (px)** | 10px(94), 6px(66), 8px(57), 12px(52), 4px(33), 2px(13) | `--space-1:2 --space-2:4 --space-3:6 --space-4:8 --space-5:10 --space-6:12` (НЕ чистый 8pt grid — проект реально на 2/4/6/8/10/12) |
| **border-radius** | 10px(25), 12px(20), 999px(14), 14px(3), 16px(3) | `--radius-sm:10px --radius-md:12px --radius-lg:16px --radius-pill:999px` (14px → probable, склеить с 12/16?) |
| **hex-color** | #fff/#ffffff(21), #000(6), #2563eb(4), #3b82f6(4), #111827(3), #e2e8f0(3) | `#2563eb` уже = `--accent` (W1.0 OQ7: 1 литерал-дубликат на L3:3049). `--accent-strong:#1d4ed8`, neutrals `#111827/#e5e7eb/#e2e8f0` → `--text/--border*`. #fff/#000 в print/контраст — **оставить inline** (legit per W1.0 §7.3) |
| **rgba surface-tint** | rgba(148,163,184,.10/.06/.12) (11/7/7), focus rgba(59,130,246,.35/.6) | `--tint-1/-2/-3` (slate overlay), `--focus-ring` (синий) |
| **duration** | 120ms(8), .2s(4), .15s(4) | `--dur-fast:120ms --dur-base:.2s` (нормализовать .15s↔.12s — probable) |

### Probable (freq 2 / близкие значения) → решение в W1.1'

z-index (полностью бессистемный): `2600, 2500, 3200, 9999, 9000, 1000, 999` — каждый ~1 раз. **Требует z-scale** (`--z-base/-dropdown/-modal/-overlay/-toast`), но маппинг текущих значений на шкалу — отдельное решение W1.1' (riск: смена z-порядка). box-shadow: `var(--shadow)`(4) уже tokenized; focus-rings (3/2) → `--focus-ring`.

### One-off (freq 1) — остаются inline в `pages/<page>.css`. Не tokens.

### Breakpoints (НЕ как `:root` var — в `@media`, OQ9)

Текущие: `640px(4), 520px(3), 1024px(3), 860px(3), 720px(2)` + singletons `900/600/1400/1150/560/1025`. **Фрагментировано** (подтверждает W1.0 §7.2). Предлагаемая дискретная шкала для будущей унификации: **`520 / 720 / 1024 / 1400`**. Маппинг: 560/600/640→720-зона (или 640 как отдельный), 860/900→1024-зона, 1150→1400. **Сам перенос — отдельная hygiene-волна, НЕ W1.1'** (меняет responsive-поведение).

## 5. Cascade-conflict-map (итог; полный `cascade_conflicts.txt`)

714 distinct селекторов (с учётом контекстов), **120 дублированных**. Классификация дубликатов:

| Класс | Кол-во | Стратегия |
|---|---:|---|
| **⚠ same-context-конфликт** (один селектор + один media-контекст + общее свойство) | **19** | `@layer` или specificity bump |
| из них home-student-scoped (`body[data-home-variant="student"]…`) | 17 | **intra-page-safe** — всё в `pages/home-student.css`, порядок сохраняется автоматически |
| из них cross-cutting (реальный риск) | **2** | `.theme-toggle` (361/415/3570P — dead toggle, §6); `body.print-layout-active .ws-item .ws-ans-wrap` (3741/3839, оба в print → `print.css`, safe) |
| **responsive-benign** (один селектор, разные `@media`) | 46 | держать все breakpoints селектора вместе в его файле — порядок не важен между контекстами |
| **screen+print** (один селектор, screen + `@media print`) | 19 | split-safe: screen→page/base, print→print.css, `@media print` изолирует |
| **disjoint** (нет общего свойства) | 36 | merge |

**Вывод**: реальная cascade-опасность для per-page split ≈ **2 правила**, оба тривиальны. Главный приём W1.1': при выносе селектора в `pages/<page>.css` переносить **все** его правила (base + все breakpoints) вместе, в исходном порядке. Для надёжности W1.1' использует CSS `@layer` (`@layer tokens, base, page, print`) — это снимает зависимость от порядка `<link>` для cross-file случаев без `!important`-эскалации.

## 6. Print cross-page deps (§5.6; `print_classification.txt`)

`@media print` scope = строки **3504..3930** (L4+L5 из W1.0 §3). 118 селекторов:

- **62 global** (без `body.print-layout-active`): `html`, `body`, `@page`, chrome-hide наборы, MathJax SVG fix, `a`. → секция «global» в `print.css`.
- **56 state-gated** (`body.print-layout-active …`): cards grid, fig-cases, answer-layer, with-answers, custom-title. → секция «state» в `print.css`.

**OQ4 (print-dialog) решён**: `print-dialog*` — это **14 SCREEN-селекторов** (рендер диалога на экране, НЕ внутри `@media print`). Они идут в page/base-файл (используются 5 prod-страницами: trainer/list/unique/hw/hw_create + 2 fixture). **Рекомендация: НЕ выделять `print-dialog.css`** — он не print-контента, объём мал (14 селекторов). В `print.css` его нет вовсе.

**Print dead-code кандидаты** (фиксируем, НЕ удаляем): `.ws-ans-text` (только в `tests/print-features.js`, test-only). `.theme-toggle` print-правило (3570) — для dead toggle.

## 7. Governance proposal — `check_trainer_css_layers_v2.mjs` (под Вариант E)

Описание для реализации в W1.1' (код здесь не пишется):

**Новые инварианты:**

1. **`tokens.css`**: только `:root{…}` (+ `[data-theme=…]`) с `--`-объявлениями. Запрещены селекторы кроме `:root`/`[data-theme]`, запрещён `!important`. Чек: каждая значимая строка — `:root{`/`[data-theme`/`}`/`--name: value;`/коммент.
2. **`base.css`**: только селекторы с `prod_used_count ≥ 5` (allowed-set автогенерируется из `footprint_matrix.csv`). Linter падает, если в base есть селектор с count<5 или `@media print`. `!important` запрещён.
3. **`print.css`**: только `@media print{…}` + правила с префиксом `body.print-layout-active`. `!important` разрешён (legacy chrome-hide).
4. **`pages/<page>.css`**: каждый селектор ∈ `selectors_used_by(page)` из footprint-матрицы (плюс shared, явно «промоутнутые» в page). `@media print` запрещён (только в print.css). `!important` разрешён с warning+счётчиком (цель — снижать).
5. **Import-дисциплина** (новый чек, per HTML): каждая prod-страница грузит **ровно** `tokens.css + base.css + (pages/<page>.css если есть) + (print.css если печатает)`, в порядке `tokens → base → page → print`. Allowed-set и порядок — таблица в скрипте. Нарушение порядка/набора — error.
6. **`@layer`-дисциплина**: если W1.1' вводит `@layer tokens, base, page, print` — линтер проверяет, что декларация порядка слоёв присутствует в base.css первой.

**Migration plan скрипта**: Шаг 1 — написать `check_trainer_css_layers_v2.mjs`, гонять параллельно со старым. Шаг 2 — после физического split (W1.1') удалить старый, переименовать v2 в основной. CI: 4-й governance-check, падение блокирует merge.

## 8. Open questions resolved

| OQ | Ответ | Обоснование |
|---|---|---|
| **1** build-step vs `@import` vs `<link>` | **явные `<link>`, без сборки** | per-page = 3–4 `<link>`/страница (HTTP/2 multiplexing OK); `@import` = sequential fetch (нет); build-step нарушает инвариант «без сборки». Порядок критичен → закрепляется linter'ом §7.5 + `@layer` |
| **3** cross-browser print | **baseline снят: 36/36 pass, 0 fail** (`print_features_baseline.txt`) | после W1.1' прогон должен дать идентичный output; расхождение = split повлиял на print |
| **5** page-aware linter | **да, обязателен** | при per-page деградация back-to-monolith реальнее; дизайн в §7 |
| **A** Claude Design tokens format | **стандартные CSS custom properties** (`--name: value` в `:root`) | нативный CSS, гарантированно читается; финально проверяется в W1.2' rehearsal |
| **B** группировка страниц | **`pages/auth.css` — НЕ нужен** (0 эксклюзив, всё в base); **`my-homeworks.css` — merge** (Jaccard 0.79, 10 эксклюзивных `.myhw-*`); **home — раздельно** | Jaccard: auth-пары 0.94–1.00, но эксклюзив=0 → auth = base+header; myhw=0.79+10 эксклюзив→merge; home_student~home_teacher 0.79 **inflated базой** (эксклюзивный контент — student-forecast/badges vs teacher-accordion/score-thermo — расходится) → раздельно. Также: `list~unique` 0.67, `trainer~hw` 0.85 (но содержательно разные page-фичи) |

## 9. Dynamic-selectors risk (§5.9)

Полный аудит динамических механизмов (источник: W1.0 §5.1/§8 + grep concat-паттернов):

| Механизм | Селекторы | Митигация в footprint | Страницы |
|---|---|---|---|
| dataset camelCase | `data-fig-type/size/orientation/variant`, `data-stem-ends` | **camelCase-матч** (`dataset.figType`) — иначе были бы false-dead | trainer/list/unique/hw/analog (фиг-рендереры) |
| `classList.toggle('literal')` | `body.print-layout-active`, `.print-with-answers`, `.teacher-student-view` | литералы найдены прямым матчем | print-инициирующие + picker (teacher-view) |
| `setAttribute('data-…', val)` | `data-color` (score-thermo), `data-topic-id` (analog-btn), `data-header-extra` | литералы найдены | home-teacher/picker; analog/hw/trainer |
| dynamic import concat | модули через `withV(rel+'…')`, `buildWithV('…')` | **обобщённый scan path-строк** — иначе `print_btn.js` (и весь print-dialog/custom-title) были бы false-dead | все печатающие |

**Важно: НЕ найдено** ни одного `'prefix-' + variable` class-building паттерна (искал `classList.add('x-'+…)`, template-literal class). То есть **скрытых footprint-дыр от конкатенации классов нет** — динамика ограничена data-attr (camelCase, покрыто) и литеральными body-state классами (покрыто). Footprint надёжен.

**Hygiene-flag для W1.1'+**: `data-fig-*` стек хрупок (двойной `:not():not()` для wide-landscape ветки, W1.0 §5.4) — при выносе фигур держать L2-screen-default + L5-print вместе по порядку.

## 10. Рекомендация по W1.1' (на данных W1.0b)

Порядок физического split (от низкого риска к высокому):

1. **`tokens.css`** — извлечь confirmed-tokens (§4) в `:root`. Заодно закрыть W1.0 OQ7 (`#2563eb`→`var(--accent)` на L3:3049). Низкий риск.
2. **`print.css`** — вынести строки 3504..3930 целиком (L4+L5). Изолировано `@media print`. Прогнать `print-features.js` — должно совпасть с baseline (§8.3). Низкий риск.
3. **`base.css`** — 96 base-селекторов (5+ страниц). Ввести `@layer tokens, base, page, print` здесь.
4. **`pages/*.css`** — по single-page (108) + промоут нужных shared. Порядок: сперва тонкие (auth почти пустой, myhw, profile, stats, analog), затем тяжёлые (**home-student последним** — 17 order-зависимых правил; держать вместе).
5. **HTML `<link>`** в 18 prod (+smoke+fixtures): `tokens → base → page → print`. `bump_build.mjs` поглотит `?v=`.
6. **`check_trainer_css_layers_v2.mjs`** (§7) — параллельно со старым.

Критично: переносить ВСЕ правила селектора (base+breakpoints) вместе; не разрывать `data-fig-*` фиг-стек; не разрывать `.print-ans-line`/`.print-custom-title` screen-hide vs print-show (W1.0 §8). Не критично: auth/landing — почти только base, page-файлы тонкие или отсутствуют.

## 11. Verification

- **§9.1 governance** (до и после): `check_runtime_rpc_registry` / `check_runtime_catalog_reads` / `check_no_eval` / `check_trainer_css_layers` — **4/4 exit 0**. Код не трогался.
- **§9.2 git diff**: изменения только в `reports/w1_0b_*` (см. §12 ниже). Никаких `app/**`/`tasks/**`/`tools/**`/`docs/**`/`?v=`.
- **§9.3 spot-check**: base `.container/.panel/.page-head` = 18/18 prod ✓. Single-page `.added-head`→hw_create (HTML), `.is-active`→student (js+html), `.score-thermo__fill`→home_student (html), `.smart-panel`→trainer (html), `.tp-sec`→hw_create (js) — все найдены в атрибутированной странице ✓.
- **§9.4 print baseline**: `tests/print-features.js` → **Прошло 36, Упало 0** (exit 0), сохранён в `print_features_baseline.txt` для сверки после W1.1'.

## 12. Открытые follow-up (hygiene, НЕ для W1.1')

- **28 dead-кандидатов** (`footprint_summary.json.dead`) — НЕ удалять в W1.0b/W1.1'; подтвердить и снести отдельной hygiene-волной. Примечательны: `.tp-topic/.tp-types/.tp-types-list/.topic-auto` (task-picker эволюционировал на `tp-topic-btn`/`tp-type-btn`/`tp-item*`), `.fixed-mini-*` (5), `.modal-*-simple`/`.modal-sm`, `.vs`-нет (vs-modal живой), `.student-head/.students-head*` legacy, `.create-head*`, `.ws-ans-text` (test-only), `#__ege_diag__`. ⚠ строгая hyphen-граница могла дать редкий false-dead → перед удалением W1.1'-исполнитель перепроверяет каждый.
- **Breakpoint-унификация** (OQ9) до `520/720/1024/1400` — отдельная волна.
- **z-index шкала** — бессистемные 7 значений → `--z-*` scale (риск порядка).
- **`#2563eb`→`var(--accent)`** (W1.0 OQ7, L3:3049) — закрыть в W1.1' tokens-шаге.
- **dead `.theme-toggle`** (W1.0 OQ10) — снести после split.
- **popover-геометрия** (`.user-menu/.profile-menu/.hw-create-close-menu`, W1.0 §7.4) → `.ui-popover` — structural refactor, не split.
- **ToC ±2 строки** (W1.0 OQ6) — автогенерация ToC в split-файлах.
