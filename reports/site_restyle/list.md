# list — аудит и план рестайла

reached: true

Страница «Список задач» (`tasks/list.html`, роль student) НЕ приведена к эталону home_student. Это страница печатного списка подобранных задач (лист с прототипами 1..N). Сейчас на ней: старый верхний контур (плейн-`.crumb` «Список задач» + смонтированная `header.js` пилюля «Антон»+колокольчик + кнопка «На главную»), обрамляющая весь контент `.panel` («коробка»), нет eyebrow над заголовком, нет сайдбара (ни десктоп-рельса, ни мобильного гамбургера) и не подключён ни один стилевой слой главной (`home-student.css` / `home_student.mobile.css`). Severity: **medium** (визуально близко к остальным app-страницам; есть **специфический риск с кнопкой «Печать»**, см. ниже — это поднимает внимательность при реализации).

## Как достигнута страница (reached:true)

Прямой заход на `list.html` редиректит на главную: в `list.js` (строки 90–105) обычный режим читает `tasks_selection_v1` из `sessionStorage`; при его отсутствии — `location.href = '../'` (→ `/home_student.html`). На самой главной ученика «Начать» ведёт НЕ на list, а на trainer: в `picker.js` (строка 5370) `const mode = IS_STUDENT_PAGE ? 'test' : (CURRENT_MODE || 'list')` — для `home_student.html` mode жёстко `'test'` → `trainer.html`. То есть для ученика «список задач» как режим старта с главной недоступен; list — это отдельный режим/ссылка.

Достигнута через НЕ-редиректящий режим «Все задачи одной темы»: `list.html?topic=<topicId>&view=all` (`list.js` строки 78–80, 127–147 — `IS_ALL_TOPIC_MODE`). Реальный `topicId` (`1.1`) снят из аккордеона главной (узлы `#accordion .node.topic[data-id]`, появляются после раскрытия секции). Скрипт: `reports/site_restyle/listCap.cjs` (full-page) + `reports/site_restyle/listTop.cjs` (viewport-only шапка). Результат прогона: `path=/tasks/list.html?topic=1.1&view=all`, `runnerVisible=true`, 42 задачи, `hscroll=false` (390 и 1366), `data-home-variant=null`, без JS-ошибок. Скриншоты: `reports/site_restyle/shots/list_{desk,mob}.png` (полная страница, 42 карточки) и `reports/site_restyle/shots/list_top_{desk,mob}.png` (шапка крупно).

Прочие пути в list (для полноты, не использованы для съёмки): session-link `list.html?session=<token>` (`bootSessionListMode`, строки 85–86, 346+; создаётся из teacher-picker) и legacy sessionStorage-flow из не-студенческого picker. Все три режима рендерят ту же `.panel`/`#runner`, так что план рестайла валиден для всех.

## Десктоп

- Проблемы:
  - **Нет сайдбар-рельса слева.** Эталон (home_student) на десктопе — фиксированный 56px-рельс (hover-expand) со Статистика / Мои ДЗ / Профиль / пользователь+Выйти. Здесь его нет вообще; навигация вне страницы — только кнопка «На главную» в правом верхнем углу.
  - **Старый верхний контур навигации.** В правом верхнем углу — пилюля «Антон» + колокольчик + кнопка «На главную» (всё монтирует `app/ui/header.js` в `.page-head-right`). На эталоне `.page-head-right` визуально скрыт (`home-student.css` ~1196–1199: `body[data-home-variant] .page-head-right{display:none}`), навигация уходит в рельс.
  - **Нет eyebrow над заголовком.** Эталон: `.home-eyebrow` («ПОДГОТОВКА К ЕГЭ…») мелким капсом + `.home-h1`. Здесь — плейн-`<div class="crumb">Список задач</div>` без классов эталона (`list.html` строки 159–161).
  - **Обрамляющая `.panel` («коробка в коробке»).** Весь `#runner` обёрнут в `<div class="panel">` (строка 158), внутри которого и шапка, и список карточек. Эталон — контент по центру в `.container` без внешней panel; карточки уже сами по себе panel-блоки. Здесь панель-в-панели.
  - **Не подключены стилевые слои главной.** В `<head>` (`list.html` 135–138) только `tokens.css` + `base.css` + `pages/list.css` + `print.css`. Отсутствуют `./trainer/pages/home-student.css` и `./home_student.mobile.css`, где живёт весь рельс/гамбургер/типографика (`body[data-home-variant]`).
  - **Нет `data-home-variant` на `<body>`** (`list.html` 154: голый `<body>`). Без него ни одно правило `body[data-home-variant] …` (рельс, скрытие пилюли, eyebrow, clearance контента) не активируется. Прогон подтвердил `data-home-variant=null`.
  - Контент не сдвинут вправо под рельс (нет `padding-left:56px`), т.к. слой не подключён.

