# HANDOFF — волна рестайла сайта под единый стиль

> **СТАТУС (2026-06-08): ВОЛНА ЗАВЕРШЕНА — 12/12 страниц готовы.** Итоговый отчёт: `reports/site_restyle/WAVE_COMPLETE.md`. Build `2026-06-08-5`, всё локально, **БЕЗ пуша** (ревью+пуш за оператором). Ниже — исторический контекст волны (как велась).

> Прочитай этот файл первым, затем `reports/site_restyle/PLAN.md`, затем per-page `reports/site_restyle/<page>.md`. **НЕ пушить** — оператор сам ревьюит и пушит в конце.

## TL;DR
Привести ВСЕ app-страницы к единому стилю эталона (главные ученика/учителя). Аудит готов (12 доков + мастер-план + скриншоты). Пилот `stats` сделан и принят (десктоп — эталонно; 1 мобильный косяк, см. ниже). Осталось: добить мобильную пилюлю на stats + развернуть рецепт на 11 страниц с verify-loop. Всё локально, build `2026-06-07-89`, без пуша.

## Контекст проекта
- EGE-trainer: статический MPA (HTML+vanilla JS+CSS, без сборки), деплой GitHub Pages, бэкенд Supabase через `api.ege-trainer.ru`.
- Локальный запуск: `python3 -m http.server 8000`. Тест-креды в `.env.local`: `E2E_STUDENT_EMAIL/PASSWORD`, `E2E_TEACHER_EMAIL/PASSWORD`.
- **Эталон стиля:** `home_student.html` / `home_teacher.html` (уже причёсаны: карточки, eyebrow+H1, сайдбар-рельс на десктопе + гамбургер справа вверху на мобилке, без горизонтального скролла, iOS без зума).
- Решения оператора по этой волне: охват — ТОЛЬКО app-страницы (auth/google_complete/index НЕ трогать); сайдбар добавить на ВСЕ app-страницы; после аудита сразу реализация; **пуш — только оператор**.

