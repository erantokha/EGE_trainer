# W1.2' — Claude Design onboarding rehearsal на свежем codebase

Дата создания: 2026-05-26
Тип волны: **гибридная** (operator-driven onboarding-trigger + handoff + executor-driven анализ + опциональный код-cleanup в `tasks/trainer/tokens.css`).
Триггер: ACCEPT W1.1' (2026-05-25). Codebase теперь в Варианте Е (`tasks/trainer/{tokens,base,print}.css + pages/*.css`), готов к Claude Design onboarding.
Связанные волны: W1.0 (✅), W1.0b (✅), W1.1' (✅), W1_REPLAN.md (вектор), W2 (после закрытия W1 — декомпозиция `tasks/picker.js`).
Ориентир объёма: **~1.5 часа** (operator: 15–25 мин активного внимания на Claude Design onboarding + click Export → Handoff to Claude Code; executor: 30–90 мин на парсинг handoff bundle + gap-анализ + опциональный cleanup tokens.css + отчёт).

**Архитектурно важно (обновлено 2026-05-26):** Claude Design имеет встроенный **Export → Handoff to Claude Code** — bundle с design files + design system tokens + component structure + intent приходит в **ту же Claude Code-сессию** как structured data, без скриншотов и ручного копирования. См. `https://myclaw.ai/blog/claude-design`, `https://claude.com/resources/tutorials/using-claude-design-for-prototypes-and-ux`. Это canonical путь, использованный здесь. Альтернатива (Playwright MCP — Claude Code сам водит браузер в claude.ai) — over-engineering для одноразового onboarding'а, не применяется.

---

## §1. Цель

Прогнать **Claude Design onboarding** (Anthropic Labs, powered by Claude Opus 4.7) на свежем codebase'е после W1.1' и получить ответ на единственный вопрос: **готов ли проект к продуктивному использованию Claude Design для целенаправленного редизайна экранов**, или нужны точечные доработки в `tasks/trainer/tokens.css` (и, возможно, `base.css`).

На выходе:
- **снимок извлечённого design system** (что Claude Design «увидел» в codebase: цвета, типографика, spacing, components-словарь);
- **gap-анализ** (что мы заложили в `tokens.css` vs что Claude Design извлёк): расхождения, дубли, пропуски;
- **decision-точка** для оператора: трек W1 закрывается (Claude Design ready) ИЛИ открывается опциональная hygiene-волна по доводке `tokens.css`;
- если в процессе обнаружится узкий блокер для Claude Design в нашей структуре — **точечный cleanup `tokens.css`** (только tokens; `base.css` и `pages/*.css` не трогаем — это уже было бы W1.3).

Эта волна **завершает трек W1**. После ACCEPT W1.2' критический путь переходит на **W2** (декомпозиция `tasks/picker.js`).

## §2. Контекст и мотивация

`W1_REPLAN.md` (2026-05-25) описывал W1.2' как «прогон Claude Design на свежем codebase, снимок извлечённого design system, дочистка tokens.css при необходимости». После W1.1' (✅ 2026-05-25) у нас:

- Чистый `tasks/trainer/tokens.css` (98 строк) с явными CSS variables в `:root`: `--accent`, `--fs-{2xs,xs,sm,md,lg,xl,2xl}`, `--space-{1..6}`, `--radius-{sm,md,lg,pill}`, `--tint-*`, `--dur-*`.
- 96 base-селекторов в `base.css` (footprint ≥ 5 страниц) + figure/card subsystem.
- 9 per-page файлов в `pages/*.css`.
- 22 prod/smoke/fixture HTML с правильным порядком `<link>` (`tokens → base → page → print`).

Claude Design (по `https://www.anthropic.com/news/claude-design-anthropic-labs`, `https://claude.com/resources/tutorials/using-claude-design-for-prototypes-and-ux`):
- **Читает codebase + design files** при onboarding → строит design system проекта.
- Дальнейшие генерации **используют твои цвета, типографику, компоненты автоматически**.
- **Export → Handoff to Claude Code** (одна кнопка): bundle с design files + design system tokens + component structure + intent приходит в ту же Claude Code-сессию как structured data. Цитата production-источника: «one-click Export sends the whole thing to Claude Code as a handoff bundle. Claude Code picks it up... This happens in the same conversation, with the same model family, with no JPEGs passed between rooms».
- Powered by Claude Opus 4.7 (та же модель, что мы используем сейчас), Pro/Max/Team/Enterprise.

