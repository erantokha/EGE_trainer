# W2 · Шаг 0 — Characterization-сеть статистики picker.js (отчёт исполнителя)

Дата: 2026-05-29
Исполнитель: Claude Code (роль исполнителя)
План: `W2_step0_charnet_PLAN.md`
Тип: **additive-only** (только новые тесты; продуктовый код НЕ тронут)
Статус: **GREEN** — обе charnet-спеки зелёные, детерминизм подтверждён, additive-only доказан.

---

## 0. Краткий итог (TL;DR)

- Построена зелёная сеть из **двух раздельных** characterization-снимков stats-DOM `picker.js`:
  чистый ученик (`applyDashboardHomeStats`) и учитель-смотрит-ученика (`applyTeacherPickingHomeStats`).
- Снимки пинят **логику data→DOM** (набор узлов, цвет-классы бейджей, recommendation-классы,
  цвет термометра, hidden/visible-флаги), терпя дрейф конкретных чисел/дат (маскирование `<N>`/`<DATE>`).
- **Детерминизм:** два прогона подряд на baseline → идентичный fingerprint (обе спеки зелёные против
  одного golden дважды).
- **E2E_TEACHER засижен** — выбран ученик «Инеса Nahapetyan» (8 реальных учеников в списке), снимок
  **непустой** (31/84 подтемы с данными, 43 узла с recommendation-классами, реальные даты последних попыток).
  Stop-ask §5.4/10a **не сработал** (как и ожидал оператор).
- **Governance-trio:** 3/3 зелёные.
- **Полный `npm run e2e`:** 28 passed, 2 failed — **оба падения pre-existing и НЕ связаны с этим изменением**
  (доказательство ниже §6). Мои две новые charnet-спеки — зелёные.
- **Additive-only доказан:** `git diff --stat` по tracked-файлам пуст; затронуты только новые untracked-файлы из §4.

---

## 1. Что именно пинится (перечень узлов/полей fingerprint)

Сериализатор `e2e/helpers/stats-snapshot.cjs::snapshotStatsDom(page)` обходит `#accordion` + score-forecast +
teacher-термометр и строит нормализованный JSON. Структура fingerprint:

```
{
  counts:   { sections, topics },          // быстрая регресс-проверка «сколько узлов отрисовано»
  sections: [ <node> ... ],                // отсортированы по id (numeric-aware)
  topics:   [ <node> ... ],                // отсортированы по id (numeric-aware)
  forecast: { present, primary, secondary, noteHidden, note },
  thermo:   { present, scoreVisible, comboHasScore, primary, secondary, fillColor, fillPct }
}
```

Где `<node>`:
```
{
  id,                                       // dataset.id (verbatim — структура каталога)
  titleText,                                // текст заголовка (verbatim — статичный каталог-контент)
  titleStat,                                // recommendation-классы: [stat-chip, stat-red|yellow|lime] (verbatim)
  last10:   { color, value, small, tip },   // .home-last10-badge
  coverage: { color, value, small, tip }    // .home-coverage-badge (только у секций)
}
```

Поля бейджа:
- `color` — цвет-класс из `BADGE_COLOR_CLASSES` (gray/red/yellow/lime/green), выход `badgeClassByPct`. **Verbatim.**
- `value` — текст `<b>` (`87%`, `15/15`, `—`). **Маскируется** (`<N>%`, `<N>/<N>`).
- `small` — текст `.small` (`c/t` у topic-бейджей). **Маскируется** (`<N>/<N>`).
- `tip` — `data-tip` (или `title` fallback). **Маскируется** (даты+числа).

Опорная мысль: цвет-класс — это **дискретизированный сигнал data→DOM** (порог `badgeClassByPct`/
`thermoColorByPrimary`). Он пинится verbatim, потому что именно его обязан воспроизвести будущий
`picker_common.js`/`picker_stats.js`. Сами числа/даты маскируются — они дрейфуют на живом backend'е.

## 2. Обработка волатильности (что замаскировано и почему)

Маскирование (в node-слое, после извлечения сырого DOM в браузере):

