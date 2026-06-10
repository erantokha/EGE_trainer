# Site restyle — мастер-план (консолидация аудита)

Аудит показал: ВСЕ app-страницы в старом визуальном языке. Проблемы единообразны → единый рецепт + per-page нюансы (см. `<page>.md`).

## Общий рецепт (применять к каждой странице)
1. **`body[data-home-variant="student"|"teacher"]`** (от него зависит общий стиль/сайдбар).
2. **Подключить общий CSS:** student-страницы → добавить `tasks/trainer/pages/home-student.css` + `tasks/home_student.mobile.css`; teacher-страницы → `tasks/trainer/pages/home-student.css` (+ при необходимости home_teacher.*). Порядок: tokens → base → (page css) → home-student → home_student.mobile.
3. **Сайдбар:** перенести блок `#htSidebar` + кнопку-гамбургер `#htSidebarOpen` + инлайн-JS открытия/закрытия 1-в-1 из соответствующей главной (`home_student.html`/`home_teacher.html`). Пункты: ученик — Статистика/Мои ДЗ/Профиль; учитель — Мои ученики/Выданные работы/Профиль; внизу пользователь + Выход. Десктоп — рельс; мобилка — гамбургер справа вверху.
4. **Шапка:** eyebrow `.home-eyebrow` («Подготовка к ЕГЭ по профильной математике») + `.home-h1` (заголовок страницы). Скрыть `header.js`-пилюлю (`#userMenuBtn`/`.page-head-right`) и старые кнопки «На главную»/«Печать» из шапки (header.js оставить — он даёт имя для сайдбара и скрытый `#menuLogout`).
5. **Viewport:** `width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no` (убирает iOS-зум; нативные select причёсываются общим CSS).
6. **Убрать лишнюю внешнюю `.panel`** («коробка в коробке») где есть; контент по центру в `.container`, карточки — как у эталона (radius 16, panel-фон, тень).
7. **Без горизонтального скролла**, мобильная раскладка как у эталона.

## Governance / каркас
- `tools/check_trainer_css_layers.mjs`: обновить HTML-карту (каждая страница теперь грузит `pages/home-student`) + при необходимости FILE_PAGES (home-student.css обслуживает все app-страницы). Токены сайдбара (#htSidebar*/.ht-sidebar*/#htNav*) отсутствуют в footprint-матрице → пропускаются проверкой.
- `check_no_eval.mjs` зелёный; `bump_build.mjs` после правок.
- **Red-zone / НЕ ломать:** id и JS рендера каждой страницы, RPC, auth, routing. Рестайл = разметка/CSS + перенос сайдбар-JS. data-home-variant НЕ менять после установки.

## Очередь страниц (severity → приоритет)
| Страница | Роль | Severity | Спец-нюансы |
|---|---|---|---|
| profile | student | HIGH | viewport без zoom-fix; самопальный titlebar ⚙ → eyebrow+H1 |
| stats | student | HIGH | карточки .stat-card/.acc-item к палитре эталона; аккордеон на h-scroll |
| unique | student | HIGH | старые текст-кнопки шапки; .panel прозрачной; не трогать unique.js (каталог/печать/видео) |
| hw_create | teacher | HIGH | одинокая .panel; поля/select к карточному стилю; red-zone hw RPC |
| my_homeworks | student | MED | снять внешнюю .panel; #myHwList рендер не трогать |
| my_homeworks_archive | student | MED | .crumb → eyebrow+H1; #archList/#loadMore не трогать |
| analog | student | MED | #runner/#analogTitle не трогать |
| my_students | teacher | MED | RPC list_my_students и id не трогать |
| trainer | student | ? | nav-захват; ЖАЛОБА на горизонтальный скролл на мобилке — проверить |
| list | student | ? | nav-захват |
| hw | student | ? | nav-захват |
| student | teacher | ? | nav-захват |

## Критичные findings аудита (учесть в реализации)
1. **Трейнер h-scroll:** `#copySessionLink` в `.page-head-right` (нет max-width, текст не переносится) → +22px на 390. Фикс в `pages/trainer.css` (max-width+ellipsis ИЛИ перенести в контент-ряд). Приёмка: scrollWidth==clientWidth.
2. **data-header-extra controls:** `#printBtn`/`#copySessionLink`/`.theme-toggle` помечены `data-header-extra` → header.js переносит их в `.page-head-right`, которую `home-student.css` СКРЫВАЕТ (`body[data-home-variant] .page-head-right{display:none}`). На страницах с печатью (**trainer, list, hw, unique**) рецепт «в лоб» молча уберёт Печать/копию/тему → ОБЯЗАТЕЛЬНО сохранить: либо изменить hide-правило на только `#userMenuBtn/#userMenuWrap/.hw-bell*` (не всю `.page-head-right`) и спозиционировать контролы слева от гамбургера, либо перенести контролы в контент-ряд страницы. Решение куратора: СОХРАНЯЕМ контролы (не теряем функционал); точное размещение — в verify-loop по визуалу.

## Логистика реализации
- **css-layers карту обновляю Я** (shared `check_trainer_css_layers.mjs`), по странице, при приёмке — чтобы агенты не конфликтовали на shared-файле. Агенты делают только HTML страницы + её page-CSS + перенос сайдбар-JS; css-layers НЕ гоняют (у них он будет красный — это норма до обновления карты мной).
- Изоляция: по странице (worktree при параллели). Без пуша.
- Сначала ПИЛОТ (stats) end-to-end → валидация рецепта + governance + verify-loop → потом масштабирование (чистые ~8 страниц, затем print-страницы trainer/list/hw/unique с сохранением контролов).

## Реализация (Фаза 3) + verify-loop (Фаза 4)
- Per-page агент в изоляции (worktree), по `<page>.md`, БЕЗ пуша.
- Я на каждую сданную: гейты (css-layers/no-eval/charnet/e2e где есть) + скриншоты мобилка/десктоп против эталона → коррективы → доработка до соответствия.
- Финал: сводный отчёт, пуш — оператор.