**Стратегический контекст:** оператор подтвердил `2026-05-25` цель «целенаправленный редизайн всех экранов через Claude Design» на ближайшие месяцы. W1.2' — последняя tooling-проверка ДО первого продуктивного использования. Если выяснится, что Claude Design плохо извлекает наш design system — лучше узнать СЕЙЧАС (одна tokens-волна), чем потерять часы на каждом редизайн-цикле.

## §3. Out of scope

- **Не редизайнить страницы** через Claude Design. Эта волна — **rehearsal onboarding'а**, не первое продуктивное использование. Если Claude Design предложит улучшения вёрстки конкретной страницы — это материал для **W2+ продуктовых волн**, не W1.2'.
- **Не трогать `base.css`, `print.css`, `pages/*.css`**. Если cleanup нужен глубже tokens.css — это уже **W1.3** (новая волна, отдельный план). W1.2' имеет право касаться **только `tokens.css`**.
- **Не вводить новые design tokens из головы.** Любые изменения tokens.css должны быть data-driven (что Claude Design извлёк / что предложил / что не нашёл).
- **Не менять структуру `tasks/trainer/`** (никаких новых файлов, переименований).
- **Не править governance** (`tools/check_trainer_css_layers.mjs`) — он валидирует tokens.css только на «только :root, нет !important, нет @media». Любые tokens-правки в этих рамках проходят без правок скрипта.
- **Не вводить build-step** (Sass/PostCSS) даже если Claude Design предложит — инвариант «без сборки» (`GLOBAL_PLAN.md §6`).
- **Не трогать другие треки** (WS, W7, WHF, W2, W3 — все стабильны).
- **Не публиковать дизайн / handoff** из Claude Design в репо во время W1.2'. Только observe → report → optionally cleanup tokens.

## §4. Затрагиваемые файлы

### 4.1 Новые файлы (всегда)

- `reports/w1_2prime_report.md` — основной отчёт со структурой §10.
- `reports/w1_2prime_artifacts/` — поддиректория со scratch-данными:
  - `handoff_bundle.{json,md}` — **главный артефакт**: содержимое bundle'а из Export → Handoff to Claude Code, сохранённое исполнителем «как есть» из приходящей в сессию структуры. Включает design tokens, components, intent, design-files-references. Формат — какой пришёл (JSON / структурированный Markdown / иной).
  - `onboarding_summary.md` — текстовый summary onboarding'а (что Claude Design сказал в text-output до Export). Скопировано оператором из claude.ai-окна или взято из bundle, если содержится там.
  - `comparison_tokens.md` — gap-анализ: наш `tokens.css` vs извлечённый Claude Design'ом design system (что совпало, что Claude Design «не увидел», что предложил добавить). Строится исполнителем из handoff bundle напрямую — без OCR скриншотов.
  - `generated_component_sample.{md,json,png}` — пример сгенерированного Claude Design компонента (если оператор запросил generation до Export). Скорее всего попадёт в bundle как часть design-files; скриншот опционален для визуальной оценки исполнителем.
  - (опц.) `extracted_design_system.png` — скриншот UI Claude Design **только если** оператор хочет дополнительно зафиксировать визуальное представление, отличающееся от структурированного bundle (например, цветовое представление палитры). Не критично — handoff bundle несёт raw values.

### 4.2 Возможно изменяемые файлы (опционально, по итогам §5.6)

- `tasks/trainer/tokens.css` — **только если** анализ показал явный pre-existing блокер для Claude Design (например: токен с нечётким именем, который вводит модель в заблуждение; missing fallback на близкий валюй; неоднозначное разделение `--fs-md` vs `--fs-sm`).

### 4.3 Cache-busting (если изменён tokens.css)

- `app/build.js`, `version.json`, `?v=` в импортах (через `tools/bump_build.mjs`). **НЕ запускать**, если tokens.css не менялся.

