# analog — аудит и план рестайла

Страница «Задача на закрепление» сейчас НЕ приведена к эталону home_student: нет сайдбара (ни десктоп-рельса, ни мобильного гамбургера), используется старый верхний контур (пилюля «Антон» + кнопка «На главную»), нет eyebrow-надписи над H1 и не подключён ни один из стилевых слоёв главной (`home-student.css` / `home_student.mobile.css`). Визуально это «голая» панель в верху экрана — далеко от эталона по навигации, средне — по типографике/карточке. Severity: medium.

Контекст: в скриншоте показано пустое состояние («Нет данных для аналога…»), потому что нет `sessionStorage['analog_request_v1']`. Это нормальный empty-state; основной контент (#runner с задачей) рендерится той же `.panel`, так что план рестайла одинаково валиден и для заполненного состояния.

## Десктоп

- Проблемы:
  - **Нет сайдбар-рельса слева.** Эталон (home_student) на десктопе имеет фиксированный 56px-рельс (`.ht-sidebar-panel`, hover-expand до 220px) со Статистика / Мои ДЗ / Профиль / пользователь. Здесь его нет вообще.
  - **Старый верхний контур навигации.** В правом верхнем углу — пилюля «Антон» + колокольчик + кнопка «На главную» (это то, что монтирует `app/ui/header.js`). На эталоне эта `.page-head-right` визуально скрыта (`display:none` через `body[data-home-variant]`), а навигация уходит в рельс.
  - **Нет eyebrow над заголовком.** Эталон: `.home-eyebrow` («ПОДГОТОВКА К ЕГЭ…») мелким капсом + `.home-h1`. Здесь — голый `<h1 id="analogTitle">` без eyebrow и без классов `home-h1`.
  - **Не подключены стилевые слои главной.** В `<head>` analog.html только `tokens.css` + `base.css`. Отсутствуют `tasks/trainer/pages/home-student.css` и `tasks/home_student.mobile.css`, в которых живёт весь рельс/гамбургер/типографика (`body[data-home-variant]`).
  - **Нет `data-home-variant` на `<body>`.** Без него ни одно из правил `body[data-home-variant] …` (рельс, скрытие пилюли, eyebrow, clearance контента) не активируется.
  - Контент не сдвинут вправо под рельс (нет `padding-left:56px` на body[data-home-variant="student"]), т.к. весь слой не подключён.

- План:
  1. В `<head>` добавить два `<link>` ровно как в `home_student.html` (с `?v=` через bump_build): `./trainer/pages/home-student.css` и `./home_student.mobile.css` (путь относительно `tasks/`: `./trainer/pages/home-student.css`, `./home_student.mobile.css`).
  2. На `<body>` добавить атрибут `data-home-variant="student"`. Это включит: скрытие `.page-head-right`/`#userMenuWrap`, рельс-clearance `padding-left:56px`, eyebrow/H1-типографику, рельс.
  3. В шапке `#appHeader` заменить голый `<h1>` на блок-эталон:
     `<div class="home-head-text"><div class="home-eyebrow">…</div><h1 class="home-h1" id="analogTitle">Задача на закрепление</h1></div>`
     (eyebrow можно взять «Подготовка к ЕГЭ по профильной математике» либо контекстный «Задача на закрепление»-eyebrow — согласовать с куратором; класс важнее текста).
  4. Добавить кнопку-гамбургер `#htSidebarOpen` (`.ht-burger.ht-burger-open`) внутрь `#appHeader` — копия из `home_student.html` (на десктопе она скрыта правилом `@media (min-width:1025px){#htSidebarOpen{display:none}}`, на мобилке станет триггером рельса).
  5. Вставить перед `</body>` полный блок `#htSidebar` (рельс/оверлей/nav: Статистика/Мои ДЗ/Профиль/пользователь+Выйти) — копия 1-в-1 из `home_student.html` (строки ~352–425).
  6. Подключить inline-скрипт открытия/закрытия сайдбара + синк имени из `#userMenuBtn` + выход через скрытый `#menuLogout` + навигацию + бейдж `body.has-notif` — копия 1-в-1 из `home_student.html` (IIFE строки ~430–564). `initHeader` уже вызывается (строки 63–69 analog.html) и продолжает монтировать `#userMenuBtn`/`#menuLogout`, нужные сайдбару.
  7. После правок модулей с `?v=` прогнать `node tools/bump_build.mjs` (cache-busting), синхронизировать `meta[name="app-build"]`.

## Мобилка

- Проблемы:
  - **Нет гамбургера** в правом верхнем углу. На эталоне (home_student_mob) справа вверху — иконка-гамбургер `#htSidebarOpen`, открывающая full-screen overlay-сайдбар. Здесь вместо него — старая пилюля «Антон» + домик-иконка `#homeBtn`, что не соответствует мобильному языку эталона.
  - **Нет мобильного сайдбара-оверлея** (Статистика/Мои ДЗ/Профиль/Выйти) — навигация на мобилке практически отсутствует, кроме «домика».
  - **Нет eyebrow** над H1 (как и на десктопе).
  - Сама карточка `.panel` на мобилке выглядит относительно ок (вписывается в ширину, без явного горизонтального скролла на пустом состоянии), но т.к. слой `home_student.mobile.css` не подключён — нет гарантий мобильных override'ов (eyebrow-размер, ужатие шапки, безопасные отступы) при заполненном `#runner` (длинные формулы MathJax могут дать переполнение).

- План:
  1. Те же пункты 1–6 из десктопа автоматически дают мобильный гамбургер: правило в `home_teacher.layout.css`/общем слое (`@media (max-width:1024px)`) делает `#htSidebarOpen{display:flex; position:absolute; top:10px; right:16px}`, а `home-head-text{padding-right:40px}` страхует от наезда H1 на гамбургер.
  2. Подключённый `home_student.mobile.css` даст мобильную раскладку шапки (eyebrow/H1 стопкой) как у эталона.
  3. Проверить отсутствие горизонтального скролла на ЗАПОЛНЕННОМ `#runner` (задача с широкой формулой/картинкой): при необходимости добавить страховку `main{overflow-x:clip}` для `body[data-home-variant]` по аналогии с teacher-правилом (`home_teacher.layout.css` ~722). MathJax-контейнеры уже имеют `max-width:100%` в base.css.
  4. iOS-зум: `home_student.html` использует `viewport ... maximum-scale=1,user-scalable=no`; analog.html сейчас — `width=device-width,initial-scale=1` (без maximum-scale). Для паритета анти-зума согласовать с куратором добавление `maximum-scale=1,user-scalable=no` (red-zone-ish для a11y — обсудить), либо положиться на `overflow-x:clip`, чтобы не было shrink-to-fit.

## Риск/функционал

- **Не трогать логику analog.js.** Файл (~1088 строк) ведёт сессию решения аналога: чтение `sessionStorage['analog_request_v1']`/`analog_session_v1`, рендер задачи в `#runner`, `safeEvalExpr`, запись попытки через `insertAttempt` (`supabase-write.js`), видео-решения, `ensureSessionReady`, каталог. Рестайл — только разметка `#appHeader` + добавление сайдбар-блока + подключение CSS; **id `#analogTitle`, `#analogMsg`, `#runner` сохранить без изменений** (на них завязан JS).
- **Red-zone: auth/logout.** Сайдбар «Выйти» работает через клик по скрытому `#menuLogout`, который монтирует `header.js`. Нельзя удалять/менять вызов `initHeader(...)` (строки 63–69) и нельзя удалять `#userMenuBtn`/`#userMenuWrap`/`#menuLogout` из DOM — их только визуально скрывает `home-student.css`. Изменение auth-flow требует explicit approval.
- **Red-zone: общий CSS-слой.** `home-student.css` / `home_student.mobile.css` — общие для ученика И учителя (`body[data-home-variant]`). Любая правка САМИХ этих файлов влияет на home_student/home_teacher → согласовывать; предпочтительно analog только ПОДКЛЮЧАЕТ их, без модификации. Если analog нужны точечные override (например `#runner` spacing) — выносить в отдельный page-scoped блок, не редактируя общий слой.
- **Cache-busting (`?v=`).** Обязателен `node tools/bump_build.mjs` после правок — иначе браузер подтянет старый analog.html/CSS из кеша. Синхронизировать `meta[name="app-build"]` со всеми `?v=` в файле.
- **Навигация сайдбара.** Ссылки в IIFE (`tasks/stats.html`, `tasks/my_homeworks.html`, `tasks/profile.html`) строятся от `homeUrl` (../ т.к. analog в `/tasks/`). Сверить, что относительный путь резолвится корректно из `tasks/analog.html`.
