# W13.1-fix — отчёт исполнителя (§5.1–§5.8)

Дата: 2026-06-18. Полировочная под-волна после W13.1: паритет части 2 (№13) по ВСЕМ поверхностям.
**НЕ red-zone** (чистый фронт-рендер; схему/каталог-данные/RPC/scoring не трогали). План — `W13_1_FIX_PLAN.md`;
контекст — `docs/navigation/part2_integration_contract.md`; W13.1 — `reports/w13_1/W13_1_REPORT.md`.
build: `2026-06-18-2-014501`. Деплой БД НЕ требуется (frontend-only). **Приёмку ведёт куратор.**

## §5.1 RECON (DONE)
Карта точек рендера части 2 на вторичных поверхностях: stem через `setStem` → `unique.js`, `list.js`,
`picker.js:buildAddedTaskCard`; подписи из id → `picker.js` (рек-карточка, заголовки модалки, заголовок
модалки-листа), `question_preview.js:meta`. `question_preview` stem использует `innerHTML` → `<br>` уже
рендерится (литерального нет). Хелперы для извлечения из `trainer.js` зафиксированы.

## §5.2 Общий модуль + рефактор trainer.js (DONE)
- **Создан `tasks/part2_render.js`** (ES-модуль): `isPart2Id`, `isPart2Question`, `part2ClassKey/Order/Title`,
  `part2Label(id,{title})→{classKey,typeNo,className,methodTitle,display}`, `mkEl`, `typesetEl`,
  `renderPart2Stem`, `buildPart2EtalonContent(solution,answer)`, `buildPart2EtalonBlock(solution,answer)`.
  Весь DOM — `createElement`/`textContent` (без `innerHTML`); `asset` self-contained через `toAbsUrl`.
- **`trainer.js` переключён на импорт**; локальные копии удалены; call-sites передают `(q.solution, q.answer2)`.
  **Поведение идентично** (функции скопированы дословно; аргументы = то, что читалось из `q`). Regression-gate:
  модуль грузится и работает в браузере без ошибок (см. §5.8, console clean).
- **Стили** части 2 вынесены в общий `tasks/trainer/part2.css` (из `pages/trainer.css`), подключён к
  `trainer.html` / `unique.html` / `list.html` (параллель JS-модулю).

## §5.3 (A) Условие а/б везде (DONE)
`renderPart2Stem` (делит по `<br>`) применён для части 2 в: `trainer.js` (оба режима), `unique.js` (`renderUnicTasks`),
`list.js` (`renderList`), `picker.js` (`buildAddedTaskCard`, гейт по `isPart2Id(data.questionId)`).
Часть 1 — прежний `setStem`. `question_preview` не трогали (innerHTML уже корректен).

## §5.4 (B) Слаги → человекочитаемо (DONE)
Через `part2Label` (метод без слага): `picker.js` — рек-карточка (`titleText`), заголовки карточек модалки
прототипов (`метод · №N` вместо `13.trig.factor.46 …`), заголовок модалки-листа; `question_preview.js` — `meta`.
`picker.js:renderTopicRow` (аккордеон) уже без слага из W13.1. **Сырой слаг части 2 не показывается ни на одном экране.**

## §5.5 (C) Уникальные прототипы как аккордеон (DONE)
`unique.js`: подтемы части 2 группируются по классу (`appendUnicTopicsGroupedByClass`) — заголовки
Тригонометрические/Логарифмические/Показательные (Тип 1/2/3); название метода без слага; прототипы нумеруются
порядково (1,2,3…) вместо id-слага. Часть 1 в unique — без изменений (гейт `topics.some(isPart2Id)`).

## §5.6 (D) Эталон-тоггл в списке и unique (DONE)
`list.js` (`renderList`) и `unique.js` (`renderUnicTasks`): на карточку части 2 — `buildPart2EtalonBlock`
(сворачиваемый тоггл «показать эталон», по умолчанию свёрнут, экранный), обёрнут в `.task-ans`/`.ws-ans`
(grid-область «ans» — готча grid из W13.1). Часть 1 — прежние «Ответ»/видео/print-line.

## §5.7 Регрессия + governance (DONE)
- `node --check`: part2_render, trainer, picker, unique, list, question_preview — **OK**.
- `check_runtime_rpc_registry` / `check_runtime_catalog_reads` / `check_no_eval` — **зелёные**.
- `tests/print-features.js` — **36 passed / 0 failed** (эталон-тоггл не протекает в печать).
- Часть 1 строго гейтится (`part===2` / `isPart2Id`) на всех экранах — не затронута.
- Эталон в тренажёре после рефактора §5.2 — поведенчески идентичен (тот же код в модуле).
- Build bump `2026-06-18-2-014501`.

## §5.8 Evidence
`reports/w13_1_fix/` (render-preview через **реальный** `part2_render.js` + реальный CSS; live-страницы читают
каталог из Supabase, №13 — после заливки оператором из W13.1):
- `shot_unique_grouped.png` — unique части 2: класс-группировка (Тип 1/2/3) + названия методов без слагов +
  условие а/б + эталон-тоггл (первый раскрыт, остальные свёрнуты).
- `shot_labels.png` — `part2Label`: слаг → человекочитаемо (`13.trig.factor → Вынесение общего множителя`, Тип N).
- `preview.html` + `_shots.cjs`. **Консольных ошибок нет** (модуль грузится/работает в браузере).

## Out of scope (соблюдено)
Печать части 2 (бывший follow-up #3) — НЕ в этой волне (отдельное решение оператора). Scoring/баллы/двухуровневая
проверка — W13.2. `subtopic_id`/каталог-данные/манифесты/SQL — не трогались.
