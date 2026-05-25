# W1_REPLAN — переплан декомпозиции `tasks/trainer.css` под Claude Design

Дата: 2026-05-25
Тип документа: куратор-уровневое решение по смене вектора волны (per `CURATOR.md §5` «При изменении приоритетов»).
Заменяет: рекомендацию Варианта D из `reports/w1_0_trainer_css_recon_report.md §12` и плановую форму подволн `W1.1` / `W1.2` из `GLOBAL_PLAN.md §4` (старая редакция).
Не отменяет: W1.0 recon как фактологический источник (карты, inventory, импорты, дубликаты — переиспользуются).

---

## §1. Мотивация смены варианта

`W1.0` (recon, ✅ `2026-04-23`) выдала 4 варианта split'а `tasks/trainer.css` (A — по слоям L0..L5; B — режимные chunks + page-sets; C — по feature-домену; D — гибрид «base + screen + print»). Рекомендован Вариант D — как минимально-рискованный, ~30–40% page-size win для не-print страниц, governance параметризуется без переписывания.

**Что изменилось 2026-05-25:** оператор подтвердил стратегическую цель на ближайшие месяцы — **целенаправленный редизайн всех экранов через инструмент Claude Design** (Anthropic Labs, запущен 2026-04-17; powered by Claude Opus 4.7; рендерит реальный код HTML/CSS/JS/React в Artifacts panel; читает codebase для построения design system; экспортирует handoff bundle в Claude Code). Это меняет функцию оптимизации W1 с «защита от регрессий печати + лёгкие лендинги» на:

1. **Точность извлечения design system** при Claude Design onboarding. Чем чище и структурированнее CSS-источник — тем точнее tokens (цвета, spacing, типографика) Claude Design извлечёт и тем «своё»-генерируемые экраны будут совместимы со сводным дизайном проекта.
2. **Изоляция страниц при handoff-интеграции.** Claude Design отдаёт код в репо через Claude Code. Если CSS — per-page, новый код уверенно кладётся / переписывает `<page>.css` без specificity-конфликтов с соседями. Если монолит — придётся встраиваться в общий файл, эскалируя `!important` (в текущем `trainer.css` уже 233 `!important`, см. recon §7.1).

**Под эту цель ни один из вариантов A–D не подходит.** A не даёт per-page win. B даёт частичный page-set win (auth/home), но не до уровня каждого экрана. C ближе по локальности, но per-feature, а не per-page. D даёт минимум и оптимизирует под другую цель (защита печати).

**Нужен Вариант E — per-page split с явным design-tokens слоем.**

## §2. Целевая форма (Вариант E)

```
tasks/
  trainer/
    tokens.css          # design system source: CSS variables (--accent, --space-2, --fs-md, ...)
    base.css            # resets, layout primitives, утилитарные shared-классы (~150 строк)
    print.css           # ВСЕ @media print + body.print-layout-active (L4 + L5, ~425 строк)
    pages/
      hw.css            # стили, используемые только tasks/hw.html
      hw-create.css     # → hw_create.html
      trainer.css       # → trainer.html
      list.css          # → list.html
      unique.css        # → unique.html
      analog.css        # → analog.html
      picker.css        # → если выделится (это JS-модуль, но у него куча CSS)
      home-student.css  # → home_student.html
      home-teacher.css  # → home_teacher.html
      stats.css         # → stats.html
      my-students.css   # → my_students.html
      student.css       # → tasks/student.html (карточка ученика)
      profile.css       # → profile.html
      my-homeworks.css  # → my_homeworks.html, my_homeworks_archive.html (общий)
      auth.css          # → auth.html, auth_callback.html, auth_reset.html, google_complete.html (общий)
      index.css         # → index.html, student.html (root + student landing), terms, privacy
```

Каждая страница грузит **минимально достаточный набор**: `tokens.css + base.css + <page>.css + (print.css если печатает)`. Точное число файлов на страницу: 3–4 вместо нынешнего одного monolith `trainer.css`.

**Что Вариант E даёт под цель Claude Design:**

- Onboarding читает `tokens.css` → извлекает design system **точно**, а не «средне из шума».
- Onboarding читает `pages/<page>.css` → понимает, какой контекст у каждой страницы.
- Handoff-bundle на конкретную страницу → Claude Code меняет только `<page>.css` (и возможно `tokens.css` если редизайн вводит новые tokens).
- Цена ошибки в design: правка `hw.css` физически не может задеть `picker.html`.

**Что Вариант E НЕ даёт (честно):**