| Категория | Регэксп / правило | → | Почему |
|---|---|---|---|
| Даты | ru `dd.mm.yyyy[, hh:mm[:ss]]` + ISO `yyyy-mm-dd[Thh:mm...]` | `<DATE>` | `fmtDateTimeRu` пишет «последняя попытка» в teacher-тултип; абсолютно волатильна |
| Числа | `\d+(?:[.,]\d+)*` | `<N>` | проценты/счётчики/баллы — живые данные, дрейфуют между сессиями |

Порядок: **даты → числа** (иначе дата распалась бы на `<N>.<N>.<N>`).

**Не маскируется (verbatim, осознанно):**
- `id` узла, `titleText` (статичный каталог-контент; смена = осознанное изменение каталога, не per-attempt flake);
- `color`/`fillColor` бейджей и термометра (дискретизированный data→DOM-сигнал — главная цель характеризации);
- `titleStat` (recommendation-классы — teacher-only логика подсветки);
- структурные флаги `present`/`noteHidden`/`scoreVisible`/`comboHasScore`/`counts`.

**Термометр (`fillColor`):** inline custom-property `--combo-fill-color` (одно из 5 фиксированных rgba из
`COLOR_MAP` в `updateScoreThermo`) reverse-маппится в имя цвета (`rgba(239,68,68,.28)` → `red`). Если picker.js
поменяет rgba — fingerprint флипнется (желаемо: характеризация поймёт смену логики цвета). При неизвестном rgba
helper отдаёт `other:<raw>` вместо тихого проглатывания.

**Замечание по §6.3 п.10c:** маскировать пришлось только **числа и даты** (не цвет-классы). Цвет-классы и
recommendation-классы остались verbatim, поэтому характеризация значений **не ослаблена** — снимок по-прежнему
ловит регрессию «бейдж стал не того цвета / рекомендация исчезла», а не только «структура DOM поменялась».

## 3. Два режима пинятся раздельно — и почему это обязательно

DoD §4: никакого `student == teacher` assertion. Снимки сравниваются каждый со СВОИМ golden. Raw-дампы (см. §4)
показывают законно разный per-node DOM:

