# W1.0b — Per-page footprint и design tokens recon под Вариант E

Дата создания: 2026-05-25
Тип волны: **read-only recon** (никакого продуктового кода)
Триггер: `W1_REPLAN.md` (2026-05-25) — переплан W1 с Варианта D на Вариант E (per-page + tokens) под цель «Claude Design + поштучное редактирование страниц».
Связанные волны: W1.0 (✅ 2026-04-23, переиспользуется на 80%), W1.1' (⏳ после ACCEPT этой волны), W1.2' (⏳ после W1.1').

---

## §1. Цель

Выдать data-driven основу для W1.1' per-page split. На выходе — отчёт `reports/w1_0b_recon_report.md`, который **однозначно определяет** для W1.1':
- какие селекторы относятся к какой странице (footprint-матрица);
- какие правила/группы должны жить в `pages/<page>.css`, какие — в `base.css`, какие — в `tokens.css`;
- список design tokens (CSS variables) с обоснованием каждого;
- conflict-map cascade-зависимостей, которые сейчас работают только из-за порядка в monolith;
- proposal для нового `tools/check_trainer_css_layers.mjs` под Вариант E;
- закрытые open questions 1/3/5 из W1.0 §11 + новые A/B из `W1_REPLAN.md §5`.

Это **research-only волна**. Никакого продуктового кода. Код-фикс — W1.1' (после ACCEPT этой волны).

## §2. Контекст и мотивация

**W1.0 (2026-04-23)** дала фактологическую базу: 22 страницы-потребителя, layer-map L0..L5, inventory классов/data-attr, page×feature matrix, дубликаты литералов, JS/CSS hooks. Рекомендован Вариант D, но он отменён в `W1_REPLAN.md`.

**W1_REPLAN.md (2026-05-25)** переопределил вариант split с D на **E**: `tokens.css + base.css + print.css + pages/<page>.css ×N`. Мотивация — стратегическая цель оператора «целенаправленный редизайн всех экранов через Claude Design» (Anthropic Labs tool, читает codebase для построения design system, экспортирует handoff в Claude Code). Под эту цель ни один из вариантов A–D recon'а не подходит.

W1.0b — **дельта-разведка под Е**. Что W1.0 уже знает (page-feature matrix §6, layer-map §3, inventory §5, дубликаты §7) — переиспользуется напрямую. W1.0b добирает то, что W1.0 не считала:

1. **Per-page footprint селекторов** (W1.0 знала «эта страница использует эту feature-group», но не «эта страница использует эти конкретные классы»). Нужно для определения границы каждой `pages/<page>.css`.
2. **Design tokens** — какие литералы из §7.3 W1.0 квалифицируются как `--var` в `tokens.css` (порог по частоте + кластеризация близких значений).
3. **Cascade conflict map** — какие правила сейчас работают только из-за их порядка в monolith. Эти правила требуют отдельной осторожности при per-page split (через `@layer` или явный specificity bump).
4. **Governance дизайн** под новые инварианты Варианта Е.

## §3. Out of scope

- **Никакой продуктовый код.** Ни одного байта в `tasks/`, `app/`, `tools/`, `docs/supabase/`, `.github/workflows/`. Если возникает вопрос «а вот эту мелочь поправить заодно» — stop-ask.
- **Не писать `W1_1_PLAN.md` или `W1_1prime_PLAN.md`.** Это работа куратора **после** ACCEPT этой волны.
- **Не переписывать `tools/check_trainer_css_layers.mjs`** — только дизайн proposal'а в отчёте (§5.9).
- **Не делать «экспериментальный split в стороне»** — все варианты структуры обсуждаются в отчёте, не в коде. Никаких `tasks/trainer/_scratch/...` файлов.
- **Не править W1.0 recon-отчёт** — он immutable (исторический артефакт принятой волны).
- **Не трогать другие треки** (WS / W7 / WHF / W2 / W3).
- **Не запускать `node tools/bump_build.mjs`** — продуктовый код не меняется, бамп не нужен.
- **Не запускать Claude Design** — это W1.2'. Здесь можем только сослаться на её ожидаемые требования.

## §4. Затрагиваемые файлы

**Никаких изменений в production-коде.** Read-only исследование.

Артефакты W1.0b пишутся только в:
- `reports/w1_0b_recon_report.md` — основной отчёт (новый файл)
- `reports/w1_0b_artifacts/` — поддиректория со scratch-данными:
  - `selector_inventory.txt` — полный отсортированный список классов / id / data-attr из `tasks/trainer.css` (для footprint-grep'а)
  - `footprint_matrix.csv` — матрица `selector × page` (page = HTML-файл, бинарно: используется/нет)
  - `tokens_candidates.csv` — литералы с частотой (цвет, spacing, font-size, etc.)
  - `cascade_conflicts.txt` — правила, у которых порядок в monolith важен (например, два `.q-card` с разной specificity)
  - `grep_session.log` — лог использованных команд grep / find / awk, для воспроизводимости

**Никаких других файлов.**

## §5. Пошаговый план

> **Task-tracking (обязательно для исполнителя):** в начале работы создай TaskList через `TaskCreate` с пунктами §5.2–§5.10. По мере выполнения обновляй статусы через `TaskUpdate`: `in_progress` при старте, `completed` при завершении. Для research-волны от 4 часов task-tracking особенно важен — оператору нужно видеть, что не завис на одном из шагов.

### §5.1 Подготовка

1. Убедиться, что локальный `main` свежий (`git pull origin main`), working tree чистый.
2. Прочитать **полностью**:
   - `W1_REPLAN.md` (мотивация перехода на Вариант Е).
   - `reports/w1_0_trainer_css_recon_report.md` §3 (layer-map), §4 (sub-blocks), §5 (inventory), §6 (page×feature matrix), §7 (дубликаты + breakpoints), §8 (JS/CSS), §11 (open questions).
   - `WHF2_PLAN.md` §6.3 как пример формата stop-ask (структура полезна для отчёта).
3. Sanity governance — должны быть зелёные до начала:
   ```bash
   node tools/check_runtime_rpc_registry.mjs
   node tools/check_runtime_catalog_reads.mjs
   node tools/check_no_eval.mjs
   node tools/check_trainer_css_layers.mjs
   ```

### §5.2 Per-page footprint map (главный артефакт)

1. **Извлечь полный список селекторов** из `tasks/trainer.css`. Источник — `reports/w1_0_trainer_css_recon_report.md §5.3` («Классы и ID: объёмная статистика») + дополнительный pass по файлу для:
   - всех уникальных классов (`.X`), id (`#X`), data-attr (`[data-X="Y"]`)
   - body-level state-атрибутов (`body[data-X]`, `body.X`)
   - element-tag селекторов с context (например, `.q-card > button` — не «button» вообще, а в контексте `.q-card`)
   
   Сохранить в `reports/w1_0b_artifacts/selector_inventory.txt` (один селектор на строку, отсортировано).

2. **Для каждого селектора — определить footprint (на каких страницах используется).** Для каждой из 22 prod HTML-страниц (список — `reports/w1_0_trainer_css_recon_report.md §2`):
   - **Класс (`.X`)**: grep на `class="...X..."` в HTML + поиск в page-specific JS-модулях (`tasks/<page>.js`, импортируемые `app/**/*.js`) на динамическое добавление через `classList.add('X')`, `element.className`, template literals и т.п.
   - **ID (`#X`)**: grep на `id="X"` в HTML + `document.getElementById('X')` / `querySelector('#X')` в JS.
   - **data-attr (`[data-X]`)**: grep на `data-X=` в HTML + `setAttribute('data-X', ...)` / `dataset.X` в JS.
   - **body-state (`body.X` / `body[data-X]`)**: эти ставятся динамически (например, `body.print-layout-active` — из `app/ui/print_lifecycle.js`). Trace, какие JS-модули их ставят, и через какие страницы (HTML imports) эти модули попадают.
   
   Записать в `reports/w1_0b_artifacts/footprint_matrix.csv` со столбцами: `selector,hw,hw_create,trainer,list,unique,analog,picker,home_student,home_teacher,stats,my_students,student,profile,my_homeworks,my_homeworks_archive,auth,auth_callback,auth_reset,google_complete,index,terms,privacy` (значение `1` если используется, `0` если нет).
   
   **Edge case — dynamic селекторы.** Если selector добавляется через `classList.add('q-state-' + s.toLowerCase())` — это **семейство** селекторов. Раскрыть в reasonable набор (см. JS, какие значения `s` принимает) или пометить как `dynamic:<pattern>` в отчёте и обсудить в §5.8 риски.

3. **Sanity check** footprint-матрицы:
   - Каждый селектор используется минимум на 1 странице (если 0 — это dead code, кандидат на удаление, обсудить в §5.6).
   - Каждая страница использует минимум 5 селекторов (если меньше — что-то не так с grep'ом, например, страница загружает другой CSS).
   - Сверить с §6 W1.0 («page × feature-group»): если страница помечена использующей feature-group X, она должна использовать минимум 1 селектор из X. Расхождения — в §5.6 (cascade conflicts).

### §5.3 Shared-vs-page классификация селекторов

На основе footprint-матрицы из §5.2:

1. **Used by 1 page** — кандидат в `pages/<page>.css`. Записать список в отчёте §3.
2. **Used by 2–4 pages** — кандидат-развилка:
   - Если overlap по странам логически связан (например, `auth.html + auth_callback.html + auth_reset.html + google_complete.html` все используют `.auth-form` → общий `pages/auth.css`).
   - Если overlap случайный (например, `.btn-primary` на `hw.html` + `picker.html` + `home_student.html`) → в `base.css`.
   - Решающее правило: **тематическое единство страниц > порог количества**. Закрепить в отчёте §3 как rule of thumb.
3. **Used by 5+ pages** — `base.css`.

В отчёте — таблица с тремя колонками: `Bucket | Селекторы (примеры) | Целевой файл`. Полный список можно вынести в artifact-CSV.

### §5.4 Design tokens extraction

1. **Литералы из `trainer.css`** (расширить `reports/w1_0_trainer_css_recon_report.md §7.3`):
   - Все hex-цвета (`#2563eb`, `#f5f7fb`, etc.) с частотой.
   - Все `rgba(...)`-цвета.
   - Все font-size в `px` / `rem` / `em` (например, `15px`, `1rem`).
   - Все spacing-значения в `px` (margin, padding, gap) с частотой; кластеризовать в группы по близким значениям (4-6-8-12-16-20-24-32-40-48 — рекомендованный 8pt grid; реальные значения могут отличаться).
   - Все `border-radius` значения.
   - Все `box-shadow` значения.
   - Все `transition-duration` / `animation-duration` значения.
   - Все `z-index` значения (особенно важно для UI стека).
   - Все breakpoint значения из `@media` (W1.0 §7.2 их перечислила — нужно повторить и подтвердить).

   Сохранить в `reports/w1_0b_artifacts/tokens_candidates.csv` со столбцами: `kind,value,frequency,sample_selectors,target_token_name?,group?`.

2. **Классификация в tokens**:
   - **Confirmed tokens** (frequency ≥ 3, нет конфликта с близкими значениями): получают имя CSS variable. Пример: `--accent: #2563eb` (если #2563eb используется 5+ раз), `--space-4: 16px` (если 16px используется 10+ раз).
   - **Probable tokens** (frequency 2–3, или есть близкое значение, требующее решения «склеить ли»): требуют обсуждения в W1.1' — записать как «to be decided in W1.1'» в отчёте.
   - **One-offs** (frequency 1, нет близких): остаются inline в `pages/<page>.css`. Не tokens.

3. **Naming convention** для tokens. Дефолт: `--<group>-<role>` (`--color-accent`, `--space-md`, `--fs-lg`, `--radius-sm`, `--shadow-card`, `--z-modal`). В отчёте — финальный список с предложенными именами. **Не выбирать имена «вкусово»** — следовать конвенции и justify outlier'ы.

4. **Special case: breakpoints.** Они в `@media` queries, не как CSS variables (variables в media queries не поддерживаются стабильно во всех браузерах). Но их **унификация** — отдельная задача (open question 9 из W1.0 §11). В W1.0b — зафиксировать предложенные 3–4 дискретных значения (например, `480px / 768px / 1024px / 1440px`), отметить, какие текущие breakpoints на них мапятся, какие требуют переезда. **Сам перенос — отдельная hygiene-волна, не в W1.1'.**

### §5.5 Cascade conflict map

1. **Найти правила, чей эффект зависит от позиции в monolith.** Признаки:
   - Два правила с одинаковой specificity для одного селектора (cascade выигрывает последнее) — например, `.q-card { padding: 16px }` в L1 и `.q-card { padding: 24px }` в L3 — реально применится второй.
   - Правило с меньшей specificity, которое перебивает правило с большей за счёт `!important` или порядка.
   - Правила, которые ссылаются на родительский контекст (`.parent .child`), где `.parent` определён в одном слое, `.child` — в другом, и порядок важен.

2. **Метод выявления**:
   - Grep на duplicate селекторы в `trainer.css` (например, `grep -E "^[.#][a-zA-Z0-9_-]+ \{" tasks/trainer.css | sort | uniq -c | sort -rn | awk '$1 > 1'` — даст селекторы с 2+ определениями).
   - Для каждого duplicate'а — посмотреть, **разные ли в них правила** (если разные — cascade matter; если идентичные — dead duplication, кандидат на удаление).
   - Грубая проверка: `node -e "..."`-скрипт, который парсит CSS и для каждого селектора с многими определениями выводит окно строк.

3. Записать в `reports/w1_0b_artifacts/cascade_conflicts.txt` со списком: `selector | строки в trainer.css | характер конфликта | предлагаемая стратегия миграции`. Стратегии:
   - **Merge** — два правила сливаются в одно (если разные свойства — конфликта нет, просто слить).
   - **`@layer`** — использовать CSS `@layer` при split, чтобы эксплицитно зафиксировать каскад (например, `@layer base, components, page` и положить page после).
   - **Specificity bump** — повысить specificity «выигрывающего» правила, чтобы cascade перестал зависеть от порядка.
   - **Manual review in W1.1'** — слишком тонкий случай, нужен глаз исполнителя.

### §5.6 Print cross-page deps

1. **Найти все `@media print` блоки и `body.print-layout-active`-условные правила** в `trainer.css` (это L4 + L5 из W1.0 §3).
2. Для каждого правила определить, **является ли оно глобальным или page-specific**:
   - Если селектор начинается с `body.print-layout-active .hw-something` — это page-specific для `hw.html`.
   - Если селектор `body.print-layout-active button` — это глобальное.
3. Подтвердить решение по open question 4 из W1.0 §11: вынести `print-dialog` в отдельный `print-dialog.css` или оставить в общем `print.css`. **Рекомендую**: оставить в общем `print.css` для минимальности. Если объём `print-dialog`-правил велик (>200 строк) — рассмотреть выделение.
4. **Dead code search**: правила в L4/L5, для которых page-noun (`.hw-create-...`, `.picker-...`) больше не существует на странице. Кандидаты на удаление — фиксировать как hygiene follow-up (W1.0b НЕ удаляет; это W1.1' или отдельная hygiene-волна).

### §5.7 Governance proposal — расширение `check_trainer_css_layers.mjs`

**В отчёте**, не в коде. Описать proposal:

1. **Новые инварианты под Вариант Е:**
   - `tokens.css` содержит **только** `:root { --<name>: <value> }` правила (никаких селекторов). Грep-чек: каждая строка либо `:root {`, либо `}`, либо `--`-объявление, либо комментарий.
   - `base.css` содержит **только shared-правила** (footprint ≥ 5 страниц по W1.0b §5.3 классификации). Чек: автоматически генерируется список allowed-селекторов из `footprint_matrix.csv` (`used_count ≥ 5`); linter падает, если в `base.css` есть селектор с `used_count < 5`.
   - `print.css` содержит **только** `@media print { ... }` блоки + правила, имеющие `body.print-layout-active` префикс. Чек: парсим селекторы, валидируем.
   - `pages/<page>.css` содержит селекторы только из footprint этой страницы. Чек: для каждого `<page>.css` — селекторы должны быть подмножеством `selectors_used_by(page)` из footprint-matrix.
   - **Никаких `!important` в `tokens.css` и `base.css`.** В `pages/*.css` `!important` разрешено, но с warning'ом и счётчиком (цель — снижать со временем).

2. **Импорт-дисциплина (новый чек):**
   - Каждая prod HTML-страница грузит **ровно**: `tokens.css + base.css + (pages/<page>.css если есть) + (print.css если страница печатает)`. Никаких пропусков, никаких лишних. Конкретный allowed-set per page — table в скрипте.
   - Порядок `<link>` тегов: `tokens → base → page → print`. Изменение порядка — error.

3. **CI-интеграция:** скрипт запускается как четвёртый governance-check; падение блокирует merge.

4. **Migration plan для скрипта в W1.1':**
   - Шаг 1: написать новый скрипт `check_trainer_css_layers_v2.mjs`, запускать его параллельно со старым.
   - Шаг 2: после split (W1.1') старый скрипт удаляется, v2 переименовывается в основной.

### §5.8 Решение open questions

В отчёте — отдельная секция с явными ответами на:

- **OQ 1 (build-step vs `@import` vs `<link>`)** — рекомендация: **явные `<link>` без сборки**. Per-page split увеличивает число `<link>` тегов с 1 до ~4 per page, но это всё ещё приемлемо (HTTP/2 multiplexing, кеширование). `@import` отвергаем (sequential fetch). Build-step отвергаем (инвариант «без сборки»).
- **OQ 3 (cross-browser print)** — рекомендация: запустить `tests/print-features.js` baseline сейчас (до W1.1'), сохранить эталон; после W1.1' прогон должен дать идентичный output. Если расходится — split повлиял на print, разбираться.
- **OQ 5 (page-aware linter)** — да, обязательно (это §5.7 proposal).
- **OQ A (Claude Design integration)** — формат tokens: стандартные CSS custom properties (`--<name>: <value>` в `:root`). Это нативный CSS, Claude Design гарантированно его понимает (это рекомендованный формат для design systems везде).
- **OQ B (page boundaries для группированных страниц)** — на основе footprint-overlap из §5.2. Если две страницы делят >70% селекторов — общий `pages/<group>.css` (например, все 4 auth-страницы → `pages/auth.css`). Если <70% — раздельные. Конкретные решения для известных групп (auth, my_homeworks, home, fixture-print) — в отчёте.

### §5.9 Dynamic-селектор risk assessment

Из §5.2 — список селекторов, которые добавляются динамически (через JS template literals или conditional class names). Эти селекторы плохо grep'ятся в HTML, легко пропустить в footprint-матрице. В отчёте:

1. Список всех найденных dynamic-патернов с их источниками в JS.
2. Для каждого — оценить, какие страницы могут их активировать (через какой JS-модуль).
3. Решение: добавить эти страницы в footprint таких селекторов **conservatively** (если есть сомнение — добавить), чтобы W1.1' не вынес правило только в одну страницу, а оно нужно ещё в одной.
4. **Hygiene-flag**: рассмотреть рефакторинг dynamic-class-names в W1.1' или последующей hygiene-волне (например, заменить `'q-state-' + status` на enum-like `getStatusClass(status)` с явным mapping'ом — упрощает governance).

### §5.10 Сборка отчёта

`reports/w1_0b_recon_report.md` со структурой §10 этого плана. Все артефакты в `reports/w1_0b_artifacts/` — приложены и упомянуты в отчёте.

## §6. Данные / контракты / миграции

Никаких. SQL не правится. `docs/supabase/runtime_rpc_registry.md` не меняется. Backend dev/prod-данные не модифицируются. CSS не меняется.

## §7. Риски и stop-ask точки

### Это НЕ red-zone волна

`tasks/trainer.css` сам по себе — общий CSS-каркас, его правка считается red-zone по `CURATOR.md §6.2`. Но **W1.0b НЕ ПРАВИТ trainer.css** (read-only); risk-режим не активируется. Если возникает желание «а вот эту мелочь поправить» — stop-ask по trigger 1.

### Конкретные риски

1. **Dynamic селекторы пропущены в grep'е** (например, `classList.add('q-state-' + s)`). Footprint оказывается дырявым → W1.1' положит правило в одну страницу, оно нужно ещё в одной → визуальная регрессия. **Митигация**: §5.9 explicit risk assessment + conservative classification (если сомнение — multi-page).
2. **Cascade conflict не выявлен** на recon → проявится при W1.1' split → визуальная регрессия. **Митигация**: §5.5 systematic dup-selector search + spot-check на 3–5 страницах вручную (загрузить HTML с предполагаемым split-CSS в браузер, сравнить с baseline).
3. **Tokens-кандидаты неудачно сгруппированы** (например, склеили `15px` и `16px` в один token, хотя они различимы). **Митигация**: §5.4 frequency-based + явный «to be decided in W1.1'»-маркер для пограничных случаев — не форсировать решение в recon.
4. **Footprint-матрица слишком большая**, чтобы её прочитать целиком. **Митигация**: csv-артефакт + в отчёте — только highlights (топ-20 «pages-shared», топ-20 «single-page», все «5+ pages»).
5. **Volume оценки сильно сместится** при подсчёте per-page footprint (W1.0 ожидал ~4–6 часов, W1.0b может оказаться 8–10). **Митигация**: §5.2.3 sanity check; если footprint-grep'ы массивно дают пустоты или 22-везде — отчёт фиксирует это как dead-code или universal-classes, без paralysis.

### Stop-ask точки (проектные дополнения к §6.3)

- Попытка изменить любой файл вне `reports/w1_0b_*` — stop-ask.
- Попытка изменить `reports/w1_0_*` (W1.0 immutable) — stop-ask.
- Попытка добавить экспериментальные scratch-файлы в `tasks/trainer/...` — stop-ask (это W1.1' работа).
- Попытка переписать `tools/check_trainer_css_layers.mjs` — stop-ask (только дизайн proposal'а, не код).
- Если ни один из вариантов tokens-naming не оказывается лучше остальных — stop-ask с описанием альтернатив (не выбирать «как пришло в голову»).
- Если cascade-conflict-map даёт >20 правил, требующих manual review в W1.1' — stop-ask: значит, монолит специфичнее, чем казалось; куратор должен решить, идти ли в W1.1' с такой сложностью, или предварительно сделать hygiene-pass по cascade-cleanup.
- Если spot-check показывает, что 3+ страниц теряют визуал после виртуального применения W1.1'-структуры (мысленный эксперимент: «если правило R уходит только в `pages/hw.css`, page X сломается?») — stop-ask: footprint неполный.

> **Режим работы: автономный** (для research-волны это значит «собирай данные самостоятельно, не уточняй каждый шаг»). Не останавливайся за подтверждением на каждом из §5.2–§5.10, не проси промежуточного ревью между шагами. Доведи работу до §5.10 (отчёт готов, все артефакты на месте) и верни completion summary. Куратор принимает работу целиком.
>
> **Останавливайся (stop-ask) только в экстренных случаях:**
>
> 1. Попытка изменить файл вне §4 (только `reports/w1_0b_*` разрешены).
> 2. Попытка зайти в Out of scope §3 или red-zone §6.2 `CURATOR.md`.
> 3. План противоречит реальности: `reports/w1_0_trainer_css_recon_report.md` смещён по нумерации секций, `tasks/trainer.css` уже разделён кем-то ещё, или количество страниц-импортёров изменилось (W1.0 говорит 22, реальность другая — что-то добавилось/убавилось).
> 4. DoD объективно недостижим без выхода за scope (например, требуется реальный split, чтобы проверить cascade — этого делать НЕЛЬЗЯ, только мысленный эксперимент).
> 5. Governance-скрипт упал (теоретически не должен — мы кода не трогаем).
> 6. Уязвимость / утечка креденшлов в обработанных файлах (маловероятно для CSS-recon).
> 7. Задача распалась на две независимых.
> 8. Один и тот же подход к сбору данных не даёт результат 2+ раз подряд (например, grep на dynamic-селекторы оказывается принципиально нерешаемым) — нужна смена методики.
> 9. Архитектурное решение, повлияющее на модули вне scope (например, оказалось, что под Е надо менять JS-модули, не только CSS).
> 10. **Проектная специфика W1.0b:**
>     - (a) cascade-conflict-map даёт >20 правил → возможно, нужна предварительная hygiene-волна;
>     - (b) ни один из вариантов tokens-naming не лучше остальных → нужно operator-решение;
>     - (c) обнаружено, что какая-то страница из 22 по факту не использует `tasks/trainer.css` (импорт мёртвый) → footprint для неё пустой → flag в отчёте, но это сигнал для оператора, а не для тебя.
>     - (d) обнаружен dynamic-pattern, который грозит footprint-дырой, и conservative-classification его не покрывает (например, селектор генерируется из user input) → stop-ask с описанием.
>
> **Не экстренные случаи** (работай сам):
> - выбор имени для CSV-столбцов в footprint-matrix;
> - конкретная команда `grep` vs `ripgrep` vs `ag`;
> - формат записи `cascade_conflicts.txt` (markdown table vs csv);
> - имена кандидатов в tokens (`--accent` vs `--color-primary` — следуй §5.4 конвенции, выбирай по объективным критериям);
> - порядок шагов §5.2–§5.9, если итоговая DoD не страдает.
>
> **Формат stop-ask:** короткое сообщение — какой пункт сработал, что обнаружено, варианты, рекомендация. Жди решения, работу не продолжай.

## §8. Критерии приёмки (DoD)

1. **Footprint-матрица** в `reports/w1_0b_artifacts/footprint_matrix.csv` — каждый селектор × каждая из 22 prod HTML-страниц; sanity-чеки из §5.2.3 пройдены.
2. **Shared-vs-page классификация**: в отчёте — таблица с тремя bucket'ами, для каждого селектора указано, в какой целевой файл он идёт (`tokens.css` / `base.css` / `pages/<page>.css` / `pages/<group>.css`).
3. **Tokens-список** в `reports/w1_0b_artifacts/tokens_candidates.csv` + отчёт §4 — каждый token с обоснованием частоты, предложенное имя по конвенции `--<group>-<role>`, разбиение на «confirmed / probable / one-off».
4. **Cascade-conflict-map** в `reports/w1_0b_artifacts/cascade_conflicts.txt` + отчёт §5 — список правил с миграционной стратегией (merge / `@layer` / specificity bump / manual W1.1').
5. **Print cross-page deps**: каждое `@media print` правило классифицировано как глобальное или page-specific; решение по `print-dialog` зафиксировано.
6. **Governance proposal** в отчёте §7 — описание нового `check_trainer_css_layers_v2.mjs` (инварианты + миграционный план), достаточно полное, чтобы W1.1' исполнитель мог реализовать без дополнительных вопросов.
7. **Open questions** 1/3/5 (из W1.0 §11) + A/B (из `W1_REPLAN.md §5`) — все закрыты явными ответами в отчёте §8.
8. **Dynamic-selectors risk assessment** — список всех найденных + conservative footprint для каждого + hygiene-recommendations.
9. **Sanity-проверки**:
   - `node tools/check_*.mjs` 4 скрипта — все exit 0 (код не трогали).
   - `git diff --stat` — изменения ТОЛЬКО в `reports/w1_0b_*`. Никаких правок в `tasks/`, `app/`, `tools/`, `docs/`.
10. **Отчёт `reports/w1_0b_recon_report.md`** — создан и заполнен по §10.

## §9. План проверки

Так как код не правится, governance/e2e блок применим только как sanity.

### §9.1 Sanity governance (до и после)

```bash
node tools/check_runtime_rpc_registry.mjs
node tools/check_runtime_catalog_reads.mjs
node tools/check_no_eval.mjs
node tools/check_trainer_css_layers.mjs
```

До начала — все exit 0 (фиксируем baseline). После завершения — все exit 0 (волна ничего не сломала).

### §9.2 Sanity git diff

```bash
git diff --stat
# Ожидание: только reports/w1_0b_recon_report.md + reports/w1_0b_artifacts/*
```

Никаких изменений в `app/**`, `tasks/**`, `tools/**`, `docs/supabase/**`, `e2e/**`. Никаких bump'ов `?v=`.

### §9.3 Spot-check footprint-матрицы

Вручную проверить 3–5 строк (селекторов) и 3–5 страниц из footprint-матрицы:
- Для 3 случайных селекторов из `pages/<page>.css`-bucket — открыть `tasks/<page>.html` и убедиться, что селектор реально используется (например, для `.hw-card` в `pages/hw.css` — открыть `hw.html`, grep на `class="...hw-card..."`).
- Для 3 случайных селекторов из `base.css`-bucket — убедиться, что 5+ страниц действительно их используют.
- Для одной из «сложных» страниц (например, `tasks/picker.html`) — пройтись по списку всех её селекторов и убедиться, что они логически соответствуют экрану.

Spot-check записать в отчёт §11 (Verification).

### §9.4 Tests sanity

`tests/print-features.js` — запустить baseline, сохранить output в `reports/w1_0b_artifacts/print_features_baseline.txt`. Не для DoD W1.0b, а как baseline для W1.1' (чтобы потом сравнить, не повлиял ли split на print-output).

```bash
cd tests
node print-features.js > ../reports/w1_0b_artifacts/print_features_baseline.txt 2>&1
```

Если что-то падает на этом baseline — stop-ask: это не W1.0b проблема, но это нужно знать ДО W1.1'.

## §10. Отчётный артефакт

`reports/w1_0b_recon_report.md` со структурой:

1. **Резюме** (3–5 строк): какой итоговый вид Варианта E подтверждён данными, какие неожиданности, что в W1.1' будет особенно сложно/легко.
2. **Метаданные**: baseline (commit SHA, build id), список входных артефактов W1.0, методика сбора данных в коротком виде.
3. **Footprint-карта** — short-form: для каждой страницы — топ-5 селекторов; полная csv-матрица — в artifact.
4. **Tokens-список** — итоговая таблица confirmed/probable/one-off с предложенными именами; полный csv — в artifact.
5. **Cascade-conflict-map** — список conflict'ов с миграционной стратегией; полный txt — в artifact.
6. **Print cross-page deps** — итоговое решение по `print-dialog` + список dead-code-кандидатов (не удаляем, фиксируем).
7. **Governance proposal** — описание `check_trainer_css_layers_v2.mjs` (инварианты + миграционный план) в формате «достаточно, чтобы W1.1' исполнитель реализовал».
8. **Open questions resolved** — таблица: OQ 1 / 3 / 5 / A / B — ответ — обоснование.
9. **Dynamic-selectors risk** — список + conservative-classification + hygiene-flags.
10. **Рекомендация по W1.1'** — короткий список «что W1.1' делает, в каком порядке, что критично, что нет». На данных W1.0b. Куратор пишет полный `W1_1prime_PLAN.md` на этой базе.
11. **Verification** — sanity-spot-check (§9.3) + sanity-tests (§9.4) — результаты.
12. **Открытые follow-up для последующих волн** — что обнаружено в W1.0b как hygiene-кандидат (dead `theme-toggle`, breakpoint унификация, dynamic-class-names refactor, и т.д.). НЕ для W1.1' — отдельные hygiene-волны.

---

## Что после W1.0b

После ACCEPT W1.0b:
- `GLOBAL_PLAN.md §4` — W1.0b → ✅ закрыто, W1.1' → ⏭ следующая (с конкретными числами объёма из отчёта).
- Куратор пишет **`W1_1prime_PLAN.md`** в формате `CURATOR.md §6` на основе отчёта W1.0b. Это плановая волна, code, ~1–2 дня объёма исполнителя.
- Параллельно (опционально) оператор может прогнать **Claude Design onboarding** на текущем монолите (cheap-thesis-check, см. `W1_REPLAN.md §7`) — чтобы скорректировать ожидания по качеству design-system extraction.
