# hw — аудит и план рестайла

reached: true. Достигнут реальный экран `tasks/hw.html` (роль student) навигацией из `tasks/my_homeworks.html`: тест-аккаунт ученика имеет 10+ ДЗ, клик по первой карточке `.myhw-card.clickable` («ДЗ 01.04 — 0/1», бейдж «Сдано») переводит на `tasks/hw.html?token=…`. Скриншоты: `reports/site_restyle/shots/hw_desk.png`, `reports/site_restyle/shots/hw_mob.png`.

Захваченное состояние — **режим просмотра сданного ДЗ** (`#summary` видим, `#hwGate` скрыт): шапка-отчёт «Отчет и статистика» + stat-чипы (Всего/Верно/Точность/Время/Среднее) + карточка-разбор задачи (`renderReviewCards`) с кнопками «Видео-решение» / «Решить аналог». Это один из трёх режимов экрана; два других (гейт-загрузка `#hwGate` и активный прогон `#runner`) живут в той же `.panel` под той же шапкой `#appHeader`, поэтому план рестайла каркаса (шапка + сайдбар + CSS-слои) валиден для всех трёх режимов.

Страница НЕ приведена к эталону home_student: `<body>` без `data-home-variant`, в `<head>` только `tokens.css`+`base.css`+`print.css` — отсутствуют `tasks/trainer/pages/home-student.css` и `tasks/home_student.mobile.css` (весь рельс/гамбургер/eyebrow живёт там). Нет сайдбара, нет eyebrow над H1, верхний контур собран из старых header.js-кнопок + локальной кнопки печати/тогла темы. Горизонтального скролла нет ни на десктопе, ни на мобилке (Playwright: `scrollWidth==clientWidth`, hscroll=false на 1366 и 390). Severity: medium (каркас другой, контент-карточка разбора уже близка к эталону).

## Десктоп

- Проблемы:
  - **Нет сайдбар-рельса слева.** Эталон (home_student) на десктопе — фиксированный 56px-рельс (`.ht-sidebar-panel`, hover-expand до 220px) со Статистика / Мои ДЗ / Профиль / пользователь+Выйти. Здесь его нет вовсе; контент центрируется в `.container` без clearance.
  - **Старый верхний контур.** В шапке `#appHeader` (`.page-head`) справа — локальная кнопка «Печать» (`#printBtn`, `data-header-extra`), тогл темы (`.theme-toggle`), а также смонтированные `header.js` пилюля «Антон 🔔» (`#userMenuWrap`/`.page-head-right`) + кнопка «На главную». На эталоне `.page-head-right` визуально скрыта (`display:none` через `body[data-home-variant]`), навигация уходит в рельс.
  - **Нет eyebrow над заголовком.** Эталон: `.home-eyebrow` («Подготовка к ЕГЭ по профильной математике») мелким капсом + `.home-h1`. Здесь — голый `<h1 id="hwTitle">` (в скриншоте «ДЗ 01.04») без eyebrow и без класса `home-h1`.
  - **Внешняя `.panel`-обёртка вокруг всего экрана** (`<section id="hw"><div class="panel">…`). Внутри уже идёт собственная белая карточка-разбор (рамка вокруг задачи) → «коробка в коробке». На эталоне внешней панели нет: контент дышит на фоне `--bg`, панелями оформлены только смысловые блоки.
  - **Не подключены стилевые слои главной** (`home-student.css`, `home_student.mobile.css`) и нет `data-home-variant="student"` на `<body>` — без него ни одно правило рельса/скрытия пилюли/eyebrow/clearance не активируется.
  - Stat-чипы блока «Отчет и статистика» (`renderStats`) — серые однотипные пилюли без иерархии; не в палитре stat-блоков эталона.

