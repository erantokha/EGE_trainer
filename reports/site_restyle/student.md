# student — аудит и план рестайла

reached: true

Страница `tasks/student.html` (роль TEACHER — карточка одного ученика, открывается кликом по `.student-card` из `my_students.html`). Скриншоты сняты живьём: `reports/site_restyle/shots/student_desk.png`, `reports/site_restyle/shots/student_mob.png` (логин teacher → `/tasks/my_students.html` → дождаться `.student-card` (8 карточек) → клик по первой → `location.href = ./student.html?student_id=...`; ученик «Антон Ермолаев» загрузился, статистика отрендерилась). Горизонтального скролла нет ни на десктопе (sw/cw=1366/1366), ни на мобилке (sw/cw=390/390).

**Навигационная заметка (для будущих агентов):** старые селекторы `a[href*="student.html"]` / `tbody tr` НЕ работают — карточка ученика это `div.panel.student-card` с `card.addEventListener('click', goOpen)`, переход через `location.href` (не `<a>`, не таблица). Правильный путь: дождаться `.student-card`, кликнуть по ней. Скрипт-помощник: `reports/site_restyle/studentCap.cjs`.

Визуальный язык карточек/бейджей близок к общему (`tokens.css`/`base.css` + `pages/student.css` + `stats.css`), НО страница **не подключена к навигационному каркасу учителя**: нет сайдбар-рельса на десктопе, нет гамбургера на мобилке, нет связки `eyebrow + крупный H1`, шапка осталась дефолтной (header.js: пилюля «Антон» + «На главную»). Дополнительно — двойная вложенность «коробка в коробке» (внешняя `.panel`) и самопальный titlebar с шестерёнкой ⚙ вместо eyebrow+H1. Severity: medium.

## Десктоп

- Проблемы:
  - **Нет левого сайдбар-рельса.** Эталон `home_teacher` рендерит фиксированный рельс 56px (`#htSidebar` / `.ht-sidebar-panel`, hover/open → 220px) с пунктами «Мои ученики / Выданные работы / Профиль» + юзер/выход в подвале. На `student.html` рельса нет вовсе — у `<body>` нет `data-home-variant`, не подключён `tasks/trainer/pages/home-student.css` (где живут все `.ht-sidebar*` / `.ht-burger`), нет блока `#htSidebar` и его inline-обвязки. Это главное расхождение каркаса.
  - **Шапка дефолтная вместо «eyebrow + H1».** Эталон: `.home-eyebrow` («ПОДГОТОВКА К ЕГЭ ПО ПРОФИЛЬНОЙ МАТЕМАТИКЕ») над крупным `.home-h1`. Здесь — `.student-page-titlebar` с мелким `<h1 id="pageTitle">` (имя ученика), рядом самодельная кнопка-шестерёнка `#studentGearBtn ⚙` (меню «Удалить»), а справа в углу висят пилюля «Антон» и «На главную» из `header.js` (на эталоне `.page-head-right`/`#userMenuBtn` скрыты через `body[data-home-variant]`).
  - **Двойная `.panel` (коробка в коробке).** Весь контент завёрнут во внешнюю белую `.panel` по центру `.container` (строка 132), без учёта рельса. Эталон делает контентную обёртку прозрачной (без карты/тени/радиуса) и тянет контент в область справа от рельса (`main { margin-left:56px }`); внутренние блоки (статистика, карточки) — самостоятельные карточки. Здесь же `smartHwBlock`/`worksBlock`/`statsRoot` разделены `<hr>` внутри одной большой карты — другой композиционный приём.
  - **Шестерёнка-titlebar вместо стандартной шапки.** `#studentGearBtn ⚙` + выпадающее меню `#studentGearMenu` («Удалить») — самопальный паттерн действий, которого нет в студенческом визуальном языке. Логичнее перенести его в правый край шапки рядом с eyebrow+H1 (как ряд действий), а не оставлять прилепленным к заголовку.
- План:
  - Добавить `data-home-variant="teacher"` на `<body>` и подключить `tasks/trainer/pages/home-student.css` (после `base.css`, перед `student.css`/`stats.css`) — это включит общие стили `.ht-sidebar*`, `.ht-burger`, `.home-eyebrow/.home-h1`, скрытие `.page-head-right`. При необходимости (позиционирование бургера в шапке) подключить также `home_teacher.layout.css`/`home_teacher.mobile.css` как на `my_students`.
  - Перенести/скопировать из `home_teacher.html` блок `#htSidebar` (nav: `#htNavStudents`/`#htNavWorks`/`#htNavProfile`, foot: `#htSidebarUserBtn`/`#htSidebarLogout`) и его inline-JS-обвязку (open/close/overlay/nav-переходы, ~строки 779–870 эталона). Желательно вынести инициализатор сайдбара в общий модуль (напр. `app/ui/teacher_sidebar.js`) и переиспользовать на `home_teacher`/`my_students`/`student`, чтобы не плодить копипасту.
  - Переписать шапку под эталон: обернуть в `.home-head-text` с `.home-eyebrow` + `.home-h1` (id `#pageTitle` СОХРАНИТЬ — student.js пишет туда имя ученика); строку активности `#studentSub` оставить под H1. Добавить кнопку-гамбургер `.ht-burger.ht-burger-open#htSidebarOpen` в `#appHeader` (на десктопе её скроет `@media(min-width:1025px) #htSidebarOpen{display:none}`). Блок действий `#studentActions`/`#studentGearBtn` перенести в правый край шапки.
  - Снять внешнюю `.panel`-обёртку (строка 132) или сделать её прозрачной + desktop-клиренс под рельс (`margin-left:56px`), как у `home_teacher`. Внутренние блоки (smart-hw / works / stats) причесать к карточному стилю эталона при необходимости — но это вторично, основной разрыв в каркасе.

