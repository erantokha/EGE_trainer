# W2_PLAN — Разделение Screen / Print Layout

Дата создания: 2026-04-21  
Дата актуализации: 2026-04-22  
Волна: `W2`  
Статус: in_progress  
Приоритет: `P0`

Связанные документы:
- `PROJECT_STATUS.md`
- `GLOBAL_PLAN.md`
- `CURATOR.md`
- `docs/navigation/architecture_contract_4layer.md`
- `W2_6_PLAN.md`

---

## 0. Текущее восстановленное состояние

На `2026-04-22` трек `W2` уже частично выполнен и не должен описываться как
полностью будущая волна.

Подтверждено по репозиторию:
- `W2.0` — `completed`: baseline и карта конфликтов оформлены в `docs/navigation/print_layout_inventory.md`
- `W2.1` — `completed`: введён `body.print-layout-active`, lifecycle вынесен в `app/ui/print_lifecycle.js`, `list/unique/hw/hw_create` переведены на общий print-flow
- `W2.2` — `completed`: базовый screen-layout карточек в `tasks/trainer.css` очищен от основных print-driven компромиссов для `vectors/derivatives/graphs`, mobile stacking для figure-cards зафиксирован как отдельный screen contract
- `W2.3` — `completed`: print-layout собран в отдельный логический контур внутри `@media print`, layout-правила завязаны на `body.print-layout-active`, контракт оформлен в `docs/navigation/print_layout_contract.md`
- `W2.4` — `completed`: после curator feedback исправлена mobile width regression, добавлены geometry assertions и подтверждён visual evidence; итог зафиксирован в `w2_4_report.md`
- `W2.6` — `completed`: acceptance оформлен в `w2_6_report.md`, follow-up fix-пакет `w2_6_fix_report.md` принят, review-cycle закрыт
- `W2.5` — `pending`: структурная фиксация CSS теперь является следующим post-stabilization шагом

Текущий критический путь:
`W2.5`

Текущие работы по волне:
- следующая подволна: `W2.5`
- следующая задача: структурно закрепить CSS после принятого acceptance `W2.6`, не расползаясь в новые product/layout инициативы
- обязательные артефакты текущего прохода:
  - отдельный `W2.5` report
  - diff по CSS-структуре
  - regression evidence, что принятый `W2.6` не сломан cleanup-правками
- запрещённое смешение scope на этом этапе:
  - новый acceptance-cycle по `W2.6`, если не найден новый дефект
  - backend/RPC/auth-flow правки
  - отдельная стабилизация test-layer флейков, если они не блокируют CSS cleanup

---

## 1. Цель

Развести screen-layout и print-layout так, чтобы:
- экранная вёрстка карточек больше не зависела от печатных требований
- печатная раскладка включалась только в явном print-режиме
- `trainer.html`, `list.html`, `unique.html` перестали делить один и тот же компромиссный layout

---

## 2. Контекст и мотивация

По текущему baseline проекта главный P0-риск UI-слоя — смешение
screen-layout и print-layout в `tasks/trainer.css`.

Это уже привело к mobile regression на:
- `tasks/trainer.html`
- `tasks/list.html`
- `tasks/unique.html`

Суть проблемы:
- один CSS-файл обслуживает и экран, и печать
- print-related grid-правила уже протекли в screen CSS
- наиболее конфликтные сущности:
  - `.task-card`
  - `.ws-item`
  - `.task-fig`
  - `.ws-fig`
  - `.task-ans`
  - `.ws-ans`
  - `.print-ans-line`

Без этой волны любые дальнейшие правки печати будут оставаться
источником регрессий для мобильного и обычного screen-режима.

---

## 3. Out of Scope

В эту волну не входят:
- редизайн карточек как продуктовая задача
- переход на bundler/build system
- миграция на TypeScript
- переписывание экранов на новый UI-stack
- изменение backend RPC, SQL и модели данных
- общая декомпозиция тяжёлых JS-модулей как отдельная архитектурная задача
- изменение бизнес-логики аналитики, ДЗ и auth-flow

---

## 4. Затрагиваемые файлы