- Локальность «screen + print одной фичи» (это Вариант C). Если редизайн `hw.html` затрагивает и печать — придётся править `pages/hw.css` (screen) и `print.css` (`@media print` selector'ы). Альтернатива: вынести print-куски в per-page-print файлы — но это усложняет cascade, лучше оставить один общий `print.css` пока.
- Полный divide на shared utilities. Если несколько страниц используют одну и ту же кнопку — она в `base.css`. Граница «что в base / что в page» решается в W1.0b на данных footprint-карты.

## §3. Что переиспользуется из W1.0, что выбрасывается

**Переиспользуется (≈80% recon-данных):**

- §2 Карта импортов 22 страниц (`reports/w1_0_trainer_css_recon_report.md §2`) — основа для определения page-set'ов.
- §3 Layer-map L0..L5 и §4 sub-blocks — границы для миграции (что было L1 идёт в page или base; что было L4/L5 идёт в print.css).
- §5 Class/data-attr inventory — список селекторов для footprint-карты.
- §6 Matrix `page × feature-group` — **частично уже есть данные per-page footprint**. Нужно дополнить, но не с нуля.
- §7 Дубликаты, `!important` плотность, breakpoints, литералы вместо `:root` — кандидаты в `tokens.css`.
- §8 JS/CSS связь — учесть при определении границ.
- §11 Open questions 1 (build-step vs `@import`), 3 (cross-browser print), 5 (governance) — остаются открыты для W1.0b.

**Выбрасывается (только финальная рекомендация):**

- §9 сравнение 4 вариантов и §10 числовая оценка под старую функцию оптимизации — устарели после смены цели. §12 итоговая рекомендация Варианта D — отменена.

**Tech-debt из §11, не критичный для replan:**

- OQ 6 (ToC sync), OQ 7 (`#2563eb` literal вне `:root` — это token-кандидат, поглощается W1.0b), OQ 8 (popover utility), OQ 9 (breakpoint unification), OQ 10 (dead `theme-toggle`) — хвосты, идут как hygiene после W1.

## §4. Новая структура подволн

| # | Волна | Тип | Статус | Ориентир объёма |
|---|---|---|---|---|
| **W1.0b** | Per-page footprint + design tokens recon | read-only | ⏭ следующая | 4–6 часов исполнителя |
| **W1.1'** | Physical split на `tokens + base + print + pages/*` | code | после W1.0b | средне, 1–2 дня |
| **W1.2'** | Claude Design onboarding rehearsal | hybrid (read codebase, write design-system report) | после W1.1' | 2–4 часа |

### §4.1 W1.0b — что должна выдать

1. **Per-page footprint map**: для каждой из 22 страниц — список селекторов из `trainer.css`, которые она **реально использует** (через `grep` HTML + JS на наличие класса/id/data-attr). Артефакт: матрица `selector × page`.
2. **Shared-vs-page классификация селекторов**:
   - Used by 1 page → кандидат в `pages/<page>.css`.
   - Used by 2–4 pages → решение: page-css каждой (дубль) или общая `shared/<group>.css` (или часть `base.css`). Зависит от объёма правил.
   - Used by 5+ pages → `base.css`.
3. **Design tokens extraction**: список повторяющихся литералов (цвета, spacing, font-size, border-radius, shadows) с количеством употреблений. Кандидаты в `tokens.css` как CSS variables. Уже частично есть в §7.3 recon (нужно расширить).
4. **Specificity / cascade conflict map**: какие правила сейчас работают только из-за порядка в monolith. Эти правила требуют дополнительной осторожности при per-page split (либо `@layer`, либо явное specificity bumping в per-page).
5. **Print-cross-page deps**: подтвердить, что `@media print` правила относятся к конкретным страницам (не к глобальному `body.print-layout-active` без page-условия). Это решает open question 4 из W1.0 §11 (что делать с print-dialog: вынести или оставить в `print.css`).
6. **Governance proposal**: как параметризовать / переписать `tools/check_trainer_css_layers.mjs` под Вариант E. Минимум: каждая `pages/<page>.css` не содержит `@media print` (только в `print.css`); `tokens.css` содержит только `:root { --... }` правила; `base.css` ограничен по объёму (например, ≤300 строк) — иначе деградирует обратно к monolith.
7. **Решение по open questions 1, 3, 5 из W1.0 §11** под новый разрез — какой механизм импортов (явные `<link>` vs `@import`), какой cross-browser print порядок, нужен ли page-aware linter.

W1.0b — **read-only**, не правит код. Отчёт в формате аналогичном `reports/w1_0_trainer_css_recon_report.md`.

### §4.2 W1.1' — что делает

Физический split по данным W1.0b. Создание директории `tasks/trainer/`, перенос правил в новые файлы по footprint-классификации, обновление `<link>` тегов в 22 HTML-страницах, расширение `tools/check_trainer_css_layers.mjs` под новые инварианты. Обязательно: e2e + `tests/print-features.js` после каждой группы перенесённых правил.

Объём бамп'а — ~22 HTML × 3–4 link = 66–88 `<link>` тегов под `?v=...`, плюс новые CSS-файлы. `tools/bump_build.mjs` должен поглотить это автоматически.

### §4.3 W1.2' — что делает

**Не код-волна.** Прогон Claude Design onboarding (на свежем codebase после W1.1' merge) в тестовом режиме. Снимок извлечённого design system (tokens, components, типографика). Если onboarding извлекает «средне» — дочистить `tokens.css` (например, имена variables, объединить близкие значения) и повторить. После W1.2' — Claude Design готов к продуктивному использованию.

## §5. Open questions для W1.0b (выносим из W1.0 §11)

- **OQ 1 (build-step):** при per-page разрезе число `<link>` тегов растёт. Решение «явные `<link>` без сборки» по-прежнему работает, но порядок становится критичнее (`tokens → base → page → print`). Решается дисциплиной HTML-шаблонов; build-step не обязателен. Подтвердить в W1.0b §4.
- **OQ 3 (cross-browser print):** при отдельном `print.css` подтвердить, что Chrome/Firefox корректно собирают стиле-лист для PDF-output. Проверка в W1.0b через `tests/print-features.js` baseline.
- **OQ 5 (page-aware linter):** при per-page разрезе linter становится более важным, чем при D, потому что деградация back-to-monolith реальнее. Дизайн linter'а в W1.0b §6.
- **NEW OQ A (Claude Design integration):** какой формат tokens предпочитает Claude Design — стандартные CSS custom properties (`--color-accent: #2563eb`) или какой-то свой манифест? Проверить в W1.2' rehearsal; в W1.0b принять стандартный формат как дефолт.
- **NEW OQ B (page boundaries для группированных страниц):** объединять ли `auth.html + auth_callback + auth_reset + google_complete` в одну `auth.css` или каждой свой файл? Аналогично `my_homeworks + my_homeworks_archive`. Решение в W1.0b на основе footprint-overlap (если overlap >70%, объединяем).

## §6. Риски и трейдоффы

| Риск | Митигация |
|---|---|
| W1.0b выдаст 4–6 часов работы, которая частично дублирует W1.0 | Заранее зафиксировано в §3: 80% recon-данных переиспользуются, W1.0b делает только дельту per-page footprint + tokens-кандидаты + новый governance design. Не «с нуля». |
| Per-page split увеличивает число файлов с 1 до ~17. Управление сложнее | Структура `tasks/trainer/pages/*.css` явная, имена соответствуют HTML. Linter (W1.0b §6) защищает от деградации. |
| Claude Design может не дать обещанного качества onboarding (research preview, риск изменений API) | W1.2' rehearsal — тестовый прогон, не зависим от code-волны. Если onboarding оказывается слабым — `tokens.css + base.css + pages/*.css` всё равно даёт полезную структуру для ручного редизайна. **Per-page split полезен сам по себе**, не только под Claude Design. |
| Specificity-конфликты, которые сейчас решаются порядком в monolith, проявятся при разделении | W1.0b §4 (conflict map) их находит ДО split. На самом split можно использовать CSS `@layer` (поддерживается во всех современных браузерах) для эксплицитного управления каскадом — без `!important`-эскалации. |
| Сборка handoff-bundle Claude Design может ожидать конкретные имена tokens / классов | Решается в W1.2' rehearsal до продуктивного использования. |

**Главный трейдофф** относительно Варианта D: **W1.0b + W1.1' стоят дороже** (≈ +1 разведочная волна, +0.5–1 день на split с большим числом файлов), чем D-вариант старого плана. **Но**: вариант 1 из предыдущего обсуждения (D сейчас → W4 per-page потом) стоит ещё дороже — split screen.css физически делается дважды, и между ними Claude Design стартует с грязным онбордингом. Переплан в Е — разовая инвестиция.

## §7. Decision point для оператора

Если оператор подтверждает переплан — следующий шаг:
1. **GLOBAL_PLAN.md** обновляется (§4 W1 описание + §10 прогресс-таблица): подволны переименовываются в W1.0b / W1.1' / W1.2', старые W1.1 (Variant D) и W1.2 (screen-public) переводятся в ❌ отклонено / 🔬 отменены с пометкой «replaced by W1_REPLAN.md».
2. **W1_0b_PLAN.md** пишется куратором в формате `CURATOR.md §6` (полный план волны).
3. Передаётся исполнителю «прими роль исполнителя на W1.0b» либо проходится самим куратором.

Если оператор хочет дополнительно проверить — рекомендую:
- беглый прогон Claude Design на текущем монолитном `trainer.css` (без W1) — чтобы увидеть, какой design system extract'нется сейчас. Это **дешёвая проверка тезиса**: если результат «средний шум» — переплан подтверждается; если результат «удивительно неплохо» — возможно, обходимся меньшей работой.
- если есть iPhone Telegram-репро WHF2-fix-2 в очереди (см. `GLOBAL_PLAN.md §6.3`) — оператор может закрыть его параллельно с W1.0b исполнителем, треки не пересекаются.

## §8. Что НЕ делаем в этом переплане

- Не правим Variant D «на лету» — это другой инструментарий.
- Не открываем новый track «design system as code» — `tokens.css` это шаг, не отдельный трек.
- Не вводим build-step / SCSS / PostCSS — остаёмся «без сборки» (инвариант `GLOBAL_PLAN.md §6`). CSS variables и `@layer` дают всё нужное нативно.
- Не трогаем JS-модули (`tasks/picker.js` и др.) — это треки W2 / W3, не сдвигаются.
- Не меняем W7 / WS / WHF параллельные треки.

---

**Готов к decision:** оператор подтверждает переплан → пишу `W1_0b_PLAN.md` в формате `CURATOR.md §6` и обновляю `GLOBAL_PLAN.md`.