- План:
  1. В `<head>` `list.html` добавить два `<link>` ровно как в `home_student.html`, путь относительно `tasks/`: `./trainer/pages/home-student.css` и `./home_student.mobile.css` (с `?v=` через bump_build). Порядок слоёв: tokens → base → pages/list → home-student → home_student.mobile (print.css оставить как есть для печати).
  2. На `<body>` добавить `data-home-variant="student"`. Включит: скрытие `.page-head-right`, рельс-clearance `padding-left:56px`, eyebrow/H1-типографику, рельс.
  3. В `#appHeader` заменить `<div class="crumb">Список задач</div>` на блок-эталон: `<div class="home-head-text"><div class="home-eyebrow">Подготовка к ЕГЭ по профильной математике</div><h1 class="home-h1">Список задач</h1></div>` (текст eyebrow/H1 согласовать; класс важнее текста). `.crumb` в `#summary` (строка 213) можно не трогать — секция `hidden`.
  4. **Решить судьбу `#printBtn` / `#copySessionLink` / `.theme-toggle` (КРИТИЧНО — см. Риск).** Эти три контрола сейчас в `#appHeader` с `data-header-extra="1"`, header.js переносит их в `.page-head-right`, который `data-home-variant` погасит → **печать и копирование ссылки исчезнут**. Нужно либо (а) убрать у них `data-header-extra="1"` и спозиционировать page-scoped рядом с H1/в шапке runner вне `.page-head-right`, либо (б) добавить page-scoped CSS-override, возвращающий видимость именно этим контролам внутри `.page-head-right` на list. Согласовать с куратором — это не косметика, а функциональный контур печати.
  5. Добавить кнопку-гамбургер `#htSidebarOpen` (`ht-burger ht-burger-open`) в `#appHeader` — копия из `home_student.html` (строка ~130). На десктопе скрыта media-правилом, на мобилке станет триггером рельса.
  6. Вставить перед `</body>` полный блок `#htSidebar` (рельс/оверлей/nav: Статистика/Мои ДЗ/Профиль/пользователь+Выйти) — копия 1-в-1 из `home_student.html` (строки ~352–427).
  7. Подключить inline-IIFE открытия/закрытия сайдбара + синк имени из `#userMenuBtn` + выход через скрытый `#menuLogout` + навигация + бейдж `body.has-notif` — копия 1-в-1 из `home_student.html` (строки ~430–563). `initHeader` уже импортируется инлайн-модулем (`list.html` 186–193) и продолжит монтировать `#userMenuBtn`/`#menuLogout`, нужные сайдбару.
  8. Снять обрамляющую `.panel` с `#runner` (строка 158) ИЛИ сделать её прозрачной page-scoped, чтобы карточки задач были самостоятельными panel-блоками по центру `.container` (как у эталона), без «коробки в коробке». **Не менять id `#runner`/`#summary`** — на них завязан `list.js`.
  9. После правок модулей с `?v=` прогнать `node tools/bump_build.mjs`; синхронизировать `meta[name="app-build"]` со всеми `?v=` в файле.

## Мобилка

- Проблемы:
  - **Нет гамбургера** справа вверху. На эталоне (home_student_mob) справа — иконка-гамбургер `#htSidebarOpen`, открывающая full-screen overlay-сайдбар. Здесь вместо него — старая пилюля «Антон» + домик-иконка `#homeBtn` + ниже печать/тема, что не соответствует мобильному языку эталона.
  - **Нет мобильного сайдбара-оверлея** (Статистика/Мои ДЗ/Профиль/Выйти) — навигация на мобилке практически отсутствует, кроме «домика».
  - **Нет eyebrow** над H1 (как и на десктопе); заголовок — плейн-`.crumb`.
  - **Обрамляющая `.panel`** даёт лишние боковые отступы «коробки» вокруг карточек на узком экране.
  - **iOS-зум не зафиксирован.** `list.html` viewport (строка 54) = `width=device-width, initial-scale=1` — БЕЗ `maximum-scale=1,user-scalable=no`. Эталон (`home_student.html` 44) использует анти-зум-viewport. Без него нативные select/инпуты на iOS дают shrink-to-fit/зум.
  - Горизонтального скролла на снятом состоянии нет (`hscroll=false` на 390), но это надо перепроверить на ЗАПОЛНЕННОМ списке с широкими формулами/картинками (см. план п.3).