### 4.1 Основные

- `tasks/trainer.css`
- `app/ui/print_btn.js`
- `tasks/list.js`
- `tasks/unique.js`

### 4.2 Вероятно затронутся

- `tasks/hw.js`
- `tasks/trainer.js`
- `tests/print-features.js`

### 4.3 Допустимые новые артефакты

- `docs/navigation/print_layout_inventory.md`
- `docs/navigation/print_layout_contract.md`
- `w2_report.md`
- при необходимости отдельный `print.css`

---

## 5. Пошаговый план

Текущий статус под-волн:
- `W2.0` — `completed`
- `W2.1` — `completed`
- `W2.2` — `completed`
- `W2.3` — `completed`
- `W2.4` — `completed`
- `W2.6` — `completed`
- `W2.5` — `pending`, следующий шаг после `W2.6`

### W2.0 — Инвентаризация и freeze

Статус: `completed`

Цель:
- зафиксировать текущие зависимости screen/print и получить baseline
  для сравнения

Шаги:
1. Выписать все screen-селекторы, влияющие на:
   - `.task-card`
   - `.ws-item`
   - `.task-fig`
   - `.ws-fig`
   - `.task-ans`
   - `.ws-ans`
   - `.print-ans-line`
2. Отдельно выписать все print-селекторы в `@media print`,
   переопределяющие эти же сущности.
3. Составить матрицу страниц:
   - `trainer.html`: одиночная карточка, summary review, sheet mode
   - `list.html`: список задач, печать списка
   - `unique.html`: уникальные прототипы, `ws-ans-wrap`, video-slot
4. Зафиксировать фигурные сценарии:
   - без картинки
   - `vectors`
   - `graphs`
   - `derivatives landscape`
   - `derivatives portrait`
   - `large/small figure`
5. Сделать baseline:
   - desktop screenshots
   - mobile screenshots
   - print-preview / PDF по репрезентативным кейсам
6. Оформить результат в отдельный документ инвентаризации.

Результат:
- карта конфликтующих правил
- baseline для сравнения

Фактически зафиксировано:
- отдельный артефакт `docs/navigation/print_layout_inventory.md`
- матрица страниц `trainer/list/unique`
- конфликтующие сущности `.task-card`, `.ws-item`, `.task-fig`, `.ws-fig`, `.task-ans`, `.ws-ans`, `.print-ans-line`

Оценка:
- `0.5–1 день`

### W2.1 — Ввести явный print-state

Статус: `completed`

Цель:
- перестать завязывать print-layout на обычные screen-классы

Шаги:
1. Выбрать единый механизм режима, например
   `body.print-layout-active`.
2. Включать print-state перед `window.print()`.
3. Гарантированно выключать print-state после печати, после отмены
   и после ошибки.
4. Не менять screen-layout на этом шаге.
5. Не переносить print CSS целиком на этом шаге.
6. Централизовать управление режимом через один print-flow, а не
   размножать state-логику по страницам.

Результат:
- в проекте появляется отдельный print-state
- экран визуально не меняется

Фактически зафиксировано:
- `app/ui/print_lifecycle.js` стал единым runtime-контуром печати
- `app/ui/print_btn.js` переведён на managed flow вместо прямого `window.print()` по месту
- `tasks/list.js`, `tasks/unique.js`, `tasks/hw.js`, `tasks/hw_create.js` используют `registerStandardPrintPageLifecycle()`
- отчёт выполнения хранится в `w2_1_report.md`

Оценка:
- `0.5–1 день`

### W2.2 — Выделить канонический screen-layout

Статус: `completed`

Цель:
- вернуть экранную раскладку под контроль как самостоятельную систему

Шаги:
1. Трактовать базовые правила карточек как screen-first.
2. Убрать из дефолтного screen CSS всё, что было добавлено ради печати:
   - print-driven grid-геометрию
   - print-oriented spacing
   - print-specific компенсации фигур
3. Зафиксировать screen contract:
   - размещение номера
   - размещение текста
   - размещение фигуры
   - размещение ответа
   - поведение `ws-ans-wrap`