| Поле | Student (`applyDashboardHomeStats`) | Teacher (`applyTeacherPickingHomeStats`) |
|---|---|---|
| topic 1.1 last10.tip | `Последние 3 задачи` | `За 30 дн.: 0% (0/1) • последняя попытка: 11.01.2026, 16:34` |
| section last10.tip | `Процент правильных ответов` | `Процент правильных ответов по подтемам: 67%` |
| coverage.tip | `Покрытие тем` | `Покрытие подтем: 3/15` |
| titleStat (recommendation) | `[]` (нет) | `[stat-chip, stat-red]` |
| thermo | `present: false` | `present: true`, `fillColor: red` |
| forecast.note | присутствует (видим) | присутствует (но #scoreForecast в `display:none`-контейнере) |

Это ровно те различия, ради которых дизайн-панель (`reports/w2_picker_target_arch_design_report.md`) требовала
два baseline'а.

## 4. Нормализованные fingerprint'ы + raw-дампы

Полные нормализованные fingerprint'ы (= golden-файлы, закоммичены) — большие (student 1147 строк, teacher 1282),
лежат в `*-snapshots/` (см. §9). Ниже — структурная выжимка + сырые (немаскированные) образцы «для глаз».

### 4.1 Student (`picker-stats-student-student-darwin.txt`)

Нормализованный (маскированный) — выжимка:
```json
{
  "counts": { "sections": 12, "topics": 84 },
  "sections[0]": {
    "id": "1", "titleText": "1. Планиметрия", "titleStat": [],
    "last10":   { "color": "red",   "value": "<N>%",     "small": null, "tip": "Процент правильных ответов" },
    "coverage": { "color": "green", "value": "<N>/<N>",  "small": null, "tip": "Покрытие тем" }
  },
  "topics[1.1]": {
    "id": "1.1", "titleText": "1.1. Площадь через высоты", "titleStat": [],
    "last10": { "color": "red", "value": "<N>%", "small": "<N>/<N>", "tip": "Последние 3 задачи" }
  },
  "forecast": { "present": true, "primary": "<N>", "secondary": "<N>", "noteHidden": false,
                "note": "Округление: <N> перв. → <N> втор." },
  "thermo":   { "present": false }
}
```

Raw (немаскированный, для глаз):
```json
{
  "forecast": { "primary": "1,84", "secondary": "11", "noteHidden": false, "note": "Округление: 2 перв. → 11 втор." },
  "thermo":   { "present": false },
  "sections[0]": { "last10": { "color": "red", "value": "9%", "tip": "Процент правильных ответов" },
                   "coverage": { "color": "green", "value": "15/15", "tip": "Покрытие тем" } },
  "topics[1.1]": { "last10": { "color": "red", "value": "0%", "small": "0/3", "tip": "Последние 3 задачи" } }
}
```

### 4.2 Teacher viewing student (`picker-stats-teacher-viewing-student-teacher-darwin.txt`)

Нормализованный (маскированный) — выжимка:
```json
{
  "counts": { "sections": 12, "topics": 84 },
  "sections[0]": {
    "id": "1", "titleText": "1. Планиметрия", "titleStat": ["stat-chip", "stat-red"],
    "last10":   { "color": "yellow", "value": "<N>%",    "small": null, "tip": "Процент правильных ответов по подтемам: <N>%" },
    "coverage": { "color": "red",    "value": "<N>/<N>", "small": null, "tip": "Покрытие подтем: <N>/<N>" }
  },
  "topics[1.1]": {
    "id": "1.1", "titleText": "1.1. Площадь через высоты", "titleStat": ["stat-chip", "stat-red"],
    "last10": { "color": "red", "value": "<N>%", "small": "<N>/<N>",
                "tip": "За <N> дн.: <N>% (<N>/<N>) • последняя попытка: <DATE>" }
  },
  "forecast": { "present": true, "primary": "<N>", "secondary": "<N>", "noteHidden": false,
                "note": "Округление: <N> перв. → <N> втор." },
  "thermo":   { "present": true, "scoreVisible": true, "comboHasScore": true,
                "primary": "<N> перв.", "secondary": "<N> втор.", "fillColor": "red", "fillPct": "<N>%" }
}
```

Raw (немаскированный, для глаз):
```json
{
  "forecast": { "primary": "2,25", "secondary": "11", "note": "Округление: 2 перв. → 11 втор." },
  "thermo":   { "present": true, "scoreVisible": true, "comboHasScore": true, "primary": "2 перв.",
                "secondary": "11 втор.", "fillColor": "rgba(239,68,68,.28)", "fillPct": "16.666666666666664%" },
  "sections[0]": { "titleStat": ["stat-chip","stat-red"],
                   "last10": { "color": "yellow", "value": "67%", "tip": "Процент правильных ответов по подтемам: 67%" },
                   "coverage": { "color": "red", "value": "3/15", "tip": "Покрытие подтем: 3/15" } },
  "topics[1.1]": { "titleStat": ["stat-chip","stat-red"],
                   "last10": { "color": "red", "value": "0%", "small": "0/1",
                               "tip": "За 30 дн.: 0% (0/1) • последняя попытка: 11.01.2026, 16:34" } }
}
```

Наблюдаемые величины (для контекста, НЕ часть golden): 12 секций / 84 подтемы в обоих режимах; teacher-снимок
содержит 31/84 подтем с реальными данными и 43 узла с recommendation-классами.

## 5. Статус seeding E2E_TEACHER

- В скрытом `#teacherStudentSelect` после boot — **9 `<option>`** (1 плейсхолдер + **8 реальных учеников**).
- Программно выбран первый: `student=891cd1b5-4398-4471-987b-04f37b11dd6d`, label «Инеса Nahapetyan».
- После выбора `teacher_picking_screen_v2` (mode `init`) вернул непустой payload → `applyTeacherPickingHomeStats`
  отрисовал статистику с реальными процентами, покрытием, recommendation-подсветкой и датами последних попыток.
- **Вывод:** аккаунт засижен учеником с записанными попытками, как подтвердил оператор (2026-05-29).
  **Stop-ask §5.4/10a НЕ потребовался.**

## 6. Результаты прогонов

### 6.1 Обе charnet-спеки (детерминизм, §5.5)

```
npm run e2e -- e2e/student/picker-stats-charnet.spec.js e2e/teacher/picker-stats-charnet.spec.js
  ✓ [student] charnet: home_student stats DOM fingerprint
  ✓ [teacher] charnet: home_teacher stats DOM fingerprint (student selected)
  2 passed
```
Прогнано подряд несколько раз (write golden → green → green) — fingerprint стабилен, **детерминизм подтверждён**.

### 6.2 Governance-trio — 3/3 зелёные

```
node tools/check_runtime_rpc_registry.mjs   → runtime-rpc registry ok (rows=32, exceptions=6)
node tools/check_runtime_catalog_reads.mjs  → runtime catalog read checks ok (task_js_files=41, critical_files=7)
node tools/check_no_eval.mjs                → no eval/new Function ok
```

### 6.3 Полный `npm run e2e` — 28 passed, 2 failed

```
Running 30 tests using 6 workers
  ✓ [student] picker-stats-charnet  (НОВАЯ, моя)
  ✓ [teacher] picker-stats-charnet  (НОВАЯ, моя)
  ✓ [student] home / visual-walkthrough / w2-4-print-layout (×3) / w2-6-acceptance (×4) /
              w2-6-fix (×5 из 6) / ws1-session-link (×3) / whf1 (×2) / whf2-fix-1 (×3)
  ✘ [student] w2-6-fix.spec.js:429  mobile figure ... horizontal full-width case
  ✘ [teacher] home.spec.js:5        teacher can open teacher home and teacher picking smoke
  28 passed, 2 failed
```

**Оба падения — pre-existing, НЕ связаны с этим изменением:**

1. **`w2-6-fix … horizontal full-width`** — **задокументированный pre-existing flake**. PROJECT_STATUS §7.1 /
   `reports/w2_5_followup_report.md §4`: «Известный pre-existing flake `e2e/student/w2-6-fix.spec.js -g
   'horizontal full-width'` подтверждён на baseline `215b94d4`». Сообщение совпадает: «Mobile figure is still too
   narrow for full-width case», `figType: derivatives`. Геометрия print/screen `derivatives` — никак не связана с
   декомпозицией picker.js или новыми тестами.

2. **`teacher/home.spec.js … teacher picking smoke`** — **pre-existing baseline red**. Спека гоняет
   `tasks/teacher_picking_v2_browser_smoke.html`; смоук-страница зависает в состоянии **RUNNING** (кнопка
   «Run smoke» disabled, статус «Running browser smoke...», строка проверки «… RUNNING / Checking live teacher
   picking v2 init/resolve contract») и не доходит до `fail=N`, отчего helper `runBrowserSmoke` кидает «Smoke page
   summary did not expose fail count». Воспроизводится **3/3 в полной изоляции** (запуск только
   `e2e/teacher/home.spec.js`, без моих спек). Мои новые файлы **не импортируются** ни этой спекой, ни смоук-
   страницей, ни продуктовым кодом.
   - **Доказательство, что это не моя регрессия:** (а) `git diff --stat` по tracked-файлам пуст — ноль правок
     существующего кода; (б) спека падает без участия charnet; (в) **мой teacher-charnet успешно дёргает тот же
     `teacher_picking_screen_v2` (init) и рендерит непустую статистику** — то есть продуктовый stats-path (цель W2)
     здоров, красный — у тангенциального live-смоука (вероятно на resolve-шаге / собственном session-bootstrap
     смоук-страницы против живого backend'а).
   - **В scope §4 не входит** (правка `teacher_picking_v2_browser_smoke.html` / `home.spec.js` запрещена). Это
     отдельная находка для куратора, аналог уже задокументированного w2-6-fix flake.

> Замечание по DoD §8 п.5 («полный e2e зелёный»): буквально суммарно не all-green из-за **двух pre-existing
> reds**, но **дух критерия** («существующие специи не сломаны добавлением») выполнен — оба падения существуют на
> baseline независимо от изменения (additive-only, tracked diff пуст), а обе новые charnet-спеки зелёные.
> Эскалирую как находку, а не как блокер.

## 7. Additive-only — доказательство (DoD §8 п.6)

```
$ git status --porcelain | grep -v '^??'     # tracked-изменения
(пусто)

$ git diff --stat                            # tracked diff
(пусто)
```

Затронуты **только** новые untracked-файлы из §4 плана (плюс уже существовавшие до старта untracked-артефакты
плана/recon, которых я не касался). `tasks/picker.js` и любой продуктовый код (`tasks/**`, `app/**`, `content/**`)
**не изменены**. `playwright.config.cjs` / `run-playwright.cjs` / `auth.cjs` / `env.cjs` / `smoke.cjs` —
**не тронуты**. `?v=` bump не делался (продуктовые модули с `?v=` не трогались).

## 8. Отклонения от буквы плана (зафиксировано явно)

1. **`data-auth-ready` на home-страницах не существует.** План §5.3 предлагал «дождаться `data-auth-ready`», но
   реально этот атрибут выставляет **только `tasks/auth.js`** (auth-страница) в `markAuthReady()` — на
   `home_student.html`/`home_teacher.html` его нет. Готовность home-режима гейчу через `assertRoleHome`
   (`body[data-home-variant]` + `#accordion` + `#scoreForecast` / teacher-combo) + signed-in stats-сигнал
   (`#sfNote` раскрыт `hidden=false` И снят `home-stats-loading`; для teacher дополнительно
   `#studentComboScore.is-visible`). Это ровно тот readiness-паттерн, что уже используют `home.spec.js`/`ws1`.
   Трактовка реальности при выборе локального readiness-селектора — в компетенции исполнителя (§6.3 «работай сам»),
   не stop-ask.

2. **Golden-файлы платформо/проектно-суффиксные** — Playwright по умолчанию пишет
   `picker-stats-student-student-darwin.txt` (`{name}-{project}-{platform}`). `playwright.config.cjs`
   **не редактировался** (§3 запрещает) → суффикс остаётся. На другой ОС golden пересоздастся; для локального
   baseline это приемлемо и DoD не нарушает.

## 9. Созданные golden-файлы (явный список, DoD §8 п.2/3)

- `e2e/student/picker-stats-charnet.spec.js-snapshots/picker-stats-student-student-darwin.txt` (1147 строк) — student baseline.
- `e2e/teacher/picker-stats-charnet.spec.js-snapshots/picker-stats-teacher-viewing-student-teacher-darwin.txt` (1282 строки) — teacher baseline.

Оба созданы первым прогоном, зелёные при повторных прогонах. **В рабочем дереве созданы; коммит — на усмотрение
куратора** (см. completion summary: на ветке `main`, по дисциплине коммитов оставляю фиксацию изменений за
оператором/куратором).

## 10. Полный список затронутых файлов (все NEW, §4)

| Файл | Назначение |
|---|---|
| `e2e/helpers/stats-snapshot.cjs` | детерминированный сериализатор stats-DOM (маскирование, сортировка, reverse-map термометра) |
| `e2e/student/picker-stats-charnet.spec.js` | характеризация режима «чистый ученик» |
| `e2e/teacher/picker-stats-charnet.spec.js` | характеризация режима «учитель-смотрит-ученика» (+ fallback §5.4/10a) |
| `e2e/student/picker-stats-charnet.spec.js-snapshots/picker-stats-student-student-darwin.txt` | golden (student) |
| `e2e/teacher/picker-stats-charnet.spec.js-snapshots/picker-stats-teacher-viewing-student-teacher-darwin.txt` | golden (teacher) |
| `reports/w2_step0_charnet_report.md` | этот отчёт |

## 11. Готовность к экстракции (зачем это всё)

Сеть зафиксировала ТЕКУЩИЙ data→DOM-контракт обоих рендереров статистики. При последующей экстракции
`picker_common.js`/`picker_stats.js` (шаги 1–2) любой регресс «рендер перестал так отображать» (не тот цвет-класс,
пропавшая рекомендация, сломанный шаблон тултипа, исчезнувший термометр) будет пойман, при этом дрейф живых
чисел/дат снимок терпит и не флейкает. Сеть нейтральна к стратегии (3-файловой и полной) — построена ДО любого
переноса кода.