- План:
  1. В `<head>` добавить два `<link>` ровно как в `home_student.html` (порядок: tokens → base → print → page → **home-student → home_student.mobile**), пути относительно `tasks/`: `./trainer/pages/home-student.css`, `./home_student.mobile.css`, с `?v=` через `bump_build`.
  2. На `<body>` добавить `data-home-variant="student"` → включит: скрытие `.page-head-right`/`#userMenuWrap`, рельс-clearance `padding-left:56px`, eyebrow/H1-типографику, рельс.
  3. В `#appHeader` заменить голый `<h1 id="hwTitle">` на блок-эталон:
     `<div class="home-head-text"><div class="home-eyebrow">Подготовка к ЕГЭ по профильной математике</div><h1 class="home-h1" id="hwTitle">Домашнее задание</h1></div>`.
     **`id="hwTitle"` сохранить** — `hw.js` пишет в него название ДЗ (`$('#hwTitle').textContent = …`).
  4. Добавить кнопку-гамбургер `#htSidebarOpen` (`.ht-burger.ht-burger-open`) внутрь `#appHeader` — копия из `home_student.html` (строки ~130). На десктопе скрыта (`@media (min-width:1025px){#htSidebarOpen{display:none}}`), на мобилке — триггер рельса.
  5. Перед `</body>` вставить полный блок `#htSidebar` (рельс/оверлей/nav: Статистика `#htNavStats` / Мои ДЗ `#htNavWorks` / Профиль `#htNavProfile` / пользователь `#htSidebarUserBtn` + Выйти `#htSidebarLogout`) — копия 1-в-1 из `home_student.html` (строки ~352–425).
  6. Подключить inline-IIFE открытия/закрытия сайдбара + синк имени из `#userMenuBtn` + выход через скрытый `#menuLogout` + навигацию + бейдж `body.has-notif` — копия 1-в-1 из `home_student.html` (строки ~432–564). `initHeader({isHome:false})` уже вызывается inline-модулем в hw.html (строки 163–170) и продолжает монтировать `#userMenuBtn`/`#menuLogout`, нужные сайдбару.
  7. Решить судьбу локальной кнопки «Печать» (`#printBtn`) и тогла темы (`.theme-toggle`): на эталоне их нет в шапке. Печать на экране ДЗ функционально нужна (`print_btn.js` + `print.css`) — согласовать с куратором, оставлять ли её отдельной icon-btn в ряд заголовка (как `⚙` на других страницах) или прятать. **Не удалять `initPrintBtn`/`#printBtn` без решения** — это рабочий функционал печати разбора.
  8. После правок — `node tools/bump_build.mjs` (cache-busting), синхронизировать `meta[name="app-build"]` со всеми `?v=`.

## Мобилка

- Проблемы:
  - **Нет гамбургера справа вверху.** На эталоне (home_student_mob) справа вверху — `#htSidebarOpen`, открывающий full-screen overlay-сайдбар. Здесь вместо него — пилюля «Антон 🔔» + синяя круглая иконка-дом (`#homeBtn`/`.home-icon-btn` из header.js), а кнопка печати отдельной строкой ниже шапки.
  - **Нет мобильного сайдбара-оверлея** (Статистика/Мои ДЗ/Профиль/Выйти) — навигация на мобилке почти отсутствует (только «домой»).
  - **Нет eyebrow** над H1.
  - Внешняя `.panel`-обёртка даёт лишнюю рамку по краям экрана и съедает горизонтальные поля; внутри уже карточка-разбор → двойная вложенность.
  - Контент-карточка разбора и stat-чипы по ширине вписываются (h-scroll нет), но т.к. `home_student.mobile.css` не подключён — нет гарантий мобильных override (eyebrow-размер, ужатие шапки) для заполненного `#runner`/`#summary` с широкими формулами MathJax.

- План:
  1. Пункты 1–6 десктопа автоматически дают мобильный гамбургер: общий слой (`@media (max-width:1024px)`) делает `#htSidebarOpen{display:flex; position:absolute; top:10px; right:16px}`, а `.home-head-text{padding-right:40px}` страхует H1 от наезда на гамбургер.
  2. `data-home-variant` скрывает мобильную пилюлю «Антон» и иконку-дом `#homeBtn` (`.page-head-right`/`.home-icon-btn`) — навигация уходит в drawer.
  3. Подключённый `home_student.mobile.css` даёт мобильную раскладку шапки (eyebrow/H1 стопкой) как у эталона.
  4. Проверить отсутствие h-scroll на ЗАПОЛНЕННОМ `#runner`/`#summary` (задача с широкой формулой/картинкой-графиком, как в захваченном разборе): при необходимости — страховка `main{overflow-x:clip}` для `body[data-home-variant]` по аналогии с teacher-правилом. На захваченном состоянии график-картинка вписалась без переполнения. MathJax-контейнеры уже `max-width:100%` в base.css.
  5. iOS-зум: `home_student.html` использует `viewport … maximum-scale=1,user-scalable=no`; hw.html сейчас (строка 44) — `width=device-width,initial-scale=1` (без maximum-scale). Для паритета анти-зума добавить `maximum-scale=1,user-scalable=no` (a11y-нюанс — согласовать с куратором; общий рецепт PLAN.md §5 этого требует).