4. При необходимости ввести screen-модификаторы, но только явно
   и документированно.
5. Отдельно проверить mobile screen-layout после каждого значимого шага.

Результат:
- `trainer`, `list`, `unique` на экране живут только по screen-правилам
- mobile/desktop перестают зависеть от print-grid

Фактически зафиксировано:
- изменён `tasks/trainer.css`, без расширения правок на `list.js`, `unique.js`, `hw.js` и print lifecycle
- базовая screen-сетка карточек переведена на `minmax(0, 1fr)` вместо более хрупкой `1fr`
- общая screen-геометрия карточек с фигурами переведена в более screen-first раскладку для обычных и large figure cases
- для `vectors` убраны ключевые print-driven компромиссы: фиксированная 220px колонка, резервирование нижнего пространства, отрицательный отступ ответа и absolute-tail у `video-solution-slot`
- для `derivatives portrait` и `graphs` введены отдельные screen-only ширины, не повторяющие print-width один в один
- для mobile введён отдельный stacking contract для figure-cards, включая override для более специфичных `vectors/graphs/derivatives portrait`
- `ws-ans-wrap` на узком экране переведён в переносимый режим

Оценка:
- `1–2 дня`

Открытый follow-up:
- живой browser-smoke по реальным `trainer/list/unique` оператором пока не проведён
- текущая фиксация `W2.2` основана на коде, headless/synthetic checks и локальной инженерной проверке, а не на финальном визуальном acceptance

### W2.3 — Собрать print-layout как отдельную систему

Статус: `completed`

Цель:
- сделать print-layout отдельным контуром, не влияющим на экран

Шаги:
1. Собрать print-oriented layout-правила в отдельный логический блок.
2. Привязать print-layout к связке:
   - `@media print`
   - `body.print-layout-active`
3. Все правила, связанные с:
   - `grid-template-columns`
   - `grid-template-areas`
   - `break-inside`
   - `print-ans-line`
   - `zoom` compensation
   - `vectors/graphs/derivatives`
   перенести в print-контур.
4. При необходимости добавлять print-only data-атрибуты на карточки
   перед печатью.
5. На этом шаге не перестраивать файловую структуру ради красоты —
   сначала поведение, потом полировка.

Результат:
- screen и print перестают делить один и тот же layout-контур

Фактически зафиксировано:
- print-specific grid/spacing/answer rules собраны в отдельный логический блок внутри `@media print`
- основной print-layout привязан к `body.print-layout-active`
- сохранены существующие print-fix'ы для `MathJax`, `zoom`, `break-inside`, `print-custom-title`
- screen-base не возвращала print-driven geometry обратно в обычный screen CSS
- контракт оформлен в `docs/navigation/print_layout_contract.md`
- отчёт выполнения хранится в `w2_3_report.md`

Остаток после W2.3:
- visual/print acceptance ещё не закрыт и должен идти в `W2.6`
- deeper-разведение фигур и answer-layer не входит в `W2.3` и переносится в `W2.4`

Оценка:
- `1–2 дня`

### W2.4 — Развести фигуры и ответы по режимам

Статус: `completed`

Цель:
- убрать самые конфликтные сущности, которые по-разному живут на экране
  и в печати

Шаги:
1. Отдельно развести:
   - screen placement фигур
   - print placement фигур
2. Обязательно пройти кейсы:
   - `vectors`
   - `graphs`
   - `derivatives landscape`
   - `derivatives portrait`
   - без картинки
3. Отдельно развести:
   - screen `details.task-ans / details.ws-ans`
   - print `print-ans-line`
   - print-with-answers
4. Для `unique.html` отдельно разобрать:
   - `ws-ans-wrap`
   - video-slot
   - их screen/print-поведение
5. Отдельно проверить, не потеряны ли текущие print-fixes для
   MathJax и фигур.

Результат:
- конфликтные элементы больше не требуют компромиссного общего CSS

Остаток после W2.4:
- финальный acceptance всего W2 остаётся за `W2.6`
- нативный print-preview/PDF не заменён полностью: W2.4 print acceptance выполнен через Playwright `emulateMedia('print')` + `body.print-layout-active`
- известный `setup-student` session-capture flake остаётся отдельным test-layer follow-up, не блокирующим layout acceptance