- План:
  1. Пункты 1–7 десктопа автоматически дают мобильный гамбургер: общий слой (`@media (max-width:1024px)`) делает `#htSidebarOpen{display:flex; position:absolute; top:10px; right:16px}`, `home-head-text{padding-right:40px}` страхует H1 от наезда на гамбургер.
  2. Подключённый `home_student.mobile.css` даст мобильную раскладку шапки (eyebrow/H1 стопкой) и ужатие пилюли (она всё равно скрыта вместе с `.page-head-right`).
  3. Проверить отсутствие горизонтального скролла на ЗАПОЛНЕННОМ `#runner` (широкая формула MathJax / картинка-чертёж — в снятых шотах чертежи параллелограмма уже близко к правому краю карточки): при необходимости page-scoped страховка `main{overflow-x:clip}` для `body[data-home-variant]` (по аналогии с teacher-правилом в `home_teacher.layout.css`). MathJax/img уже имеют `max-width:100%` в base.css.
  4. iOS-зум: для паритета согласовать добавление `maximum-scale=1,user-scalable=no` в viewport `list.html` (a11y red-zone-ish — обсудить с куратором), либо положиться на `overflow-x:clip`. **Внимание к печати:** убедиться, что изменение viewport не ломает print-раскладку (`print.css` + `print_lifecycle.js`).

## Риск/функционал

- **КРИТИЧНО: печать и ссылка-на-подборку могут пропасть.** `#printBtn`, `#copySessionLink`, `.theme-toggle` помечены `data-header-extra="1"` (`list.html` 163–183) → header.js перекладывает их в `.page-head-right` (`app/ui/header.js` 218–221) → `data-home-variant` гасит `.page-head-right` (`home-student.css` ~1196–1199). Печать — core-контур (CLAUDE.md print-contract: `print_lifecycle.js`, `print_btn.js`, `print.css`). На остальных student-страницах (analog/stats/unique) такого header-print-кнопки нет, поэтому риск **специфичен для list (и hw/trainer с тем же паттерном)**. Обязательно явно решить п.4 десктоп-плана ДО реализации, иначе тихая потеря функционала. Это scope-уточнение — фиксировать с куратором.
- **Не трогать логику `list.js`.** Файл ведёт три режима (обычный по selection, `?topic=&view=all`, `?session=<token>`), печать через `registerStandardPrintPageLifecycle({ blankInnerHtmlSelector:'.hw-bell' })` (строки 49–52), рендер карточек, `safeEvalExpr`, каталог/манифесты, RPC `questionStatsForTeacherV1`, session-link через `supaRest`/`getSession`. Рестайл = разметка `#appHeader` + добавление сайдбар-блока + подключение CSS + снятие внешней `.panel`. **Сохранить без изменений id `#runner`, `#summary`, `#printBtn`, `#copySessionLink`, `#themeToggle`, `#loadingOverlay`, `#restart`** — на них завязан JS/печать.
- **Red-zone: auth/logout.** Сайдбар «Выйти» работает через клик по скрытому `#menuLogout`, который монтирует `header.js`. Нельзя удалять/менять инлайн-импорт `initHeader` (`list.html` 191) и нельзя удалять `#userMenuBtn`/`#userMenuWrap`/`#menuLogout` из DOM — их только визуально скрывает `home-student.css`. Изменение auth-flow требует explicit approval.
- **Red-zone: общий CSS-слой.** `home-student.css` / `home_student.mobile.css` — общие для ученика И учителя (`body[data-home-variant]`). Любая правка САМИХ этих файлов влияет на home_student/home_teacher → согласовывать. list только ПОДКЛЮЧАЕТ их; точечные override (прозрачная `.panel`, видимость print-кнопки) выносить в page-scoped блок / `pages/list.css`, не редактируя общий слой.
- **Навигация сайдбара — относительные пути.** list.html лежит в `/tasks/`; в `home_student.html` (корень) IIFE строит nav-URL от `homeUrl` исходя из `/\/tasks(\/|$)/`-детекта (`home_student.html` ~512–529: `../` для tasks). При копировании IIFE в list проверить, что Статистика/Мои ДЗ/Профиль резолвятся корректно из `tasks/list.html` (ожидается ветка «in tasks → ../» как у analog).
- **Cache-busting (`?v=`).** Обязателен `node tools/bump_build.mjs` после правок — иначе браузер подтянет старый list.html/CSS из кеша. Синхронизировать `meta[name="app-build"]` со всеми `?v=`.
- **Governance.** `tools/check_trainer_css_layers.mjs`: list теперь грузит `pages/home-student` — обновить HTML-карту/footprint при необходимости (токены сайдбара `#htSidebar*`/`.ht-sidebar*` отсутствуют в footprint-матрице → пропускаются). `check_no_eval.mjs` должен остаться зелёным.
