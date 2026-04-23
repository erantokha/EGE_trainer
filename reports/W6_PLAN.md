# W6_PLAN — Оценка migration-to-build track

Дата создания: 2026-04-22  
Дата актуализации: 2026-04-22  
Волна: `W6`  
Статус: planned  
Приоритет: `Low`

Связанные документы:
- `GLOBAL_PLAN.md`
- `PROJECT_STATUS.md`
- `CURATOR.md`
- `README.md`
- `tools/check_build.mjs`
- `tools/bump_build.mjs`

---

## 0. Назначение волны

`W6` не является волной внедрения bundler в production.

Это отдельный design/evaluation track, задача которого:
- понять, нужен ли проекту migration-to-build вообще;
- выбрать реалистичный target path без разрушения текущего MPA-режима;
- оценить стоимость и риски перехода;
- подготовить для оператора решение уровня `stop / proceed / postpone`.

Итог `W6` — не новый production runtime, а decision package.

---

## 1. Восстановленный baseline по репозиторию

На `2026-04-22` по репозиторию подтверждается:

- проект живёт как статический MPA без bundler/runtime-сервера;
- deployment рассчитан на GitHub Pages / статический хостинг;
- cache-busting построен вокруг `<meta name="app-build">` + `?v=...`;
- строгая согласованность build-id уже проверяется в `tools/check_build.mjs`;
- массовый bump версий уже автоматизирован через `tools/bump_build.mjs`.

Факты, которые делают трек чувствительным:

- HTML entrypoints вне `tests/` и `playwright-report/`: `33`;
- HTML-страниц с прямыми `type="module" src=...`: `18`;
- динамических `import(...)` в `app/` + `tasks/`: `59`;
- прямых мест использования `withBuild(...)`, `withV(...)`, `buildWithV(...)`: `107`.

Практический вывод:
- переход затронет не только сборку JS, но и модель путей, asset resolution,
  cache-busting, HTML entrypoints и dynamic import boundaries;
- поэтому `W6` нельзя вести как "подключить bundler и посмотреть что выйдет".

---

## 2. Контекст и мотивация

Сейчас у проекта есть две реальные боли, которые делают `W6` осмысленной:

1. без сборки проект сильно зависит от:
   - относительных путей;
   - ручного `?v=`;
   - page-specific import logic;
   - HTML-level orchestration;
2. крупные frontend-модули уже дороги в сопровождении и будут дорожать дальше.

Но при этом у текущей модели есть и сильные стороны:

- прозрачный статический deploy;
- понятный runtime без серверной сборки;
- совместимость с GitHub Pages;
- существующий smoke/governance контур уже настроен под текущий режим.

Поэтому `W6` должна не "продавать bundler", а честно сравнить:
- сколько реальной сложности он снимет;
- какую новую сложность он добавит;
- не окажется ли migration дороже выгоды в текущем масштабе проекта.

---

## 3. Рабочая гипотеза волны

Предварительная кураторская гипотеза для оценки:

- основной кандидат для evaluation path: `Vite` в режиме MPA;
- запасной контрольный кандидат: минимальный `esbuild`-path;
- `Parcel` допустим как reference option, но не как основной путь по умолчанию.

Почему именно так:

- по официальной документации `Vite` поддерживает multi-page build через набор
  HTML entrypoints и совместим с MPA-моделью;
- `Vite` имеет встроенную модель asset handling / `publicDir`, что ближе к
  текущему статическому deploy-профилю проекта;
- у `esbuild` code splitting официально отмечен как work in progress и завязан
  на `esm`, поэтому он полезен как контрольный "минималистичный" spike, но
  выглядит слабее как основной migration target;
- `Parcel` даёт zero-config HTML-first experience, но для этого проекта важнее
  не zero-config, а контролируемость MPA migration и предсказуемость build-path.

Это не финальный вердикт, а стартовая гипотеза для исполнителей.

---

## 4. Цель волны

Подготовить решение по migration-to-build в форме, пригодной для operator
decision.

К концу `W6` должно быть понятно:

- нужен ли проекту переход на сборку вообще;
- какой target path реалистичен;
- какой минимальный migration slice можно пройти первым;
- какие риски являются блокирующими;
- что будет стоить поддержка новой build/deploy модели.

---

## 5. Out of Scope

В `W6` не входят:

- полный перевод проекта на bundler;
- массовая перепрошивка всех HTML/JS страниц;
- редизайн frontend-архитектуры;
- переписывание страниц на другой framework;
- смена хостинга, backend-платформы или auth-модели;
- массовое удаление `?v=` и текущего cache-busting до принятого решения;
- product-фичи, layout fixes и unrelated refactor;
- смешивание с `W2`, `W3`, `W4` или `W5`.

Если в ходе `W6` выяснится, что нужен production-grade migration spike на
несколько страниц, это уже отдельная следующая волна, а не сама `W6`.

---

## 6. Ожидаемые артефакты

Обязательные артефакты `W6`:

- `w6_report.md` — итоговый decision package;
- `docs/navigation/build_migration_inventory.md` — инвентарь entrypoints,
  import patterns, asset-path classes и cache-busting surface;
- `docs/navigation/build_migration_options.md` — сравнение кандидатов;
- `docs/navigation/build_migration_recommendation.md` — итоговая рекомендация;
- при необходимости:
  - `vite.config.*` или `tools/build_spike/*` как локальный spike;
  - `package.json` scripts только для изолированного evaluation path;
  - минимальный prototype output, не заменяющий текущий production path.

Если spike делается, он должен быть явно помечен как non-production.

---

## 7. Пошаговый план волны

### W6.0 — Инвентаризация build-surface

Статус: `pending`

Цель:
- описать весь surface, который затронет переход на build.

Что нужно собрать:
- список HTML entrypoints;
- список root-pages vs `tasks/*.html`;
- direct module entry scripts;
- inline module bootstraps;
- dynamic imports и их паттерны;
- случаи `withBuild`, `withV`, `buildWithV`;
- asset classes:
  - CSS;
  - shared JS;
  - content JSON/manifest;
  - SVG/img;
  - smoke pages;
  - diagnostic pages.

Результат:
- фактическая карта migration surface, а не абстрактная идея "у нас MPA".

### W6.1 — Зафиксировать build-constraints

Статус: `pending`

Цель:
- превратить текущие неявные ограничения в явные acceptance constraints.

Исполнителю нужно ответить:
- должен ли сохраниться GitHub Pages-compatible deploy;
- допустим ли dev-server как optional local mode;
- можно ли менять layout путей в production output;
- обязаны ли root html-файлы сохранить текущие URL;
- как должна вести себя текущая `meta app-build` модель после migration;
- требуется ли backward-compatible режим для static content fetch.

Результат:
- список hard constraints и soft preferences.

### W6.2 — Сравнить кандидатов

Статус: `pending`

Цель:
- сравнить минимум 2 реальных пути, а не один "любимый" инструмент.

Минимальный состав сравнения:
- `Vite MPA` — основной кандидат;
- `esbuild spike path` — контрольный минималистичный вариант.

Опционально:
- `Parcel` как reference comparison, если это даст важный аргумент по DX или
  HTML-first workflow.

Сравнивать по осям:
- MPA support;
- совместимость с HTML entrypoints;
- dynamic import behavior;
- handling of static assets/content files;
- совместимость с текущим cache-busting;
- влияние на GitHub Pages/static hosting;
- стоимость изменения import/path model;
- стоимость CI/deploy changes;
- дебажность и прозрачность output.

Результат:
- не менее одной сравнительной таблицы с конкретными плюсами/рисками.

### W6.3 — Minimal migration spike

Статус: `pending`

Цель:
- проверить migration path на небольшом, но репрезентативном срезе.

Spike должен быть ограничен:
- 1 root page;
- 1–2 `tasks/*.html` страницы;
- 1 shared module chain;
- 1 кейс с dynamic import;
- 1 кейс со статическим fetch через `withBuild`.

Рекомендуемый состав spike:
- `index.html` или `home_student.html`;
- `tasks/trainer.html` или `tasks/list.html`;
- shared modules из `app/`;
- один auth/header/print-related lazy import.

Spike не должен:
- переписывать весь проект;
- ломать текущий static path;
- подменять собой решение о полном переходе.

Результат:
- доказательство того, что target path либо реалистичен, либо слишком дорог.

### W6.4 — Оценка миграционной стоимости

Статус: `pending`

Цель:
- посчитать реальную цену перехода, а не ограничиться "технически возможно".

Оценить:
- количество HTML entrypoints, требующих перестройки;
- количество imports/path-правок;
- судьбу `?v=` и `meta app-build`;
- изменения CI/workflows;
- изменения локального dev-loop;
- изменения smoke/e2e setup;
- риск regressions по root URLs, auth redirects и static content loading.