## Мобилка

- Проблемы:
  - **Нет гамбургера и сайдбара.** Эталон на мобилке: гамбургер справа вверху (`.ht-burger#htSidebarOpen`), открывающий выезжающую панель `.ht-sidebar` с оверлеем. Здесь вместо него — аватар-кружок «Антон» + иконка «домой» из `header.js`; навигации по разделам учителя нет.
  - **Шапка не как у эталона.** Нет eyebrow; имя ученика переносится в 2 строки крупным H1 (ок), но рядом висят шестерёнка ⚙ и дефолтные элементы header.js вместо гамбургера. Строка «Активность: …» сдвинута вправо под H1 (выглядит как лишний отступ).
  - Горизонтального скролла/зума не замечено (sw/cw=390/390): карточки статистики одной колонкой, бейджи-метрики переносятся, переполнения нет — это ок, менять не нужно.
- План:
  - После подключения `data-home-variant="teacher"` + `home-student.css` + блока `#htSidebar` мобильная навигация заработает автоматически (гамбургер виден, `.page-head-right` скрыт, панель выезжает по `.open`).
  - Убедиться, что гамбургер позиционируется в правом верхнем углу `#appHeader` (как на `home_teacher`: `#appHeader{position:relative}` + mobile-правило абсолютного позиционирования `.ht-burger`). Для student нужно добавить аналогичное правило (на эталоне оно teacher-специфично в `home_teacher.layout.css`/`.mobile.css`).
  - **Viewport zoom-fix:** добавить `maximum-scale=1,user-scalable=no` (сейчас строка 44 — `width=device-width,initial-scale=1`). На странице много нативных `<select>`/`<input>` (период/источник/название ДЗ и т.п.) — на iOS фокус в input <16px провоцирует авто-зум; общий рецепт это закрывает. H-scroll сейчас нет, но zoom-fix всё равно ставить по рецепту.
  - Поправить отступ строки активности `#studentSub` под H1 (выровнять по левому краю, убрать визуальный сдвиг вправо).
  - Сохранить одноколоночную раскладку карточек статистики — переполнения нет, ничего ломать не надо.

## Риск/функционал

- **Red-zone — id и JS рендера НЕ трогать/НЕ переименовывать.** student.js читает: `#pageTitle`, `#studentSub`, `#backBtn`, `#studentGearBtn`/`#studentGearMenu`/`#studentDeleteBtn`, `#studentActions`, `#pageStatus`, `#statsRoot` (+ весь smart-hw контур: `#smartHwBlock`, `#smartRec*`, `#smartPlan*`, `#smartHw*`, `#var12*`, `#worksBlock`/`#worksPanel`/`#worksList`, `#statsFiltersToggle`). Все эти узлы должны остаться в DOM с теми же id; рестайл = разметка/CSS + перенос сайдбар-JS.
- **RPC / auth (red-zone, не ломать):** страница работает с teacher-RPC по `student_id` из URL (студент-статистика, smart-hw подбор, выданные работы, удаление ученика). Рестайл RPC-контрактов не касается. `initHeader({isHome:false})` нужен (имя пользователя для подвала сайдбара, скрытый `#menuLogout`/`#userMenuBtn` используются эталонной обвязкой выхода) — при скрытии `.page-head-right` через CSS оставлять элементы в DOM, не удалять.
- **Routing:** вход на страницу — клик по `.student-card` в `my_students.js` (формирует `./student.html?student_id=<sid>`, кладёт `sessionStorage` teacher:last_student). `#backBtn` («Назад к списку») и навигация сайдбара (Мои ученики/Выданные работы/Профиль) должны вести на корректные teacher-URL.
- **CSP connect-src:** на странице уже разрешены api.ege-trainer.ru / supabase / proxy (строка 5) — добавление `<link>`/блока сайдбара ничего в CSP не меняет.
- **CSS cache-busting:** добавление нового `<link>` на `home-student.css`(+layout/mobile) и правки шаблонов требуют `node tools/bump_build.mjs` (импорт с `?v=`), иначе кэш подтянет старое. `tools/check_trainer_css_layers.mjs` — обновить HTML-карту (student.html теперь грузит `pages/home-student`). Общий `tokens.css`/`base.css` — общий каркас, побочные эффекты на другие страницы не вносить; правки локальны к student-разметке.
