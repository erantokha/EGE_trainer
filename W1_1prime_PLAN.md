# W1.1' — Physical per-page split `tasks/trainer.css` → `tasks/trainer/{tokens,base,print}.css + pages/<page>.css`

Дата создания: 2026-05-25
Тип волны: **code-волна, red-zone** (`tasks/trainer.css` — общий CSS-каркас + `tools/check_trainer_css_layers.mjs` governance-скрипт по `CURATOR.md §6.2`).
Триггер: ACCEPT W1.0b research-волны 2026-05-25; рекомендованный порядок split из `reports/w1_0b_recon_report.md §10`.
Связанные волны: W1.0 (✅ recon-base), W1.0b (✅ per-page data), W1_REPLAN.md (вектор), W1.2' (⏳ Claude Design rehearsal после этой волны).
Ориентир объёма: **1–2 дня исполнителя** (8–14 часов).

---

## §1. Цель

Физически разнести монолитный `tasks/trainer.css` (3930 строк) на структуру Варианта E:

```
tasks/trainer/
  tokens.css         # CSS custom properties (--accent, --space-*, --fs-*, ...)
  base.css           # 96 base-селекторов (5+ страниц), + @layer declaration
  print.css          # все @media print + body.print-layout-active (3504..3930)
  pages/
    hw.css
    hw-create.css
    trainer.css
    list.css
    unique.css
    analog.css
    home-student.css
    home-teacher.css
    stats.css
    my-students.css
    student.css
    my-homeworks.css  # объединяет my_homeworks + my_homeworks_archive (Jaccard 0.79, 10 эксклюзивных .myhw-*)
    profile.css
    # ВНИМАНИЕ: pages/auth.css НЕ создаётся — auth = base+header (W1.0b §3, 0 эксклюзивных)
```

Обновить `<link>`-теги в 18 prod + 1 smoke + 3 fixture HTML на новую структуру (`tokens → base → page → print`).

Заменить `tools/check_trainer_css_layers.mjs` на `_v2` под новые инварианты Варианта E (per W1.0b §7).

Сохранить визуальный паритет: `tests/print-features.js` 36/0 (как baseline W1.0b `print_features_baseline.txt`); spot-check 5 страниц в браузере — никаких визуальных регрессий.

## §2. Контекст и мотивация

W1.0b установила data-driven (`reports/w1_0b_recon_report.md`):
- **342 селектора × 18 prod**: 96 → base, 110 shared, 108 page-specific, 28 dead.
- **Cascade real-risk = 2 правила** (`.theme-toggle` dead + один print-only) — далеко ниже stop-ask порога. Остальные 17 same-context-конфликтов — все в home-student-scope, intra-page-safe.
- **Auth — pure base+header**, отдельный `pages/auth.css` не нужен.
- **Print чистый**: 118 `@media print` = 62 global + 56 state-gated, `print-dialog` остаётся screen (не в print.css).
- **Tokens spacing НЕ 8pt grid**, реально 2/4/6/8/10/12; font-size 11/12/13/14/16/18/20; radius 10/12/16/999.
- **Print baseline 36/0** сохранён в `reports/w1_0b_artifacts/print_features_baseline.txt` для регресс-сверки.