Фактически зафиксировано:
- `ws-ans-wrap` в screen остаётся удобным flex-контейнером, а в print-state переводится в answer area / block без screen-компромисса
- `video-solution-slot` остаётся доступным в screen и скрывается только в print-state
- `.print-ans-line` видима в print без ответов и скрывается в `print-with-answers`
- `print-with-answers` показывает реальные `task-ans/ws-ans` и скрывает `summary`
- W2.4 visual spec покрывает desktop trainer, mobile trainer, unique screen, print без ответов/с ответами, vectors, graphs, derivatives portrait/landscape
- mobile trainer regression из первого ревью исправлена через mobile grid `40px minmax(0, 1fr)`, stem `min-width: 0` и усиленные geometry assertions
- follow-up по mobile figure-cases закрыт: карточка с картинкой удерживает screen-порядок `номер+условие → картинка → ответ`, без наезда ответа на фигуру

Контракт после W2.4:
- не возвращать print-layout обратно в screen-base
- опираться на `docs/navigation/print_layout_contract.md`
- считать `body.print-layout-active + @media print` каноническим print-boundary
- если нужен более крупный DOM/layout rewrite, остановиться и вынести это как stop-ask

Оценка:
- `1–2 дня`

### W2.6 — Проверка и стабилизация

Статус: `completed`

Цель:
- закрыть волну не только визуально, но и инженерно

Шаги:
1. Провести ручной smoke:
   - desktop
   - mobile
   - печать без ответов
   - печать с ответами
2. Проверить:
   - `beforeprint/afterprint`
   - отмену печати
   - повторную печать
   - возврат из print dialog
   - cleanup state
3. Прогнать существующие print-tests.
4. При необходимости расширить tests/checklist.
5. Зафиксировать follow-up, если на этом шаге выявятся системные хвосты.

Результат:
- переход считается завершённым и поддерживаемым

Текущее состояние:
- первичный acceptance собран в `w2_6_report.md`
- reviewer feedback закрыт узким fix-пакетом `w2_6_fix_report.md`
- в принятый baseline входят:
  - `tasks/trainer.html` с `#printBtn`
  - `tasks/trainer.js` с `registerStandardPrintPageLifecycle()`
  - `tests/print-features.js` на `playwright`
  - `e2e/student/w2-6-fix.spec.js` как acceptance-spec по follow-up замечаниям
- повторный review-cycle завершён, и `W2.6` больше не является активной подволной

Текущие работы:
1. Считать `W2.6` закрытой и не расширять её scope задним числом.
2. Использовать её acceptance-пакет как baseline для `W2.5`.
3. Любой новый дефект оформлять как отдельный follow-up, а не как «возврат к незакрытой W2.6».

Критерий завершения текущих работ:
- есть воспроизводимый evidence set по `trainer/list/unique` для screen/mobile/print;
- `tests/print-features.js` подтверждён как runnable safety-net;
- follow-up fix-пакет принят без нового planning split;
- сформирован явный итог: `W2.6 completed`.

Оценка:
- `0.5–1 день`

### W2.5 — Закрепить структуру CSS по ответственности

Статус: `pending`

Цель:
- сделать так, чтобы проблема не вернулась следующей печатной правкой

Шаги:
1. Переструктурировать стили по слоям:
   - base/theme/tokens
   - screen cards/layout
   - print layout
   - page-specific overrides
2. Задокументировать контракт комментариями.
3. Если это уже безопасно после стабилизации, вынести print-layout
   в отдельный CSS-файл.
4. Не делать структурную полировку до прохождения `W2.6`.

Результат:
- повторное смешивание screen и print становится менее вероятным

Условие старта:
- `W2.6` уже закрыта; старт `W2.5` требует отдельного execution-прохода и не подразумевается автоматически самим фактом принятия acceptance

Оценка:
- `1 день`

---

## 6. Данные / контракты / миграции

SQL и миграции БД не требуются.