## Артефакты (reports/site_restyle/)
- `PAGES.md` — манифест 12 страниц + роли + статусы.
- `PLAN.md` — **мастер-план**: общий рецепт + критичные findings + логистика. ЧИТАТЬ ОБЯЗАТЕЛЬНО.
- `<page>.md` ×12 — per-page аудит + план (## Десктоп / ## Мобилка / ## Риск).
- `shots/` — скриншоты ×2 вьюпорта; `*_after_*` = после правок.
- `cap.cjs` (per-page), `capAll.cjs` (массовый), `navCap.cjs` (nav-страницы) — Playwright-помощники: логин роли + скриншоты mob/desk + проверка горизонтального скролла. Образец логин-флоу — в `cap.cjs`.

## Текущее состояние (uncommitted, build 2026-06-07-89, БЕЗ пуша)
- **Пилот `stats` СДЕЛАН и принят:**
  - `tasks/stats.html` — применён рецепт (data-home-variant=student, подключены home-student.css + home_student.mobile.css, сайдбар #htSidebar+#htSidebarOpen+IIFE, шапка eyebrow+H1, viewport maximum-scale, убрана внешняя .panel).
  - `tasks/trainer/pages/stats.css` — НОВЫЙ page-scoped CSS (карточки .stat-card/.acc-item к палитре эталона + мобильная защита от h-scroll).
  - `tools/check_trainer_css_layers.mjs` — карта для stats обновлена (`'tasks/stats.html': ['tokens','base','pages/stats','pages/home-student']`).
  - Проверено: css-layers ✓, no-eval ✓, JS-ошибок нет, h-scroll нет (mob+desk), **десктоп идеально совпадает с эталоном** (рельс/eyebrow+H1/карточки/без панели).
- **ОСТАЛОСЬ на stats (первый корректив):** на МОБИЛКЕ user-пилюля (аватар header.js) наложена на гамбургер справа вверху — должна быть скрыта (как на эталоне: только гамбургер + красный кружок). На десктопе скрыта корректно. Диагностировать (почему `body[data-home-variant] #userMenuBtn/.page-head-right{display:none}` из home-student.css не срабатывает на stats-мобилке) и починить — это же refinement для остальных страниц.
- **git status шумный** из-за `bump_build` (правит `?v=` во всех файлах). Реальные рестайл-правки: `tasks/stats.html`, `tasks/trainer/pages/stats.css`, `tools/check_trainer_css_layers.mjs`, `version.json`. Остальные M — bump-sweep.

## Рецепт (применять к каждой странице; детали — PLAN.md)
1. `<body data-home-variant="student"|"teacher">`.
2. Подключить в `<head>` после tokens/base/page-css: `home-student.css` (+ `home_student.mobile.css` для student). Пути относительно `tasks/` как у соседних страниц; параметр `?v=` синхронизировать bump-ом.
3. Сайдбар 1-в-1 из главной: гамбургер `#htSidebarOpen` (в шапку), блок `#htSidebar` (перед скриптами), инлайн-IIFE (open/close, синк имени из `#userMenuBtn`, logout `#menuLogout`, Esc, оверлей). Пункты: ученик — Статистика/Мои ДЗ/Профиль; учитель — Мои ученики/Выданные работы/Профиль; внизу пользователь+Выход.
4. Шапка: `.home-eyebrow` («Подготовка к ЕГЭ по профильной математике») + `.home-h1` (заголовок страницы). `header.js`/`initHeader` НЕ удалять (даёт имя+скрытый `#menuLogout`); старую пилюлю/«На главную» скрывает home-student.css.
5. viewport: `width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no`.
6. Убрать лишнюю внешнюю `.panel`; карточки к палитре эталона (radius 16, panel-фон, тень) в page-scoped CSS (`tasks/trainer/pages/<page>.css`), НЕ в общий слой.
7. Без горизонтального скролла на 390px.

## Критичные gotchas
1. **data-header-extra:** `#printBtn`/`#copySessionLink`/`.theme-toggle` помечены `data-header-extra` → `header.js` кладёт их в `.page-head-right`, которую home-student.css СКРЫВАЕТ. На страницах с печатью/копией/темой (**trainer, list, hw, unique**) рецепт «в лоб» молча уберёт функционал. Решение оператора: СОХРАНИТЬ контролы (изменить hide-правило на только `#userMenuBtn/#userMenuWrap/.hw-bell*` ИЛИ перенести контролы в контент-ряд; спозиционировать рядом с гамбургером). Точное размещение — по визуалу в verify-loop.
2. **trainer h-scroll (подтверждён вживую):** корень — `#copySessionLink` в `.page-head-right` (нет max-width, текст не переносится) → scrollWidth 412 при 390. Фикс в `pages/trainer.css` (max-width+ellipsis / перенос в контент). Приёмка: scrollWidth==clientWidth==390.
3. **Мобильная пилюля** (из пилота) — см. выше; проверять на КАЖДОЙ странице, что аватар скрыт на мобилке.
4. **css-layers карту** (`tools/check_trainer_css_layers.mjs`) обновляет КУРАТОР (main loop) при приёмке, per-page: в HTML-map добавить `'tasks/<page>.html': ['tokens','base', (pages/<page> если есть свой CSS), 'pages/home-student']`. Агентам её НЕ трогать (у них она красная — это норма до обновления куратором).

## Процесс (как вёл я; повторять)
- **Реализация:** per-page агент (general-purpose), БЕЗ Playwright внутри (быстрее, прошлый раз большой агент с Playwright поймал socket-timeout за ~10 мин). Агент: рецепт по `<page>.md` + node-check + no-eval + bump, краткий отчёт. НЕ пушит, css-layers не гоняет.
- **Verify-loop (куратор):** обновить css-layers-карту для страницы → `node tools/check_trainer_css_layers.mjs` + `node tools/check_no_eval.mjs` (зелёные) → скриншоты mob+desk (свой Playwright/cap.cjs, логин из .env.local) → сравнить с эталоном (рельс/гамбургер/eyebrow+H1/карточки/без h-scroll/пилюля скрыта) → коррективы → доработка агентом → приёмка. Обновить статус в PAGES.md.
- **Уроки тестирования (важно!):**
  - fixed-сайдбар (`.ht-sidebar-panel position:fixed`) НЕ попадает в Playwright **fullPage**-скриншот → выглядит «исчез». Снимать **viewport** (`fullPage:false`) ИЛИ мерить `getBoundingClientRect()`.
  - teacher-статистика грузится **асинхронно ~3-6с** после выбора ученика — ждать `waitForFunction`, не `sleep`.
  - home-student.css грузится ПОСЛЕ home_teacher.layout.css → его правила (равной специфичности) перебивают учительские; учитывать каскад-порядок.

## Очередь страниц (severity → приоритет)
- Готово: **stats** (осталась мобильная пилюля).
- HIGH: `profile`, `unique`, `hw_create`.
- MED: `my_homeworks`, `my_homeworks_archive`, `analog`, `my_students`.
- NAV/print (gotcha с контролами): `trainer`, `list`, `hw`, `student`.
- Рекомендация: чистые student (profile, analog, my_homeworks, archive) → teacher (my_students, hw_create) → достижимые навигацией (student) → print-страницы (trainer, list, hw, unique) с сохранением контролов.

## Команды
```
python3 -m http.server 8000            # сервер
node tools/check_trainer_css_layers.mjs
node tools/check_no_eval.mjs
node tools/bump_build.mjs               # после правок ассетов
```

## Финал волны
Все 12 страниц причёсаны + гейты зелёные + визуал совпадает с эталоном на обоих вьюпортах → сводный отчёт оператору. **Пуш — только оператор после ревью.**