Результат:
- разбивка по стоимости:
  - low / medium / high;
  - engineering effort;
  - migration risk;
  - rollback complexity.

### W6.5 — Recommendation packet

Статус: `pending`

Цель:
- выдать оператору финальное решение.

Формат результата:
- `Go now`
- `Go later after W2/W4/W5`
- `Do not migrate`
- `Proceed only with narrow build slice`

В рекомендацию обязательно включить:
- preferred target;
- почему он выбран;
- что является first safe slice;
- что будет explicit no-go;
- какие предпосылки должны быть закрыты до запуска migration wave.

---

## 8. Допустимый scope исполнителя

Исполнителю в рамках `W6` разрешено:

- читать весь репозиторий;
- собирать инвентарь по HTML/JS/CSS paths;
- добавлять плановые и аналитические документы;
- делать локальный build spike в отдельном, изолированном контуре;
- добавлять временные scripts/config для spike;
- запускать локальные проверки build/e2e в границах spike.

Исполнителю не разрешено без отдельного stop-ask:

- переводить production pages на новый build path по умолчанию;
- массово менять import-спецификаторы по всему проекту;
- ломать текущий `check_build`/`bump_build` workflow;
- менять deploy-модель проекта;
- удалять текущий static no-build path.

---

## 9. Риски и stop-ask точки

Основные риски:

- bundler-решение окажется несовместимым с текущей MPA-структурой без
  большого HTML rewrite;
- dynamic imports через `withV/buildWithV` потребуют широкой переделки;
- сломается совместимость с GitHub Pages/static hosting;
- migration добавит opaque build-layer и усложнит диагностику вместо упрощения;
- build-spike случайно перерастёт в production rewrite без operator decision.

Stop-ask:

- если spike требует массовой правки больше чем 3–5 страниц;
- если без смены URL/путей root pages путь нежизнеспособен;
- если без ломки `meta app-build` / `?v=` модель не сходится;
- если нужен не evaluation spike, а уже полноценный migration tranche;
- если выяснится, что без смены deploy model смысл bundler-пути теряется.

---

## 10. Критерии приёмки (DoD)

`W6` считается закрытой, если одновременно выполнено:

- есть build-surface inventory по реальному репозиторию;
- есть сравнение минимум двух кандидатов;
- есть хотя бы один ограниченный migration spike или обоснование, почему он
  не нужен/небезопасен;
- есть оценка стоимости и рисков;
- есть явная recommendation operator-level;
- recommendation разделяет:
  - что можно делать сейчас;
  - что можно делать позже;
  - что делать не стоит.

`W6` не считается закрытой, если есть только:
- общие рассуждения о пользе bundler;
- список желаний без cost/risk;
- прототип без decision package;
- recommendation без анализа текущего cache/path/deploy surface.

---

## 11. План проверки

Проверки для `W6`:

1. Документная проверка:
   - ссылки на реальные файлы и entrypoints;
   - непротиворечивость `PROJECT_STATUS.md` и `GLOBAL_PLAN.md`.
2. Техническая проверка:
   - реплицируемый spike path;
   - явный список touched files;
   - отсутствие поломки текущего no-build runtime.
3. Проверка вывода:
   - recommendation опирается на evidence, а не на вкус исполнителя;
   - есть сравнение `current static path` vs `target build path`.

---

## 12. Рекомендуемый handoff исполнителю

Исполнителю нужно ставить не задачу
"переведи проект на Vite",
а задачу такого типа:

1. собери inventory build-surface;
2. сформулируй hard constraints;
3. сравни минимум два build-path;
4. проверь один ограниченный spike;
5. подготовь recommendation с cost/risk и first safe slice.

То есть `W6` — это research + spike + decision packet, а не hidden implementation wave.

---

## 13. Предварительная кураторская рекомендация

На текущем baseline разумно планировать `W6` так:

- не запускать её на критическом пути до закрытия `W2`;
- после стабилизации screen/print использовать `W6` как отдельную low-priority
  design wave;
- если `W4` начнётся раньше, результаты `W4` могут уменьшить стоимость `W6`,
  поэтому в финальной рекомендации нужно отдельно оценить зависимость
  `W6 <- W4`.

Текущий ожидаемый outcome по умолчанию:
- наиболее вероятен вердикт вида `Go later with narrow Vite MPA slice`,
  а не `migrate now whole repo`.
