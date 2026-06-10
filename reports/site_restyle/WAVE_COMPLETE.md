# Site restyle wave — СВОДНЫЙ ОТЧЁТ (волна завершена)

> Все 12 app-страниц приведены к единому стилю эталона (главные ученика/учителя). Локально, **БЕЗ пуша** — оператор ревьюит и пушит сам.

## ДОБАВЛЕНО (2026-06-08, доработка меню, build `2026-06-08-7`)
4 фикса сайдбара (по фидбеку оператора). Реализованы через НОВЫЙ общий аддитивный модуль **`app/ui/sidebar.js`** (подключён на все 14 страниц с сайдбаром одной строкой; инлайн-IIFE страниц не трогали — он продолжает open/close/имя/выход/нотиф):
1. **Пункт «Главная» (домик) первым** во всех меню; цель по роли (ученик→home_student, учитель→home_teacher).
2. **Подсветка активного пункта** по текущему пути (`.ht-sidebar-item.active`): строка на раскрытом/мобилке, иконка на свёрнутом рельсе. CSS — в `home-student.css`.
3. **Профиль role-aware:** `profile.html` был жёстко student → для учителя меню ломалось. Теперь `#htSidebar[data-sidebar-role="auto"]` → модуль определяет роль (#menuStats/кэш), ставит `body[data-home-variant]` и набор пунктов по роли. Clearance под рельс для teacher — в `pages/profile.css` (профиль не грузит teacher-слои → конфликта нет).
4. **Персист рельса:** состояние `.open` в `localStorage` (`ege_sidebar_open`, только десктоп), восстановление на загрузке без анимации-мигания (`body.ht-sidebar-restoring`).

Проверено Playwright на всех 14 страницах (обе роли, прямой/nav/session-заход): «Главная» первой везде; active корректен (stats→Статистика, homes→Главная, profile→Профиль, my_homeworks/archive→Мои ДЗ, my_students/student→Мои ученики, прочие→none); профиль учителя = teacher-меню+variant; персист раскрыт↔свёрнут переживает навигацию. Гейты зелёные, print-features 36/0, JS-ошибок нет.

Файлы доработки: **новый** `app/ui/sidebar.js`; правки `tasks/trainer/pages/home-student.css` (active+no-anim), `tasks/trainer/pages/profile.css` (teacher clearance), 14 `*.html` (1 строка импорта; profile — ещё `data-sidebar-role="auto"`). Остальное — bump `?v=`.

### Доработка-2 меню (build `2026-06-08-8`, фидбек оператора)
5. **Active только на страницах-пунктах.** Подсветка остаётся ровно на 5 пунктах-страницах (home/stats/my_homeworks/my_students/profile). Подстраницы/режимы, которых нет в меню — **открытое ДЗ (hw), архив (my_homeworks_archive), открытый ученик (student.html)**, а также trainer/list/unique/analog/hw_create — НЕ подсвечивают ничего (раньше hw/archive→«Мои ДЗ», student→«Мои ученики»). Сужен `matchFor` в `sidebar.js`. Проверено Playwright по всем страницам обеих ролей.
6. **Убрано мигание рельса при навигации.** Корень: восстановление `.open` шло async-модулем уже ПОСЛЕ первой отрисовки → 1 кадр свёрнутого рельса (56→220 скачок). Фикс: восстановление состояния делается **синхронно до первой отрисовки** — инжектируемый сниппет заменён с `<script type="module">` на классический `<script>` (выполняется во время парсинга), который сначала ставит `.open`, затем грузит модуль. Подтверждено замером: рельс уже `open/w=220` на `readyState='interactive'` (до paint). `restoreOpen` в модуле оставлен fallback'ом.

---

> (ниже — отчёт исходной волны рестайла)

## Статус: 12/12 готово ✅

| # | Страница | Роль | Статус |
|---|----------|------|--------|
| 1 | stats | student | ✅ пилот + моб.пилюля пофикшена |
| 2 | profile | student | ✅ |
| 3 | analog | student | ✅ (+pages/analog.css) |
| 4 | my_homeworks | student | ✅ |
| 5 | my_homeworks_archive | student | ✅ |
| 6 | my_students | teacher | ✅ |
| 7 | student (teacher view) | teacher | ✅ (+фикс overlap stats-аккордеона) |
| 8 | trainer | student | ✅ print-пилот, h-scroll 412→390 |
| 9 | list | student | ✅ print |
| 10 | hw | student | ✅ print (+новый pages/hw.css) |
| 11 | unique | student | ✅ print |
| 12 | hw_create | teacher | ✅ teacher+print |

Каждая страница проверена вживую (Playwright, логин из .env.local, viewport-скриншоты mob 390 + desk 1366): рельс на десктопе / гамбургер справа вверху на мобилке, eyebrow+H1, карточки в палитре эталона, пилюля скрыта, **горизонтального скролла нет** ни на одной. Скриншоты: `reports/site_restyle/shots/*_after_*.png` (+ trainer/list/hw/my_students/student через nav-helpers).

## Ключевое решение волны (общий фикс, повлиял на все страницы)
**`tasks/trainer/pages/home-student.css`** — изменено hide-правило шапки:
- Было: `body[data-home-variant] .page-head-right, #userMenuBtn, #userMenuWrap { display:none }` — пряталась ВСЯ правая панель.
- Стало: `body[data-home-variant] #userMenuBtn, #userMenuWrap, #homeBtn { display:none !important }` — прячем только пилюлю + «На главную».
- **Почему:** (1) на мобилке base.css форсит `.page-head-right{display:flex}` с ID-специфичностью (1,2,1) → `#homeBtn` («На главную», header.js создаёт на всех /tasks/-страницах при isHome=false) налезал на гамбургер (корень «моб.пилюли» из HANDOFF). `!important` бьёт ID-специфичность. (2) НЕ прячем `.page-head-right` целиком → на print-страницах (trainer/list/hw/unique/hw_create) контролы Печать/копия/тема (data-header-extra) сохраняются.

## Print-страницы — подход (валидирован на trainer-пилоте)
Контролы `#printBtn`/`#copySessionLink`/`.theme-toggle` остаются с `data-header-extra="1"` (видны на десктопе top-right). На мобилке page-scoped CSS переносит `.page-head-right` отдельным рядом во всю ширину под eyebrow/H1 (правый верхний угол — у гамбургера):
```css
@media (max-width:1024px){
  body[data-home-variant] #appHeader .page-head-right{
    grid-column:1/-1; flex-direction:row; flex-wrap:wrap;
    justify-content:flex-start; align-items:center; margin-top:10px;
  }
}
```
Trainer h-scroll (412px на 390): корень `#copySessionLink` без max-width → добавлен `max-width:100%;ellipsis` на мобилке. Итог `scrollWidth==clientWidth==390`.

## Реальные изменённые файлы (без учёта bump-sweep `?v=`)
- **Shared:** `tasks/trainer/pages/home-student.css` (hide-правило), `tools/check_trainer_css_layers.mjs` (HTML-карта: +`pages/home-student` всем 12).
- **Per-page HTML:** все 12 `tasks/*.html` (data-home-variant, viewport, eyebrow+H1, гамбургер, блок `#htSidebar`, inline-IIFE, подключение CSS-слоёв).
- **Per-page CSS (`tasks/trainer/pages/`):** stats.css*, student.css, my-students.css, list.css, unique.css, hw-create.css, trainer.css (правки) + **новые** analog.css, hw.css.
- **`version.json`** (build 2026-06-08-5). Остальные «M» в git — bump-sweep `?v=`.

(* stats.css/analog.css созданы ранее в пилоте/этой волне; см. git status — часть untracked.)

## Гейты (все зелёные)
- `node tools/check_trainer_css_layers.mjs` → ok
- `node tools/check_no_eval.mjs` → ok
- `node tools/check_runtime_rpc_registry.mjs` → ok
- `node tools/check_runtime_catalog_reads.mjs` → ok
- `cd tests && node print-features.js` → **36 прошло, 0 упало** (print-контур цел)

## Замечания оператору (вне scope рестайла, на ваше решение)
1. **Pre-existing, не регрессия:** `tasks/my_homeworks_archive.html` в консоли даёт `window.Sentry.browserTracingIntegration is not a function` — это его inline Sentry-init (в загруженном бандле метода нет). Sentry-блок рестайл НЕ трогал (git diff пуст по этим строкам). Стоит отдельно починить Sentry-инициализацию archive.
2. **student.html stats-аккордеон (≤420px):** бейдж покрытия `.sec-cov` налезал на метрики — это pre-existing баг shared stats-компоненты (root stats.css, фикс-ширины слотов «голодят» левую колонку). Починен тем же приёмом, что у stats.html (гибкие слоты), в `pages/student.css` @media ≤420px. Безопасно, mobile-only.
3. **`htNavWorks` («Выданные работы») у учителя** ведёт на `my_students.html` (TODO из home_teacher.html, перенесён как есть — отдельной страницы выданных работ учителя пока нет).

## Дальше
Ревью + пуш — за оператором. Перед деплоем build уже сбамплен (`2026-06-08-5`); если будут доправки — `node tools/bump_build.mjs`.