**Никаких других продуктовых файлов.**

## §5. Пошаговый план

> **Task-tracking (обязательно для исполнителя):** в начале работы создай TaskList через `TaskCreate` с пунктами §5.1–§5.7. По мере выполнения обновляй статусы через `TaskUpdate`. Для гибридной волны это особенно важно — оператор не сразу видит, на каком этапе (operator-driven часть vs executor-driven часть).

### §5.1 Pre-flight

1. `git pull origin main`, working tree чистый.
2. Перечитать:
   - `reports/w1_1prime_report.md` целиком (что после W1.1', что в tokens.css).
   - `tasks/trainer/tokens.css` (98 строк — небольшой, прочитать целиком).
   - `W1_REPLAN.md §1` и §2 (мотивация Claude Design vector).
3. Проверить **доступ оператора к Claude Design**:
   - Подписка Pro / Max / Team / Enterprise (Claude Design доступен только этим уровням).
   - claude.ai открывается, есть иконка палитры в левой навигационной панели.
   - **Если доступа нет** — stop-ask, оператор апгрейдит подписку или волна откладывается.

### §5.2 Claude Design onboarding + Handoff to Claude Code (operator-driven, ~15–25 мин активного внимания)

**Это шаг оператора, не Claude Code-исполнителя.** Оператор:

1. Открывает `claude.ai`, кликает по иконке палитры (Claude Design).
2. Начинает onboarding для нового проекта. Указывает:
   - Связь с codebase. Если Claude Design позволяет указать GitHub-репозиторий — `erantokha/EGE_trainer`, ветка `main`. Если только локально — экспортирует / делится конкретными файлами:
     - `tasks/trainer/tokens.css` (главное — design tokens source)
     - `tasks/trainer/base.css` (общие компоненты)
     - 2–3 представительных `pages/*.css` (например, `home-student.css` как самый сложный, `hw-create.css` как продуктовый)
     - 2–3 HTML-страницы как образцы (например, `home_student.html`, `tasks/auth.html`)
   - Тип проекта: web app (Russian-language EGE math trainer).
   - Опционально — указать существующие design-файлы (Figma если есть; у нас нет — НЕ выдумывать).
3. **Запускает onboarding-процесс.** Ждёт, пока Claude Design проанализирует input (~5–15 мин, passive ожидание — оператор может отходить).
4. **(опционально, до Export) запрашивает sample-компонент** в стиле проекта: «Generate a button matching this project's style» или «Generate a card matching this project's existing layout». Sample попадёт в handoff bundle на следующем шаге.
5. **Click Export → Handoff to Claude Code.** Одна кнопка. По официальному описанию Anthropic и production-источникам, handoff bundle содержит: design files + design system tokens + component structure + intent. **Это canonical путь** — никаких manual screenshots для палитры/типографики/spacing не требуется, Claude Design отдаёт структурированные данные напрямую в Claude Code-сессию.
6. **Bundle приходит в текущую Claude Code-сессию** как structured input. Исполнитель сохраняет содержимое в `reports/w1_2prime_artifacts/handoff_bundle.{json,md}` «как есть» (без модификаций — для воспроизводимости и спорных моментов §5.5).
7. (опц.) Если Claude Design дал в text-окне дополнительные замечания о codebase, не вошедшие в bundle — оператор копирует их в `onboarding_summary.md` (это ~3 мин, не обязательно).

**Если Claude Design не запускается / падает / Export → Handoff недоступен / bundle приходит пустой** — stop-ask, оператор и куратор решают:
- ждать stabilization (Claude Design всё ещё research preview, возможны нестабильности);
- продолжать с meaningful subset (только text-output из onboarding'а через manual copy);
- отложить W1.2' и закрыть W1 без rehearsal'а (acceptable risk).

**Если оператор хочет полную автоматизацию шага 2** (без любых ручных кликов): альтернативный путь через Playwright MCP / Playwright CLI существует (`claude.com/plugins/playwright`, Microsoft в 2026 рекомендует Playwright CLI — 4× меньше токенов), но требует setup-chore'а с auth-cookies для claude.ai. Для одноразового onboarding'а **не рекомендуется** — нативный Export → Handoff проще и предсказуемее. Stop-ask, если оператор настаивает.

### §5.3 Gap-анализ (executor-driven, ~15–40 мин)

После того как handoff bundle получен и сохранён (§5.2.6), executor:

1. Открывает `tasks/trainer/tokens.css`, выписывает наши tokens в одну колонку.
2. Парсит `handoff_bundle.{json,md}` — извлекает раздел design system tokens (структурированные данные, **без OCR-разбора скриншотов**). По цитате источника, bundle включает «the design system tokens» как часть payload'а.
3. Создаёт `reports/w1_2prime_artifacts/comparison_tokens.md` — табличное сравнение:
   ```
   | Категория | Наш token | Значение | Claude Design извлёк | Совпадение | Комментарий |
   |---|---|---|---|---|---|
   | accent | --accent | #2563eb | да, как 'primary' | ✓ | Имя у нас лучше |
   | font-size | --fs-md | 14px | да, как 'body-md' | ✓ | — |
   | font-size | --fs-2xs | 11px | НЕ извлёк | ✗ | freq=5, claude видимо считает one-off; ок, держим |
   | spacing | --space-3 | 6px | да | ✓ | — |
   | spacing | (нет такого) | — | предложил --space-7=14px | ➕ | claude увидел дублирующиеся 14px в base — это `--fs-md` рядом, не нужен |
   | radius | --radius-sm | 10px | да, как 'rounded-sm' | ✓ | — |
   ```
4. Категоризирует расхождения:
   - **`green` (ничего делать не надо):** Claude Design корректно увидел наши tokens, может быть с другими именами (наши имена остаются — Claude Design адаптируется).
   - **`yellow` (decision required):** Claude Design предложил что-то новое или иначе сгруппировал — может быть полезным улучшением, но не обязательным. Записать в follow-up.
   - **`red` (требует tokens.css fix):** Claude Design фундаментально не понимает наш tokens (например, не извлёк `--accent` потому что мы используем нестандартный синтаксис). Это **триггер §5.6**.

### §5.4 Качество генерации (если §5.2.4 был сделан)

Если оператор запросил у Claude Design генерацию sample-компонента до Export — он уже в handoff bundle как часть design-files / components-секции. Executor:
1. Извлекает sample из bundle (markup + tokens-references).
2. Опционально берёт скриншот (из bundle / отдельный PNG, если оператор приложил).
3. Оценивает:
   - Использует ли сгенерированный компонент наши tokens (по `var(--accent)`, `var(--space-*)`, `var(--fs-*)` в разметке)?
   - Стилистически вписывается ли в существующий UI (рассмотреть рядом с реальной страницей из `reports/w1_1prime_smoke/` через сравнительный мысленный эксперимент)?
4. Записывает оценку в `reports/w1_2prime_artifacts/comparison_tokens.md` отдельной секцией «Generated sample quality».
5. Это **информативный** шаг, не gate — даже плохая генерация sample'а в первом прогоне не повод отменять трек, нужен **анализ почему** (либо tokens неполные, либо Claude Design ещё learning).

### §5.5 Decision-таблица

В `reports/w1_2prime_report.md §6` — **явная таблица** с тремя возможными исходами:

| Исход | Условие | Действие |
|---|---|---|
| **GREEN: Claude Design ready** | Все наши tokens извлечены (или эквивалентно перепаразированы); sample-компонент стилистически в проекте; никаких red-расхождений | W1.2' закрывается ✅ без правки tokens.css. W1 трек закрыт, переход на W2. |
| **YELLOW: minor cleanup** | Есть один-два red-расхождения, легко исправимы в tokens.css (rename / merge tokens / явная аннотация) | §5.6 cleanup + повторный rehearsal §5.7. |
| **RED: structural mismatch** | Claude Design не понимает codebase на фундаментальном уровне (например, не извлёк цветовую систему вовсе; не видит base.css). | Stop-ask: открываем волну W1.3 (структурный cleanup) — за пределами W1.2'. |

### §5.6 (опционально) Cleanup tokens.css

**Только при YELLOW исходе §5.5.** Точечные правки в `tasks/trainer/tokens.css`:

- **Rename token** (если Claude Design лучше понимает другое имя — например, `--accent` ↔ `--color-primary`). Sed-замена через grep-проверку всех потребителей (`grep -rn "var(--accent)" tasks/trainer/`) → правка во всех местах, не только в tokens.css.
- **Merge близких tokens** (если Claude Design объединил `--fs-sm` (13px) и `--fs-md` (14px) в одно, и наши значения отличаются на 1px — рассмотреть склейку). Решение в комментарии tokens.css + правка call-site'ов.
- **Добавить missing token**, если Claude Design настойчиво нашёл что-то полезное, чего у нас нет (например, `--shadow-elevated`). Только если есть real footprint в codebase'е (grep на `box-shadow: 0 4px 12px` — есть 3+ употребления → добавляем).
- **Удалить unused token**, если Claude Design не видит его в codebase'е → grep на `var(--xyz)` → 0 употреблений → удалить.

**После cleanup'а:**
- `node tools/check_trainer_css_layers.mjs` — должен оставаться зелёным (tokens.css инварианты сохранены).
- `node tools/bump_build.mjs` — если tokens.css изменён (новый `?v=` для tokens.css).
- Spot-check визуально 2–3 страницы (`home_student`, `auth`, `trainer`) — никаких визуальных регрессий от rename/merge tokens.

### §5.7 (опционально) Re-rehearsal Claude Design

**Только если §5.6 был сделан.** Оператор повторно прогоняет Claude Design onboarding после cleanup'а tokens.css, затем снова Click Export → Handoff to Claude Code (тот же путь, что в §5.2.5). Сравнивает с первым прогоном:
- Все ли red-расхождения ушли?
- Появились ли новые проблемы?
- Качество генерации sample-компонента улучшилось?

Артефакты второго прогона — в `reports/w1_2prime_artifacts/rehearsal_2nd/handoff_bundle.{json,md}` + `comparison_tokens.md` (delta).

Если после второго прогона всё ещё RED → stop-ask, открываем W1.3 (структурный cleanup за пределами W1.2').

Operator time на §5.7: ~10–20 мин (повторный onboarding + Export). Executor parses delta автоматически.

### §5.8 Отчёт

`reports/w1_2prime_report.md` со структурой §10.

## §6. Данные / контракты / миграции

Никаких. SQL не правится. Backend не модифицируется. `tasks/trainer/tokens.css` если меняется — только rename/merge/add/remove CSS variables, без структурных изменений.

## §7. Риски и stop-ask точки

### Это **НЕ red-zone** волна

`tasks/trainer/tokens.css` НЕ в списке red-zone §6.2 `CURATOR.md`. Если cleanup потребуется — стандартный режим, узкий scope, без расширенных stop-ask'ов (в отличие от WHF2-fix-1 и W1.1' которые тронули auth-flow и общий CSS-каркас).

### Конкретные риски

1. **Claude Design — research preview.** Может быть нестабилен, формат handoff bundle может измениться без предупреждения, доступ через UI claude.ai (не публичный API). Митигация: §5.2 stop-ask «если Claude Design не запускается или Export → Handoff недоступен».
2. **Handoff bundle приходит в неожиданном формате / пустой / с искажениями.** Без чётко документированного контракта на формат, который Claude Design выдаёт (research preview), bundle может отличаться от ожиданий. Митигация: §5.2.6 сохранение bundle «как есть» для воспроизводимости; §5.5 трехоборотный decision-фрейм допускает «structural mismatch» как валидный RED-исход.
3. **Onboarding читает по-разному при разных input'ах** (GitHub-link vs file-upload vs subset файлов). Митигация: §5.2.2 фиксированный набор файлов для воспроизводимости; если результаты сильно varies — это сигнал для оператора, не блокер.
4. **Оператор не имеет подписки Pro/Max.** Митигация: §5.1.3 явная проверка.
5. **Cleanup tokens.css каскадирует.** Если rename `--accent` → `--color-primary` забываем обновить хоть одно место → визуальная регрессия. Митигация: §5.6 строгий grep всех использований до и после правки + spot-check 2–3 страниц.
6. **Cleanup начинает «расти»** (хочется заодно подправить базовую палитру; добавить shadows; систематизировать spacing). Митигация: §3 явный out-of-scope, stop-ask по trigger 10c при любой попытке выйти за tokens.css.
7. **Sanitization handoff bundle забыта.** Bundle может содержать GitHub PAT (если оператор подключал репо через PAT), Bearer-tokens из internal-запросов и т.д. Митигация: §9.5 обязательная sanitization перед коммитом, конкретные grep-паттерны.

### Stop-ask точки (проектные дополнения к §6.3)

- Попытка изменить файл вне §4 — stop-ask.
- Попытка править `base.css` / `print.css` / `pages/*.css` — stop-ask (это W1.3 или W2+).
- Claude Design недоступен / нестабилен — stop-ask, решение оператора по продолжению.
- §5.5 даёт RED исход (structural mismatch) — stop-ask, открываем W1.3 отдельно.
- Cleanup §5.6 требует более 10 правок в tokens.css — stop-ask: значит, мы вышли за rename/merge/add/remove формат, нужно реструктурирование.
- Cleanup ломает 2+ визуальных spot-check'а — stop-ask, rollback изменений.
- Если оператор хочет «заодно сделать редизайн» через Claude Design в этой волне — stop-ask: это W2+ продуктовая волна, не W1.2'.

> **Режим работы: автономный** (с учётом гибридной природы — operator-driven §5.2, executor-driven §5.3–§5.8). Между шагами оператор и executor могут обмениваться (executor ждёт артефакты §5.2). Когда executor получает артефакты — доводит §5.3–§5.8 до DoD без промежуточных stop-ask'ов на «продолжать ли cleanup».
>
> **Останавливайся (stop-ask) только в экстренных случаях:**
>
> 1. Попытка изменить файл вне §4.
> 2. Попытка зайти в Out of scope §3.
> 3. План противоречит реальности (`tasks/trainer/tokens.css` не существует / структурно отличается от ожидаемого; Claude Design UI изменился настолько, что §5.2 шаги невалидны).
> 4. DoD объективно недостижим без выхода за scope.
> 5. Governance-скрипт упал.
> 6. Уязвимость / утечка креденшлов (например, в скриншотах Claude Design — Bearer-токены, email-ы).
> 7. Задача распалась на две независимых.
> 8. Один и тот же подход не даёт результат 2+ раз подряд (например, два прогона Claude Design дают принципиально разный extract — нестабильность инструмента).
> 9. Архитектурное решение, повлияющее на модули вне §4.
> 10. **Проектная специфика W1.2':**
>     - (a) Claude Design недоступен у оператора (нет подписки / нестабильность) — stop-ask.
>     - (b) §5.5 даёт RED исход — stop-ask, открываем W1.3.
>     - (c) Cleanup §5.6 затрагивает >10 правок tokens.css — stop-ask.
>     - (d) Cleanup ломает spot-check — stop-ask с описанием регрессии.
>     - (e) Оператор просит «заодно отредизайнить страницу через Claude Design в этой волне» — stop-ask: это продуктовая волна, не W1.2'.
>     - (f) В Claude Design artifacts обнаружены утечки (Bearer-токены в скриншотах browser DevTools и т.п.) — stop-ask, sanitization перед коммитом.
>
> **Не экстренные случаи** (работай сам):
> - формат таблицы comparison_tokens.md;
> - имена файлов в `reports/w1_2prime_artifacts/`;
> - какой именно sample-компонент попросить у Claude Design (button / card / form input — на твой выбор);
> - решение `green` vs `yellow` если результат на границе (склоняйся к `green` — не доделывать ради perfection'а, проект уже Claude Design-ready по основным tokens).
>
> **Формат stop-ask:** какой пункт сработал, что обнаружено, варианты, рекомендация. Жди решения, работу не продолжай.

## §8. Критерии приёмки (DoD)

1. **Claude Design onboarding выполнен + Handoff to Claude Code триггернут** или явно зафиксирована недоступность с обоснованием (§5.2). Артефакты в `reports/w1_2prime_artifacts/` (минимум: `handoff_bundle.{json,md}` как структурированный output; опц. `onboarding_summary.md` для text-output замечаний из claude.ai-окна).
2. **Gap-анализ выполнен**: `comparison_tokens.md` с таблицей наш / Claude Design / совпадение / комментарий для каждого token (наших ≈ 25–30 штук).
3. **Decision-таблица §5.5 заполнена** в отчёте: один из трёх исходов (GREEN / YELLOW / RED) выбран с обоснованием.
4. **Если YELLOW**: cleanup tokens.css выполнен в пределах §5.6 границ (rename/merge/add/remove, ≤10 правок); re-rehearsal §5.7 прогнан и зафиксирован.
5. **Если GREEN**: tokens.css не менялся, переходим напрямую к §10 отчёту.
6. **Если RED**: stop-ask **до начала cleanup'а**, открывается W1.3 отдельным планом.
7. **Sanitization артефактов**: handoff bundle и опциональные скриншоты Claude Design очищены от чувствительных данных (Bearer-tokens / JWT в headers если bundle их содержит; email-ы prod-пользователей; внутренние GitHub-токены если оператор приложил какие-то export'ы).
8. **Sanity governance** (до и после, если cleanup был): `check_runtime_rpc_registry`, `check_runtime_catalog_reads`, `check_no_eval`, `check_trainer_css_layers` — все exit 0.
9. **Если cleanup был — bump_build прогнан**: `version.json`, `app/build.js`, `?v=` в импортах синхронны.
10. **`git diff --stat` узкий**:
    - GREEN: только `reports/w1_2prime_*`.
    - YELLOW: + `tasks/trainer/tokens.css` + bump-набор.
    - Никаких изменений в `base.css`, `print.css`, `pages/*.css`, `tools/*`, `app/**/*.js` (кроме `?v=`-бампа).
11. **Отчёт `reports/w1_2prime_report.md`** создан и заполнен по §10.
12. **W1 трек явно объявлен закрытым** в отчёте §1 (если исход GREEN или YELLOW after-cleanup) или явно объявлено, что W1 не закрыт и открыт W1.3 (если RED).

## §9. План проверки

### §9.1 Sanity governance (до и после)

```bash
node tools/check_runtime_rpc_registry.mjs
node tools/check_runtime_catalog_reads.mjs
node tools/check_no_eval.mjs
node tools/check_trainer_css_layers.mjs
```

Все exit 0. Если cleanup был — особенно важен `check_trainer_css_layers` (валидирует tokens.css только `:root`, нет `!important`, нет `@media`).

### §9.2 Sanity git diff

```bash
git diff --stat
# GREEN: только reports/w1_2prime_*
# YELLOW: + tasks/trainer/tokens.css + bump-набор
```

Никаких сюрпризов в `base.css`, `print.css`, `pages/*.css`, `app/providers/*`, `tasks/**/*.js`, `tools/*`, `docs/supabase/*`.

### §9.3 Spot-check визуальный (только если cleanup был)

```bash
python3 -m http.server 8000
```

Открыть в Chrome incognito 3 страницы:
- `http://localhost:8000/home_student.html` (cascade-sensitive home-student).
- `http://localhost:8000/tasks/auth.html` (pure base+tokens, лёгкая страница).
- `http://localhost:8000/tasks/trainer.html` (средне-сложная).

Сравнить с `reports/w1_1prime_smoke/{home_student,auth,trainer}.png`. **Никаких визуальных регрессий** (subpixel и font-rendering различия — ок).

Скриншоты в `reports/w1_2prime_artifacts/after_cleanup/`.

### §9.4 Sanity print-features (только если cleanup был)

```bash
cd tests && node print-features.js
```

Должно быть **36/0** (== `reports/w1_0b_artifacts/print_features_baseline.txt`).

### §9.5 Sanitization артефактов (всегда)

**Handoff bundle (`handoff_bundle.{json,md}`)** — главный target:
- `grep` на `Bearer `, `eyJ` (JWT pattern), `access_token`, `refresh_token`, `apikey`, `Authorization:` → если найдено, заменить значения на `***REDACTED***`.
- `grep` на реальные email-домены (не `@example.com`, не e2e тестовые) → редактировать.
- `grep` на токены ДЗ / session-ссылок (32+ символов алфанумерик после `?token=` / `sess_`) → редактировать, если такие случайно попали в context (маловероятно для design-onboarding, но проверить).
- `grep` на GitHub PAT (`ghp_`, `github_pat_`) — если оператор настроил Claude Design connect-к-репо через PAT, токен мог попасть в logs.

**Опциональные скриншоты (если оператор приложил):**
- Открыть каждый PNG глазами → проверить, что в DevTools-панелях / address bar нет токенов / реальных email-ов.
- Если нашлось — заблюрить / cropнуть / переснять.

## §10. Отчётный артефакт

`reports/w1_2prime_report.md`:

1. **Резюме** (3–5 строк): какой decision-исход (GREEN/YELLOW/RED), W1 трек закрыт ИЛИ открыт W1.3, был ли cleanup, есть ли follow-up для Claude Design-продуктовых волн.
2. **Метаданные**: дата onboarding'а, какая версия Claude Design (если показано в UI), какие файлы / repository были даны для analyze'а, способ передачи (GitHub-link / file-upload / другое).
3. **Handoff bundle summary** (§5.2): структура полученного bundle'а (что включено: design tokens, components, intent, design-files), краткие цитаты ключевых выводов Claude Design (если есть text-output в bundle или в `onboarding_summary.md`).
4. **Извлечённый design system**: цвета, типографика, spacing, radius, shadows, components — таблицей, **из bundle напрямую** (не из скриншотов).
5. **Gap-анализ** (§5.3): таблица наш token / Claude Design / совпадение / категория (green/yellow/red) / комментарий.
6. **Decision-таблица §5.5**: какой исход выбран, обоснование.
7. **Cleanup log** (если YELLOW): что именно изменено в tokens.css, diff, обоснование каждого изменения.
8. **Re-rehearsal результат** (если YELLOW): второй прогон Claude Design + Export → Handoff улучшил ли извлечение, сравнение с первым bundle'ом (delta).
9. **Generated sample quality** (если §5.2.4 сделан): извлечённый из bundle sample (markup + tokens-refs) + оценка consistency со стилем проекта.
10. **W1 closure decision**: явный одиночный параграф «W1 трек закрыт ✅ 2026-05-X. Критический путь переходит на W2.» или «W1 не закрыт, открыта W1.3 (структурный cleanup): план — `W1_3_PLAN.md`».
11. **Открытые follow-up** для последующих волн:
    - Если Claude Design предложил полезное, что не вошло в W1.2' (потому что выходит за tokens scope) → fixed как кандидат на W1.3 или hygiene-волну.
    - Что увидено о качестве Claude Design generation'а (для калибровки ожиданий первой продуктовой волны редизайна).
    - Subscription / access нюансы оператора (для будущих использований).

---

## Что после W1.2'

### Сценарий GREEN

- `GLOBAL_PLAN.md §4` — W1.2' → ✅; W1 трек закрыт целиком; критический путь переходит на W2.
- `PROJECT_STATUS.md §10 baseline` обновляется: «трек W1 закрыт; Claude Design ready; tooling rehearsal прошёл успешно без правок tokens.css».
- Готовы к первой **продуктивной волне редизайна** через Claude Design (обозначить как, например, **WD.1 — редизайн `tasks/auth.html`** или другую simplest-page для калибровки).

### Сценарий YELLOW (после cleanup'а)

- То же что GREEN, плюс в отчёте — `cleanup log` с историей правок tokens.css.

### Сценарий RED

- W1 трек **не закрывается**. Открывается **W1.3** — отдельный план структурного cleanup'а (за пределами tokens.css; возможно `base.css` или naming convention). Куратор пишет `W1_3_PLAN.md` на данных gap-анализа.
- Критический путь временно остаётся на W1.3.
- Это менее вероятный сценарий, но не блокер для остального проекта (продуктовые треки WS / W7 / WHF параллельны и не задеты).