Контракты этой волны:
- `print-state` как отдельный DOM/runtime режим
- screen contract для карточек
- print contract для карточек
- правило: print-layout не влияет на экран вне явного print-state

Новые backend RPC, таблицы и write-path changes не нужны.

---

## 7. Риски и stop-ask точки

### 7.1 Основные риски

- сломать текущий desktop-layout карточек
- потерять существующие print-fix’ы для фигур и MathJax
- развести `trainer/list`, но оставить `unique` как хаотичное исключение
- не дочистить print-state после отмены печати
- смешать структурную полировку CSS с поведенческими изменениями и
  потерять управляемость волны

### 7.2 Stop-ask-confirm

Остановиться и спросить оператора, если потребуется:
- массово менять DOM-структуру карточек
- менять общую схему подключения CSS
- править не только `trainer/list/unique/hw`, но и другие page families
- менять пользовательское поведение, а не только layout/state

---

## 8. Критерии приёмки (DoD)

Волна `W2` считается завершённой, если одновременно выполнены условия:
- screen layout карточек больше не меняется от print-related CSS
- print layout включается только в явном print-state + `@media print`
- mobile screen layout на `trainer/list/unique` не зависит от print-grid
- `vectors/graphs/derivatives` имеют отдельное screen и print поведение
- ответы и `print-ans-line` разведены по режимам
- отмена и повтор печати не оставляют “грязный” print-state
- существующие print-fixes не потеряны
- screen/print contracts зафиксированы в docs
- создан `w2_report.md`

---

## 9. План проверки

### 9.1 Код / CSS

Проверить:
- изменённые блоки в `tasks/trainer.css`
- управление state в `app/ui/print_btn.js`
- page-specific hooks в `tasks/list.js`, `tasks/unique.js`,
  при необходимости `tasks/hw.js`

### 9.2 Ручной smoke

`trainer.html`
- desktop / mobile
- карточка с фигурой / без фигуры
- summary / review

`list.html`
- desktop / mobile
- печать с ответами / без ответов

`unique.html`
- desktop / mobile
- `ws-ans-wrap`
- video-slot
- `vectors/derivatives/graphs`

print dialog
- confirm
- cancel
- repeated print
- state cleanup

### 9.3 Автопроверки

```bash
node tools/check_no_eval.mjs
cd tests && node print-features.js
```

### 9.4 Локальный запуск

```bash
python3 -m http.server 8000
```

---

## 10. Отчётный артефакт

После завершения волны:
- создать `w2_report.md`
- обновить `PROJECT_STATUS.md`
- обновить `GLOBAL_PLAN.md`

Уже существующие отчётные артефакты по под-волнам:
- `docs/navigation/print_layout_inventory.md` — отчёт по `W2.0`
- `w2_1_report.md` — отчёт по `W2.1`
- `docs/navigation/print_layout_contract.md` — контракт после `W2.3`
- `w2_3_report.md` — отчёт по `W2.3`

В отчёте зафиксировать:
- какой механизм print-state выбран
- где живёт screen contract
- где живёт print contract
- какие edge cases были самыми проблемными
- какие follow-up задачи остались

---

## 11. Рекомендуемый порядок внедрения

1. `W2.0`
2. `W2.1`
3. `W2.2`
4. `W2.3`
5. `W2.4`
6. `W2.6`
7. `W2.5`

Логика:
- сначала развести поведение
- потом стабилизировать
- только потом полировать файловую структуру

---

## 12. Оценка трудоёмкости

Реалистичная оценка:
- аккуратный проход: `5–8 рабочих дней`
- с хорошей стабилизацией, baseline-артефактами и внимательной
  проверкой `unique`: `7–10 рабочих дней`

---

## 13. Наиболее опасные места

По риску:
- `unique.html` — высокий
- `list.html` — средний-высокий
- `trainer.html` — средний

Причины:
- `unique.html`: `ws-item`, `ws-ans-wrap`, video-slot, аккордеон,
  разные типы карточек
- `list.html`: сильная связь с печатным сценарием
- `trainer.html`: проще screen-flow, но есть summary/review и sheet mode