## Риск/функционал

- **Не трогать логику `hw.js`** (~2162 строки) — это тяжёлый рантайм трёх режимов: гейт-загрузка по `?token=`/`?attempt_id=` (teacher-report), сбор задач (`buildFixedQuestions`/`buildGeneratedQuestions`/`frozen_questions`), прогон сессии (`startHomeworkSession`, `mountRunnerUI`), сдача и отчёт (`showAttemptSummaryFromRow`, `renderStats`, `renderReviewCards`), видео-решение/«Решить аналог». Рестайл = разметка `#appHeader` + добавление сайдбар-блока + подключение CSS. **Сохранить без изменений id, на которых завязан JS:** `#hwTitle`, `#hwDesc`, `#hwGate`, `#hwGateMsg`, `#runner`, `#summary` (создаётся `mountRunnerUI`), `#copyDetails`, `#retrySave`, `#hwDiag`, `#printBtn`.
- **Red-zone: auth/logout + auth-gate.** `hw.js` сам делает auth-gate: без сессии — `location.replace('./auth.html?next=…')` (строки 592–597). Сайдбарный «Выйти» работает через клик по скрытому `#menuLogout`, который монтирует `header.js`. Нельзя удалять/менять вызов `initHeader(...)` (inline-модуль, строки 163–170) и нельзя удалять `#userMenuBtn`/`#userMenuWrap`/`#menuLogout` из DOM — их только визуально скрывает `home-student.css`. Изменение auth-flow требует explicit approval.
- **Red-zone: homework RPC.** Загрузка идёт через `getHomeworkByToken`, `startHomeworkAttempt`, `getHomeworkAttempt`, `startHomeworkSession` (`app/providers/homework.js`). Рестайл их не касается — только не сломать передачу `?token=`/`?attempt_id=` (на этих query-параметрах строится весь flow; навигация из my_homeworks даёт `?token=`).
- **Red-zone: общий CSS-слой.** `home-student.css` / `home_student.mobile.css` — общие для ученика И учителя (`body[data-home-variant]`). hw.html должна только ПОДКЛЮЧАТЬ их, без модификации. Если нужны точечные override (например spacing `#summary`/`#runner`/stat-чипов) — выносить в page-scoped блок (новый `pages/hw.css`-слой или scoped-правила), не редактируя общий слой.
- **Печать.** На экране ДЗ печать — рабочий функционал (`print_btn.js` с `hideAnswers:true` + `print.css`). При уборке локальной кнопки из шапки сохранить доступ к печати (icon-btn / пункт меню) и не ломать `initPrintBtn`. Это часть DoD печатного контура — согласовать с куратором.
- **CSP.** `<head>` содержит строгий CSP (строка 5). Добавляемые CSS — локальные (`'self'`), inline-IIFE покрыт `script-src 'unsafe-inline'` — ограничения CSP план не нарушает.
- **`?v=` cache-busting.** Правки hw.html + любых импортируемых с `?v=` модулей требуют `node tools/bump_build.mjs`, иначе браузер подтянет старый hw.html/CSS из кеша. Синхронизировать `meta[name="app-build"]`.
- **Навигация сайдбара.** Ссылки IIFE (`tasks/stats.html`, `tasks/my_homeworks.html`, `tasks/profile.html`) строятся от `homeUrl`; hw.html лежит в `/tasks/`, как и эти цели — сверить относительные пути (внутри `tasks/` — без `../`, в отличие от пунктов «домой»).