После W1.1' (а)`tasks/trainer.css` физически удалён или сведён к shim'у; (б) каждая страница грузит минимально достаточный набор; (в) Claude Design (W1.2' rehearsal) сможет извлечь design system из чистого `tokens.css`; (г) специально-дизайнерская правка одной страницы изолирована в `pages/<page>.css`.

## §3. Out of scope

**Жёстко НЕ делать в этой волне** (каждое — stop-ask trigger):

- **Не удалять dead-кандидаты** (28 шт. из W1.0b §6 + §12). Переносим их в `base.css`/`pages/*.css` по footprint **как есть**, в т.ч. `.theme-toggle`-стиль. Удаление = отдельная hygiene-волна после W1.1'.
- **Не унифицировать breakpoints** (W1.0b §12 кандидат на отдельную hygiene-волну). Каждый текущий breakpoint мигрирует as-is.
- **Не вводить z-index шкалу** (W1.0b §4 probable-tokens). Маппинг 7 текущих значений на шкалу — отдельная волна.
- **Не вводить popover utility** (`.ui-popover` рефакторинг из W1.0 §7.4) — structural refactor, не split.
- **Не править JS-модули** (`tasks/picker.js`, `tasks/trainer.js` и т.д. — это треки W2/W3). Если static `?v=` reference на `tasks/trainer.css` в JS-модуле обнаружится — поменять только URL, не логику.
- **Не менять backend** (никаких SQL, RPC, миграций).
- **Не вводить build-step** (Sass/PostCSS/etc) — инвариант «без сборки» (`GLOBAL_PLAN.md §6`). `@layer` и CSS variables — нативные, build не нужен.
- **Не трогать другие треки** (WS, W7, WHF — все в стабильном состоянии).
- **Не запускать Claude Design** — это W1.2'.
- **Не правит `tasks/trainer.css` в исходном файле** (кроме его удаления / превращения в shim в самом конце). Все правки → в новые файлы; cascade-сверка делается мысленно/grep'ом.
- **Не объединять `home_student` + `home_teacher`** в один `home.css` (W1.0b §8 OQB: Jaccard inflated базой, эксклюзивный контент расходится).
- **Не объединять `auth*` в `pages/auth.css`** (W1.0b §8: 0 эксклюзивных, файл не нужен).

## §4. Затрагиваемые файлы

### 4.1 Новые файлы (создаются)

- `tasks/trainer/tokens.css` (~1–2 КБ; CSS custom properties в `:root`).
- `tasks/trainer/base.css` (~6–10 КБ; 96 base-селекторов + `@layer tokens, base, page, print` декларация).
- `tasks/trainer/print.css` (~8–10 КБ; строки 3504..3930 из старого `trainer.css`).
- `tasks/trainer/pages/hw.css`
- `tasks/trainer/pages/hw-create.css`
- `tasks/trainer/pages/trainer.css`
- `tasks/trainer/pages/list.css`
- `tasks/trainer/pages/unique.css`
- `tasks/trainer/pages/analog.css`
- `tasks/trainer/pages/home-student.css` ⚠ самый сложный (17 order-зависимых правил)
- `tasks/trainer/pages/home-teacher.css`
- `tasks/trainer/pages/stats.css`
- `tasks/trainer/pages/my-students.css`
- `tasks/trainer/pages/student.css`
- `tasks/trainer/pages/my-homeworks.css` (объединяет `my_homeworks.html` + `my_homeworks_archive.html`)
- `tasks/trainer/pages/profile.css`
- `tools/check_trainer_css_layers_v2.mjs` — новый governance-скрипт (по W1.0b §7).

### 4.2 Изменяемые файлы

- `tasks/trainer.css` — **удалить** в конце волны (после миграции всех `<link>`-тегов и проверки). Альтернатива: оставить как 1-строчный re-export shim (`@import url('./trainer/base.css'); @import url('./trainer/print.css');`) — НЕ рекомендую (defeat scope's purpose; reduce confidence). Решение зафиксировано: **удалить**.
- 18 prod HTML-страниц: обновить `<link>` теги на новую структуру. Список — `reports/w1_0_trainer_css_recon_report.md §2` (без `tasks/picker.html` / корневых `index.html`/`terms.html`/`privacy.html`/корневого `student.html` — они НЕ импортируют trainer.css, см. W1.0b §2.1):
  - `tasks/hw.html`, `tasks/hw_create.html`, `tasks/trainer.html`, `tasks/list.html`, `tasks/unique.html`, `tasks/analog.html`
  - `home_student.html`, `home_teacher.html`
  - `tasks/stats.html`, `tasks/my_students.html`, `tasks/student.html`
  - `tasks/my_homeworks.html`, `tasks/my_homeworks_archive.html`
  - `tasks/profile.html`
  - `tasks/auth.html`, `tasks/auth_callback.html`, `tasks/auth_reset.html`, `tasks/google_complete.html` (грузят только `tokens + base`, без `pages/auth.css`!)
- 1 smoke + 3 print-fixture HTML (для сохранения покрытия):
  - `tasks/home_teacher_combo_browser_smoke.html` (смотрит на home-teacher вёрстку)
  - `tests/fixture-print-css.html`, `tests/fixture-print-dialog.html`, `tests/fixture-print-dialog-no-answers.html` — грузят то, что нужно их сценариям (минимум `tokens + print`; уточнить по их content per fixture)
- `tools/check_trainer_css_layers.mjs` — **удалить** в конце волны (заменяется `_v2`).
- `tools/bump_build.mjs` — **не менять логику**, она автоматически подхватит новый набор файлов через свой scan (если scan generic; иначе stop-ask и решение).

### 4.3 Затрагиваются также `bump_build.mjs`-механически

- `app/build.js`, `version.json`, все `?v=...` импорты в `app/**` и `tasks/**` — мехбамп.

## §5. Пошаговый план

> **Task-tracking (обязательно для исполнителя):** в начале работы создай TaskList через `TaskCreate` с пунктами §5.1–§5.13. По мере выполнения обновляй статусы через `TaskUpdate`: `in_progress` при старте, `completed` при завершении. Эта волна большая (8–14 часов) — task-tracking критичен для оператора.

### §5.1 Pre-flight (snapshot + baseline)

1. `git pull origin main`, рабочее дерево чистое.
2. Перечитать `reports/w1_0b_recon_report.md` целиком, особенно §3 (footprint short-form), §4 (tokens), §5 (cascade), §6 (print), §7 (governance proposal), §10 (порядок split).
3. Запустить `tests/print-features.js` — сохранить output как `reports/w1_1prime_artifacts/print_features_before.txt`. Должно дать **36/0** (== baseline W1.0b). Если что-то изменилось — **stop-ask** перед началом split'а.
4. Запустить все 4 governance — должны быть зелёные.

### §5.2 Создать tokens.css

1. `mkdir -p tasks/trainer/pages`.
2. Создать `tasks/trainer/tokens.css` с `@layer tokens` декларацией (не в base, см. §5.4) и confirmed-tokens из `reports/w1_0b_artifacts/tokens_candidates.csv` + отчёт §4. Naming convention `--<group>-<role>`:
   - `--accent: #2563eb;` (объединяется с уже существующим `--accent`, см. W1.0 OQ7)
   - `--fs-2xs: 11px; --fs-xs: 12px; --fs-sm: 13px; --fs-md: 14px; --fs-lg: 16px; --fs-xl: 18px; --fs-2xl: 20px;`
   - `--space-1: 2px; --space-2: 4px; --space-3: 6px; --space-4: 8px; --space-5: 10px; --space-6: 12px;`
   - `--radius-sm: 10px; --radius-md: 12px; --radius-lg: 16px; --radius-pill: 999px;`
   - Probable tokens (15px/10px font, 14px radius, .15s duration) — закрепить с расширенными комментариями `/* TODO W1-cleanup: 15px → fs-?  */` если не определились, либо оставить inline в `pages/*.css` (см. отчёт W1.0b §4).
   - rgba-surface tints (`--tint-1`, `--tint-2`, `--tint-3`, `--focus-ring`) — переносить по образцу отчёта §4.
   - duration tokens (`--dur-fast: 120ms; --dur-base: .2s;`).
   - **z-index НЕ вводить шкалу** (отложено per §3).
3. Закрыть W1.0 OQ7 в этой же подволне: на L3:3049 (теперь в `pages/<page>.css` или `base.css` после миграции) заменить hardcoded `#2563eb !important` на `var(--accent) !important`. Зафиксировать в отчёте.

### §5.3 Извлечь print.css

1. Из `tasks/trainer.css` строки **3504..3930** (L4 + L5, диапазон зафиксирован W1.0 §3 и W1.0b §6) перенести **целиком** в `tasks/trainer/print.css`. Сохранить порядок правил один-в-один.
2. **Не редактировать содержимое** — только move. Если требуется правка (например, `var(--accent)` подстановка) — отложить, делать после полной миграции базы.
3. Внутри `print.css` сохранить две секции: «global print rules» (62 без префикса) и «state-gated» (56 с `body.print-layout-active`), маркируя комментариями для будущего governance-сверки.
4. **НЕ переносить** `print-dialog`-screen-селекторы (14 шт., см. W1.0b §6 + `reports/w1_0b_artifacts/print_classification.txt`). Они screen, остаются в base или page (см. §5.4).

### §5.4 Извлечь base.css (96 base-селекторов + @layer)

1. В начало файла — `@layer tokens, base, page, print;` (декларация порядка слоёв; важно для cross-file cascade без `!important`-эскалации).
2. Перенести 96 base-селекторов (footprint ≥ 5 страниц) из `tasks/trainer.css` в `tasks/trainer/base.css`. Список — `reports/w1_0b_artifacts/selector_classification.csv` (bucket = base).
3. **Каждый селектор переносится со всеми своими правилами**: основное + все responsive-breakpoint варианты (`@media (max-width: …)`) — вместе, в исходном порядке (W1.0b §10 critical: не разрывать).
4. **Обернуть содержимое в `@layer base { ... }`** (кроме `@import` если они нужны — но мы используем `<link>`, импортов нет).
5. Включить shared-селекторы (110 шт., footprint 2–4), которые W1.0b классифицировала как `base` (тематически разрозненные, см. §3 отчёта). Те, что тематически принадлежат странице — в `pages/<page>.css`.
6. `print-dialog`-screen-селекторы (14 шт.) — в base.css (см. §5.3.4): они используются 5 prod-страницами + 2 fixture.

### §5.5 Извлечь pages/*.css — тонкие первые (auth прыгаем, auth = pure base+header)

**Порядок: от тонких к толстым**, governance после каждой группы.

#### §5.5.1 Auth-группа — **`pages/auth.css` НЕ создавать**

W1.0b §3 + §8 OQB: 4 auth-страницы имеют 0 эксклюзивных селекторов. Auth = base + общие header-правила (уже в base). Действие:
1. **Файл `pages/auth.css` НЕ создавать.**
2. В 4 auth HTML (`auth.html`, `auth_callback.html`, `auth_reset.html`, `google_complete.html`) `<link>` будет: `tokens.css + base.css` (без page, без print). См. §5.10.

#### §5.5.2 Тонкие страницы (низкий риск)

В порядке возрастания эксклюзив-сложности:
1. **`pages/analog.css`** (0 single-page, но на page-карте есть; всё, что shared между ним и одной другой страницей — sit там; если 0 эксклюзив, файл может оказаться пустым → не создавать). Проверить per W1.0b §3.
2. **`pages/stats.css`** (0 single-page). Аналогично — если 0 эксклюзив, файл не создаётся.
3. **`pages/profile.css`** (1 single-page).
4. **`pages/list.css`** (1 single-page).
5. **`pages/my-homeworks.css`** (4 + 1 эксклюзив, MERGED для `my_homeworks.html` + `my_homeworks_archive.html` per W1.0b §8 OQB Jaccard 0.79 + 10 эксклюзивных `.myhw-*`).
6. **`pages/unique.css`** (6 single-page).

После каждого page-файла:
- `node tools/check_runtime_*.mjs` 4 скрипта — все зелёные.
- (опционально) визуально проверить страницу локально через `python3 -m http.server 8000`.

#### §5.5.3 Средние страницы

7. **`pages/my-students.css`** (12 single-page).
8. **`pages/trainer.css`** (14 single-page) — здесь `.smart-panel` и т.д.
9. **`pages/home-teacher.css`** (рассчитать single-page по W1.0b §3, который указывает home-teacher single-page «см. примечание» — большинство контента gated через `body[data-home-variant="teacher"]`).
10. **`pages/student.css`** (21 single-page, для `tasks/student.html` — карточка ученика).

#### §5.5.4 Тяжёлые страницы

11. **`pages/hw.css`** (2 single-page, относительно мало эксклюзив).
12. **`pages/hw-create.css`** (27 single-page, самый большой по эксклюзив).
13. **`pages/home-student.css`** (19 single-page + 17 order-зависимых правил с `body[data-home-variant="student"] #accordion …`). **Делать ПОСЛЕДНЕЙ.** Правила переносятся **единым непрерывным блоком**, в исходном порядке. Использовать `@layer page` для гарантии каскада.

### §5.6 Внедрить @layer-дисциплину

После того как `tokens.css + base.css + print.css + pages/*.css` готовы:
1. В `base.css` (как «первая в порядке загрузки») — декларация `@layer tokens, base, page, print;` (если ещё не выставлена в §5.4.1).
2. Содержимое:
   - `tokens.css`: `@layer tokens { :root { --... } }` — необязательно (variables работают вне layers); но для консистентности можно завернуть. Принять решение в `extra` отчёта.
   - `base.css`: `@layer base { ... }`.
   - `pages/<page>.css`: `@layer page { ... }`.
   - `print.css`: `@layer print { ... }` — опционально (если правила в `@media print`, layer не критичен; но declarative consistency полезна).
3. **Не оборачивать** `@font-face`, `@keyframes`, `@page` в `@layer` (некоторые из них some browsers expect at top level).

### §5.7 Заменить `check_trainer_css_layers.mjs` → `_v2`

1. Создать `tools/check_trainer_css_layers_v2.mjs` по дизайну из `reports/w1_0b_recon_report.md §7`:
   - **`tokens.css`**: только `:root`/`[data-theme]` с `--`-объявлениями. Запрещены другие селекторы, запрещён `!important`.
   - **`base.css`**: только селекторы из allowed-set (footprint ≥ 5 страниц, прочитать из `reports/w1_0b_artifacts/footprint_matrix.csv`). Запрещён `@media print` (только в print.css). Запрещён `!important`.
   - **`print.css`**: только `@media print { ... }` блоки + правила с префиксом `body.print-layout-active`. `!important` разрешён (legacy chrome-hide).
   - **`pages/<page>.css`**: каждый селектор ∈ `selectors_used_by(page)` из footprint-матрицы (плюс явно «промоутнутые» shared). Запрещён `@media print`. `!important` разрешён с warning'ом + счётчиком в выводе.
   - **Import-дисциплина** (per HTML): каждая prod-страница грузит **ровно** `tokens.css + base.css + (pages/<page>.css если есть) + (print.css если печатает)`. Allowed-set + порядок (`tokens → base → page → print`) — table в скрипте.
   - **`@layer`-декларация** присутствует в `base.css`, первая.
2. Запускать v2 параллельно со старым `check_trainer_css_layers.mjs` — оба должны быть зелёные на новой структуре.
3. **Удалить старый `check_trainer_css_layers.mjs`** только когда v2 стабильно зелёный и `trainer.css` физически отсутствует. Переименовать v2 → `check_trainer_css_layers.mjs` (без суффикса) для CI-совместимости. Или оставить v2-имя если CI допускает.

### §5.8 Удалить `tasks/trainer.css`

После того как:
- Все pages/* созданы.
- Все 18 prod + 1 smoke + 3 fixture HTML обновлены (§5.10).
- v2 governance зелёный.
- `tests/print-features.js` 36/0 (== baseline).

→ `rm tasks/trainer.css`.

### §5.9 Bump build

`node tools/bump_build.mjs`. Должен автоматически:
- Подхватить новые файлы (`tokens.css`, `base.css`, `print.css`, `pages/*.css`) в свой scan-список или обновить только существующие `?v=` references. **Если bump_build.mjs не видит новые файлы автоматически** — stop-ask, потребуется правка `tools/bump_build.mjs` (этот скрипт уже узкий в scope; правка allowed внутри §4 если узкая).
- Обновить `?v=` во всех импортах (HTML + JS) на новый build id.
- Обновить `version.json`.
- Обновить `app/build.js`.

### §5.10 Обновить `<link>` теги в 22 HTML-страницах

Цель: каждая страница грузит **ровно** свой минимальный набор, в порядке `tokens → base → page → print`.

Mapping (per W1.0b §3 + §6 + §8 OQB):

| HTML | tokens | base | page | print |
|---|---|---|---|---|
| `tasks/hw.html` | ✓ | ✓ | `pages/hw.css` | ✓ |
| `tasks/hw_create.html` | ✓ | ✓ | `pages/hw-create.css` | ✓ |
| `tasks/trainer.html` | ✓ | ✓ | `pages/trainer.css` | ✓ |
| `tasks/list.html` | ✓ | ✓ | `pages/list.css` | ✓ |
| `tasks/unique.html` | ✓ | ✓ | `pages/unique.css` | ✓ |
| `tasks/analog.html` | ✓ | ✓ | `pages/analog.css` (если создан) | ✓ |
| `home_student.html` | ✓ | ✓ | `pages/home-student.css` | — |
| `home_teacher.html` | ✓ | ✓ | `pages/home-teacher.css` | — |
| `tasks/stats.html` | ✓ | ✓ | `pages/stats.css` (если создан) | — |
| `tasks/my_students.html` | ✓ | ✓ | `pages/my-students.css` | — |
| `tasks/student.html` | ✓ | ✓ | `pages/student.css` | — |
| `tasks/my_homeworks.html` | ✓ | ✓ | `pages/my-homeworks.css` | — |
| `tasks/my_homeworks_archive.html` | ✓ | ✓ | `pages/my-homeworks.css` (тот же) | — |
| `tasks/profile.html` | ✓ | ✓ | `pages/profile.css` | — |
| `tasks/auth.html` | ✓ | ✓ | — (W1.0b §5.5.1) | — |
| `tasks/auth_callback.html` | ✓ | ✓ | — | — |
| `tasks/auth_reset.html` | ✓ | ✓ | — | — |
| `tasks/google_complete.html` | ✓ | ✓ | — | — |
| `tasks/home_teacher_combo_browser_smoke.html` | ✓ | ✓ | `pages/home-teacher.css` | — |
| `tests/fixture-print-css.html` | ✓ | ✓ | (по сценарию: какой page нужен) | ✓ |
| `tests/fixture-print-dialog.html` | ✓ | ✓ | (print-dialog в base, см. §5.4.6 — page не нужен) | ✓ |
| `tests/fixture-print-dialog-no-answers.html` | ✓ | ✓ | (то же) | ✓ |

В каждом HTML — заменить single `<link rel="stylesheet" href="./trainer.css?v=…">` на блок 2–4 `<link>`-ов в правильном порядке. `?v=` подставляется bump_build'ом на §5.9.

### §5.11 Run print-features baseline + сверка

`cd tests && node print-features.js > /tmp/after.txt 2>&1`. Сверить с `reports/w1_0b_artifacts/print_features_baseline.txt`:
```bash
diff reports/w1_0b_artifacts/print_features_baseline.txt /tmp/after.txt
```
Расхождений быть не должно (или должны быть минимальные косметические — например, timestamps; контент-различия = регрессия = stop-ask).

Сохранить итог в `reports/w1_1prime_artifacts/print_features_after.txt`.

### §5.12 E2E + ручной smoke

#### §5.12.1 Регресс existing e2e

```bash
npm run e2e
# Все spec'и: whf1, whf2-fix-1, ws1, любые другие student/teacher
```

Все должны быть зелёные. **Падение → stop-ask.**

#### §5.12.2 Ручной spot-check (минимум 5 страниц в браузере)

```bash
python3 -m http.server 8000
```

Открыть в Chrome incognito и сравнить с baseline (визуальная память + scroll-через):
- `http://localhost:8000/tasks/trainer.html` — главный тренажёр (среднее page).
- `http://localhost:8000/tasks/hw.html?token=<test>` — homework.
- `http://localhost:8000/tasks/auth.html` — auth (должен выглядеть так же, при том что pages/auth.css не существует).
- `http://localhost:8000/home_student.html` (с залогиненной student-сессией) — самая сложная (17 order-зависимых правил home-student).
- `http://localhost:8000/tasks/picker` или один из `home_*` — где много фичей.

Для каждой — скриншот в `reports/w1_1prime_smoke/`. Особое внимание home-student accordion (cascade-risk concentrator).

#### §5.12.3 Print spot-check

Открыть `tasks/trainer.html`, нажать print (Ctrl/Cmd+P), проверить preview визуально совпадает с baseline. Также сценарий `body.print-layout-active` через DevTools → emulate print → проверить chrome-hide, fig-cases.

### §5.13 Отчёт

`reports/w1_1prime_report.md` со структурой §10.

## §6. Данные / контракты / миграции

SQL не правится. `docs/supabase/runtime_rpc_registry.md` не меняется. Backend dev/prod-данные не модифицируются. JS-модули логически не меняются (только `?v=` через bump). Никаких миграций.

## §7. Риски и stop-ask точки

### Это **red-zone** волна

`tasks/trainer.css` — общий CSS-каркас, в списке red-zone §6.2 `CURATOR.md`. Плюс `tools/check_trainer_css_layers.mjs` — governance-скрипт, тоже red-zone. **Применяется усиленный режим:**
- scope lock обязателен (см. §3 и §4 — никаких других файлов).
- stop-ask на любую попытку шагнуть в `app/providers/supabase.js`, JS-модули с продуктовой логикой, `docs/supabase/*.sql`.
- план проверки обязан содержать e2e + ручной smoke (см. §9).
- скриншоты ручного smoke обязательны.

### Конкретные риски

1. **Cascade-конфликт пропущен и проявляется визуально.** W1.0b §5 говорит 2 реально cross-cutting правила + 17 home-student intra-page. Митигация: `@layer tokens, base, page, print` в base.css закрепляет каскад на уровне браузера, без зависимости от порядка `<link>` для cross-file случаев. Spot-check (§5.12.2) ловит визуально, e2e — функционально.
2. **`data-fig-*` figure stack ломается.** Селекторы используют сложные `:not()` цепочки (W1.0 §5.4), порядок чрезвычайно важен. Митигация: при переносе в `pages/<page>.css` (для страниц где fig-стек single) **переносить всеми правилами вместе**, в исходном порядке. Проверять визуально на trainer/hw/list/unique/analog в spot-check.
3. **Print regression** (например, какой-то custom-title или print-ans-line). Митигация: §5.11 diff print-features-output с baseline; падение = stop-ask.
4. **`@layer` совместимость браузеров.** `@layer` поддерживается во всех целевых (Chrome 99+, Safari 15.4+, Firefox 97+). Если оператор поддерживает старые версии — не используем `@layer`, fallback на дисциплину порядка `<link>` (которую linter v2 защитит). Текущее предположение: целевые браузеры поддерживают.
5. **bump_build.mjs не подхватывает новые файлы автоматически.** Если scan hardcoded на конкретные пути — нужна правка. **stop-ask с описанием** и предложением minimum-edit.
6. **Smoke/fixture файлы (`tests/fixture-print-*`)** грузят что-то специфичное, что не вписывается в новую структуру. Митигация: §5.10 mapping для них — минимум tokens+base+print; конкретный page-css если их сценарий это требует. Если не получается — stop-ask с предложением.
7. **`tasks/trainer.css` удалить или shim?** Решение: **удалить** (decision в §4.2). Если оператор предпочтёт shim для safety transition — это можно изменить в плане до старта.
8. **28 dead-кандидатов: что с ними?** Переносим как есть по их «фантомному» footprint (т.е. остаются в `tasks/trainer.css` → нужно решить, куда). W1.0b §6 — НЕ удаляем. Решение: оставить в `base.css` (если используются ≥1 страницей по нашему conservative footprint) или в одном из page'ей. Если dead truly (0 prod), но есть в footprint-матрице как "" — оставить в base.css с комментарием `/* TODO W1-cleanup: dead candidate, verify before removal */`. Решение для конкретных 28 — на исполнителе по footprint-матрице.

### Stop-ask точки (проектные дополнения к §6.3)

- Любая правка вне §4 — stop-ask.
- Попытка тронуть `app/providers/*`, `docs/supabase/*`, JS-модули `tasks/*.js` (кроме `tools/bump_build.mjs`/`check_trainer_css_layers*.mjs`) — stop-ask.
- Попытка «заодно унифицировать breakpoints» / «заодно ввести z-index шкалу» / «заодно снести dead» — stop-ask (все в §3 Out of scope).
- `tests/print-features.js` после split даёт **не 36/0** — stop-ask с diff'ом против baseline.
- E2E падает в spec'е, который не должен быть задет CSS-сплитом — stop-ask (значит, что-то всё-таки задели).
- Spot-check показывает визуальную регрессию (не косметическую, не subpixel) — stop-ask со скриншотом до/после.
- `@layer` не работает в одном из тест-браузеров — stop-ask, решение по fallback.
- `bump_build.mjs` требует правки логики (не только список файлов) — stop-ask.
- Файлы pages/*.css получаются неожиданно большими (>2× больше footprint-prediction) — stop-ask: значит, footprint-classification была неполной, перепроверить с куратором.

> **Режим работы: автономный.** Не останавливайся за подтверждением между шагами (§5.2–§5.13), не проси промежуточного ревью между page-extractions. Доведи работу до DoD и верни completion summary. Куратор принимает работу целиком.
>
> **Останавливайся (stop-ask) только в экстренных случаях:**
>
> 1. Попытка изменить файл вне §4.
> 2. Попытка зайти в Out of scope §3 или red-zone §6.2 `CURATOR.md` вне явно разрешённого (`tasks/trainer.css` + `tasks/trainer/*` + 22 HTML + `tools/check_trainer_css_layers*.mjs`).
> 3. План противоречит реальности: `reports/w1_0b_recon_report.md` смещён по нумерации, footprint-матрица CSV формат изменился, footprint-цифры разошлись с реальностью при random spot-check >5%.
> 4. DoD объективно недостижим без выхода за scope.
> 5. Governance-скрипт упал — старый или новый v2 — и причина не очевидна из diff'а.
> 6. Уязвимость / утечка креденшлов в обработанных файлах (маловероятно для CSS).
> 7. Задача распалась на две независимых.
> 8. Один и тот же page-extraction даёт визуальную регрессию 2+ раза подряд (даже после правки) — нужна смена подхода или признание, что footprint неполный.
> 9. Архитектурное решение, повлияющее на модули вне §4 (например, оказалось, что `@layer` ломает MathJax SVG в print).
> 10. **Проектная специфика W1.1':**
>     - (a) `tests/print-features.js` после split НЕ 36/0 — stop-ask с diff (это критический regression-индикатор).
>     - (b) `@layer` не поддерживается в одном из проверочных браузеров → нужно fallback-решение.
>     - (c) home-student accordion даёт визуальную регрессию (17 order-зависимых правил) — несмотря на единый блок-перенос → нужно рассмотреть `@layer` + specificity bump.
>     - (d) `bump_build.mjs` не подхватывает новые pages/*.css автоматически → нужно решение по правке.
>     - (e) dead-кандидат (например, `.theme-toggle`) на самом деле используется (нашли упоминание в неожиданном месте) → переклассифицировать.
>     - (f) `pages/<page>.css` получился пустым (0 эксклюзив, все «уехало» в base/shared) → не создавать файл, страница грузит только tokens+base, stop-ask с уточнением для HTML mapping'а.
>
> **Не экстренные случаи** (работай сам):
> - выбор порядка переноса селекторов внутри одного pages/*.css;
> - конкретное имя tokens (--accent vs --color-primary — следуй convention §5.2);
> - формат комментариев в новых файлах;
> - решение по wrappping `@layer print { ... }` или без;
> - перенос dead-кандидатов в base.css vs pages/*.css на основании footprint-матрицы.
>
> **Формат stop-ask:** какой пункт сработал, что обнаружено, варианты, рекомендация. Жди решения, работу не продолжай.

## §8. Критерии приёмки (DoD)

1. **Файлы созданы** по §4.1: `tasks/trainer/{tokens,base,print}.css` + `tasks/trainer/pages/<page>.css ×N` (без `pages/auth.css`). `tools/check_trainer_css_layers_v2.mjs` написан.
2. **`tasks/trainer.css` физически удалён** (`git status` показывает `D tasks/trainer.css`).
3. **Старый `tools/check_trainer_css_layers.mjs`** заменён на v2 (либо переименован, либо удалён + v2 переименован).
4. **18 prod + 1 smoke + 3 fixture HTML** обновлены на новую структуру `<link>` тегов согласно §5.10 mapping'у. `<link>` порядок: `tokens → base → page → print`.
5. **`tests/print-features.js` 36/0** — идентичен baseline `reports/w1_0b_artifacts/print_features_baseline.txt`.
6. **Все 4 governance-скрипта** (включая новый v2) — зелёные:
   ```bash
   node tools/check_runtime_rpc_registry.mjs
   node tools/check_runtime_catalog_reads.mjs
   node tools/check_no_eval.mjs
   node tools/check_trainer_css_layers_v2.mjs   # или новое имя после переименования
   ```
7. **E2E (npm run e2e)** — все existing spec'и (whf1, whf2-fix-1, ws1, любые student/teacher) зелёные. **Никаких регрессий.**
8. **Ручной spot-check 5 страниц** (§5.12.2) — никаких визуальных регрессий (скриншоты в `reports/w1_1prime_smoke/`).
9. **`node tools/bump_build.mjs` прогнан** — `version.json`, `app/build.js`, все `?v=` синхронны.
10. **`git diff --stat`** — изменения только в §4 и в bump-наборе. Никаких сюрпризов в `app/providers/*`, `docs/supabase/*`, других треков.
11. **`reports/w1_1prime_report.md`** создан и заполнен по §10.

## §9. План проверки

### §9.1 Pre-split sanity

```bash
node tools/check_runtime_rpc_registry.mjs
node tools/check_runtime_catalog_reads.mjs
node tools/check_no_eval.mjs
node tools/check_trainer_css_layers.mjs
cd tests && node print-features.js   # должно быть 36/0 как в baseline W1.0b
```

### §9.2 После каждого page-extraction (smoke)

После каждого `pages/<page>.css` создания + перенос HTML импортов:
- 4 governance (включая v2 если уже создан).
- Локальный browser-open соответствующей страницы (visually).

### §9.3 Final acceptance

```bash
# 1. Все 4 governance (включая v2)
node tools/check_runtime_rpc_registry.mjs
node tools/check_runtime_catalog_reads.mjs
node tools/check_no_eval.mjs
node tools/check_trainer_css_layers_v2.mjs   # или новое имя

# 2. Print baseline
cd tests && node print-features.js
# diff с reports/w1_0b_artifacts/print_features_baseline.txt → 0

# 3. E2E
npm run e2e

# 4. Bump
node tools/bump_build.mjs

# 5. git diff sanity
git diff --stat   # только §4 + bump

# 6. Ручной smoke 5 страниц + print preview
```

### §9.4 Final reality-checks для куратора

Перед ACCEPT куратор:
- `wc -l tasks/trainer/{tokens,base,print}.css tasks/trainer/pages/*.css` — суммарно близко к исходным 3930 строкам (±200, потерь не должно быть).
- Random spot-check 5 пар (селектор × страница) из `reports/w1_0b_artifacts/footprint_matrix.csv` — селектор должен быть в правильном новом файле.
- `grep -r "trainer\.css" tasks/ home_*.html index.html` — должно быть 0 ссылок (старый файл удалён, ссылки обновлены).

## §10. Отчётный артефакт

`reports/w1_1prime_report.md`:

1. **Резюме** (3–5 строк): что закрыто, билд, коммит, итоговый размер файлов (token KB, base KB, print KB, pages avg/max KB).
2. **DoD trace** — каждый пункт §8 с доказательством.
3. **Diff stats** (`git diff --stat`): новые файлы + удалённый `tasks/trainer.css` + 22 HTML + governance + bump.
4. **Структурная схема** результата (дерево `tasks/trainer/`).
5. **Latency наблюдение** (если успели измерить): page-load до/после split'а для 2–3 страниц (особенно для auth-страниц, которые теперь грузят только tokens+base).
6. **Cascade-conflict resolution log**: как именно решены 2 cross-cutting + 17 home-student (через `@layer` или через единый блок-перенос).
7. **Governance v2 описание**: что проверяет, какие инварианты, exit-codes.
8. **Print-features diff** vs baseline — должно быть 0 контентных расхождений.
9. **E2E прогон** — список spec'ов с результатами.
10. **Скриншоты ручного smoke** (5 шт, §5.12.2).
11. **Открытые follow-up для последующих волн** — что обнаружилось в процессе split'а:
    - реально dead-селекторы, которые надо снести (hygiene-волна).
    - probable tokens, которые надо склеить (например, 14px radius → 12 или 16).
    - cascade-конфликты, которые потребовали `!important` (если такие были — это сигнал, нужно тщательнее).
    - кандидаты на дальнейший split (например, popover utility).

---

## Что после W1.1'

После ACCEPT W1.1':
- `GLOBAL_PLAN.md §4` — W1.1' → ✅ закрыто; W1.2' → ⏭ следующая.
- `PROJECT_STATUS.md` — обновление baseline'а: монолит `tasks/trainer.css` декомпозирован, per-page editability и Claude Design-ready.
- **W1.2' — Claude Design onboarding rehearsal**. Прогон Claude Design на свежем codebase, снимок извлечённого design system, дочистка `tokens.css` если требуется. После W1.2' трек W1 закрыт, критический путь переходит на W2 (декомпозиция `tasks/picker.js`).
- (опц.) **hygiene-волны** — снос 28 dead-кандидатов, breakpoint унификация, z-index шкала, popover utility. Каждая отдельная.
- (опц.) **WHF2-fix-2** — если за это время оператор увидит iOS-репро (см. `GLOBAL_PLAN.md §6.3`), эту волну можно запускать параллельно W1.2' (треки не пересекаются).
