# Print Layout Inventory

Дата: 2026-04-21  
Волна: `W2.0`  
Область: `tasks/trainer.css`, `tasks/trainer.html`, `tasks/list.html`, `tasks/unique.html`, `tasks/trainer.js`, `tasks/list.js`, `tasks/unique.js`, `app/ui/print_btn.js`, `tests/print-features.js`

## 1. Цель инвентаризации

Этот документ фиксирует baseline перед `W2.1+`, где потребуется разводить
экранную и печатную раскладки карточек задач.

Что нужно сохранить как исходную точку:

- какие screen-правила уже формируют layout карточек;
- какие print-правила переопределяют те же сущности;
- какие страницы используют один и тот же компромиссный CSS-контур;
- какие фигурные сценарии особенно чувствительны к разделению screen/print;
- как воспроизвести baseline до любых изменений.

Граница `W2.0`: только инвентаризация и freeze. Никаких переносов CSS,
нового print-state, правок DOM и JS-логики печати здесь не делается.

## 2. Где сейчас смешаны screen и print

Смешение происходит не в одном месте, а в связке из общего CSS и page-level
JS:

- Базовый экранный grid для `.task-card` и `.ws-item` задаётся один раз в
  `tasks/trainer.css:953-968` и используется сразу на `trainer`, `list`,
  `unique`.
- Тот же файл содержит print-переопределения для тех же сущностей в
  `tasks/trainer.css:3478-3646`.
- Фигурные сценарии для `vectors`, `derivatives`, `graphs`, `large/small`
  заведены как screen-база через `:has(...)` и `data-fig-*` в
  `tasks/trainer.css:970-1118`, а потом частично перенастраиваются для print в
  `tasks/trainer.css:3516-3535`, `3586-3600`.
- Screen-spacing ответа живёт в `.task-ans`, `.ws-ans`, `.ws-ans-wrap` через
  `tasks/trainer.css:1198-1233`, а print скрывает эти блоки и вместо них
  активирует `.print-ans-line` через `tasks/trainer.css:3561-3626`.
- Включение печатного режима разбросано между CSS и JS:
  `app/ui/print_btn.js:19-50` добавляет `body.print-with-answers`,
  создаёт `.print-custom-title` и раскрывает `details.task-ans/details.ws-ans`,
  а `tasks/list.js:41-89` и `tasks/unique.js:50-71` отдельно ставят
  `body.style.zoom = '0.7'` через `beforeprint/afterprint`.

Главный вывод baseline: сейчас нет отдельного print-namespace для layout.
Есть общий screen-first CSS, в который встроены print-oriented допущения, и
print-блок, который поверх него переписывает те же карточки.

## 3. Screen-селекторы по сущностям

### 3.1 Каркас карточек: `.task-card`, `.ws-item`

| Селектор | Файл / место | На что влияет | Почему это важно для конфликта |
| --- | --- | --- | --- |
| `.ws-item, .task-card` | `tasks/trainer.css:933-939` | Фон, граница, радиус, padding карточки | Это общий визуальный контейнер для screen и фактическая база, которую потом print переписывает почти целиком. |
| `.task-card, .ws-item` | `tasks/trainer.css:953-963` | Базовый grid: `auto 1fr`, области `num/stem/ans`, `column-gap:12px` | Критическая точка смешения: общий screen-layout для всех страниц строится здесь, а затем print меняет те же карточки без отдельного namespace. |
| `.task-card .task-num, .ws-item .ws-num` | `tasks/trainer.css:966` | Привязка номера к `grid-area:num` | Любая переделка grid без учёта этого сломает выравнивание бейджа на всех страницах. |
| `.task-card .task-stem, .ws-item .ws-stem` | `tasks/trainer.css:967` | Привязка текста к `grid-area:stem`, `margin-top:7px` | Это screen-spacing стема, который уже зависит от grid-компромисса. |
| `.task-card .task-ans, .ws-item .ws-ans` | `tasks/trainer.css:968` | Привязка ответа к `grid-area:ans` | Print потом скрывает эти же сущности, но screen-layout карточек уже исходит из их присутствия. |
| `.task-card:has(.task-fig), .ws-item:has(.ws-fig)` | `tasks/trainer.css:971-983` | Переключение на трёхколоночный grid и размещение фигуры | Это общий screen-rule для любого наличия фигуры, который потом конфликтует с print-геометрией фигур. |
| `.task-card:has([data-fig-size="large"]), .ws-item:has([data-fig-size="large"])` | `tasks/trainer.css:986-990` | Расширение третьей колонки до `38%` | Screen-ширины для large-фигур стали общей базой для страниц с разными сценариями печати. |

Дополнение по DOM-источникам:

- `tasks/list.js:994-1057` создаёт `.task-card`, `.task-num`, `.task-stem`,
  `.task-fig`, `.task-ans`, `.print-ans-line`.
- `tasks/unique.js:388-487` создаёт `.ws-item`, `.ws-num`, `.ws-stem`,
  `.ws-fig`, `.ws-ans`, `.ws-ans-wrap`, `.print-ans-line`.
- `tasks/trainer.js:1569-1626` создаёт листовой `trainer`-режим на `.task-card`
  в `sheet mode`.
- `tasks/trainer.js:2091-2142` создаёт review-карточки на `.task-card`, но там
  уже нет `details.task-ans`, вместо них используется `.hw-review-answers`.

### 3.2 Фигуры: `.task-fig`, `.ws-fig`

| Селектор | Файл / место | На что влияет | Почему это важно для конфликта |
| --- | --- | --- | --- |
| `.task-card:has(.task-fig) .task-fig`, `.ws-item:has(.ws-fig) .ws-fig` | `tasks/trainer.css:980-983` | `grid-area:fig`, внешние отступы, `justify-self:end` | Общая screen-посадка фигуры; print потом пытается использовать те же data-атрибуты, но с другой геометрией. |
| `.task-fig[data-fig-type="vectors"], .ws-fig[data-fig-type="vectors"]` | `tasks/trainer.css:993-997` | `overflow:hidden`, `aspect-ratio:220/187` | Screen-rule обрезает белое поле и напрямую конфликтует с print-rule, который требует `overflow:visible` и `aspect-ratio:unset`. |
| `.task-card:has(.task-fig[data-fig-type="vectors"]), .ws-item:has(.ws-fig[data-fig-type="vectors"])` | `tasks/trainer.css:1005-1018` | Собственный grid `auto 1fr 220px`, `position:relative`, `padding-bottom:30px` | Это самый явный print-driven компромисс, уже попавший в screen-базу. |
| `.task-card:has(.task-fig[data-fig-type="vectors"]) .task-fig`, `.ws-item:has(.ws-fig[data-fig-type="vectors"]) .ws-fig` | `tasks/trainer.css:1021-1028` | Убирает базовые margins, поднимает фигуру на `-10px`, делает `img{width:100%}` | Screen-точка под векторы, завязанная на фиксированную ширину колонки. |
| `.task-card:has(.task-fig[data-fig-variant="shifted"]) .task-fig`, `.ws-item:has(.ws-fig[data-fig-variant="shifted"]) .ws-fig` | `tasks/trainer.css:1055-1059` | Попытка сместить variant `shifted` через `top/right` | Рискованная зона: правило рассчитывает на позиционирование, но в screen-базе `.task-fig` не имеет `position:relative/absolute`; в print этот сценарий отдельно учитывается. |
| `.task-card:has(.task-fig[data-fig-type="derivatives"]), .ws-item:has(.ws-fig[data-fig-type="derivatives"])` | `tasks/trainer.css:1064-1072` | Для derivatives landscape перестраивает grid в три строки | Это отдельный screen-layout-контур внутри общей карточки. |
| `.task-card:has(.task-fig[data-fig-type="derivatives"][data-fig-orientation="portrait"]), .ws-item:has(.ws-fig[data-fig-type="derivatives"][data-fig-orientation="portrait"])` | `tasks/trainer.css:1073-1080`, `1109-1112` | Для derivatives portrait возвращает фигуру вправо и сужает колонку до `27%` | Print для тех же карточек расширяет колонку до `29%`, значит один и тот же scenario живёт в двух геометриях. |
| `.task-card:has(.task-fig[data-fig-type="graphs"]), .ws-item:has(.ws-fig[data-fig-type="graphs"])` | `tasks/trainer.css:1083-1086` | Меняет третью колонку на `29%` | Graphs уже имеют свой screen-width, который print использует как эталон для других типов. |
| `.task-fig[data-fig-type="derivatives"]:not([data-fig-orientation="portrait"])`, `.ws-fig[...]` | `tasks/trainer.css:1092-1108` | Ограничение ширины landscape-фигур и ширины `img` | Screen-правила для derivatives landscape определяют, где окажется ответ и сколько места останется под print line. |
| `.task-fig[data-fig-type="vectors"], .ws-fig[data-fig-type="vectors"], .task-fig[data-fig-type="graphs"], .ws-fig[data-fig-type="graphs"]` | `tasks/trainer.css:1116-1119` | Убирает вертикальные paddings у vectors/graphs | Ещё один screen-fix под фигурные сценарии, который нельзя переносить вслепую в print или наоборот. |
| `.ws-fig, .task-fig` | `tasks/trainer.css:1241-1248` | Базовый box для фигуры: margin, padding, background, border | Print снимает эти обвязки полностью. |
| `.ws-fig img, .task-fig img` | `tasks/trainer.css:1250-1258` | `max-width:100%`, `max-height:260px`, `object-fit:contain` | Базовый screen-limit, который в print частично отменяется, а для large-фигур заменяется на full-width. |
| `.task-fig[data-fig-size="small"] img` | `tasks/trainer.css:1262` | `max-height:180px` для small | Отдельный screen-cap для small figure. |
| `.task-fig[data-fig-size="large"] img`, `.ws-fig[data-fig-size="large"] img` | `tasks/trainer.css:1265-1266` | Large-figure заполняет колонку целиком | Важный baseline для scenario `large figure`; печать унаследует это только частично. |

Как появляются `data-fig-*`:

- `tasks/list.js:1009-1028` ставит `data-fig-size`, `data-fig-type`,
  `data-fig-variant`, `data-fig-orientation`.
- `tasks/unique.js:435-454` ставит те же атрибуты для `ws-fig`.

### 3.3 Ответы: `.task-ans`, `.ws-ans`, `.ws-ans-wrap`, `.print-ans-line`

| Селектор | Файл / место | На что влияет | Почему это важно для конфликта |
| --- | --- | --- | --- |
| `.ws-ans, .task-ans` | `tasks/trainer.css:1198-1200` | Базовый `margin-top:6px` | Это screen-spacing ответа, который потом print полностью выключает. |
| `.task-card:not(:has(.task-fig)) .task-ans`, `.ws-item:not(:has(.ws-fig)) .ws-ans` | `tasks/trainer.css:1204-1207` | Для карточек без фигуры делает крупный отступ `2em` | Важный screen-scenario `без картинки`; print для тех же карточек даёт отдельный `margin-top` у `.print-ans-line`. |
| `.task-card:not(:has(.task-fig))[data-stem-ends="formula"] .task-ans`, `.ws-item:not(:has(.ws-fig))[data-stem-ends="formula"] .ws-ans` | `tasks/trainer.css:1211-1213` | Уменьшает отступ до `6px`, если stem заканчивается блочной формулой | Зависимость между JS-маркером и spacing; разделять screen/print нужно без потери этого поведения. |
| `.ws-item .ws-ans-wrap` | `tasks/trainer.css:1218-1223` | Обёртка `display:flex`, `grid-area:ans`, `gap:12px` | Это unique-specific screen-контур: ответ и video-slot живут в одном grid-slot. |
| `.ws-item:not(:has(.ws-fig)) .ws-ans-wrap` | `tasks/trainer.css:1225-1226` | Увеличивает верхний отступ до `2em` | Отдельное дублирование логики `.ws-ans` для unique. |
| `.ws-item:not(:has(.ws-fig))[data-stem-ends="formula"] .ws-ans-wrap` | `tasks/trainer.css:1228-1229` | Снимает увеличенный отступ в formula-case | Ещё одна зависимость unique от общего formula-marker. |
| `.ws-ans-wrap .ws-ans` | `tasks/trainer.css:1231-1232` | Обнуляет `margin-top` внутри flex-обёртки | Если разносить слои неаккуратно, unique сломает alignment ответа и video-slot. |
| `.ws-ans summary, .task-ans summary` | `tasks/trainer.css:1235-1237` | Делает summary кликабельным | Print потом скрывает эти summary только в режиме `print-with-answers`. |
| `.print-ans-line` | `tasks/trainer.css:921-922` | На экране всегда `display:none` | DOM-узел существует уже в screen-режиме, но скрыт; это прямой мост между режимами. |
| `.task-card:has(.task-fig[data-fig-type="vectors"]) .task-ans`, `.ws-item:has(.ws-fig[data-fig-type="vectors"]) .ws-ans` | `tasks/trainer.css:1040-1043` | Для vectors ответ прибивается вниз `align-self:end`, `margin-bottom:-20px` | Явный screen-layout fix ради компоновки фигуры и ответа; в print линия ответа тоже должна уходить вниз, но уже другим способом. |
| `.ws-item:has(.ws-fig[data-fig-type="vectors"]) .video-solution-slot` | `tasks/trainer.css:1047-1051` | Абсолютное позиционирование video-button в unique vectors | Это не print-hook, но это важная screen-зависимость unique от того же vector-grid. |

JS-маркеры ответов:

- `tasks/list.js:1038-1057` создаёт `details.task-ans` и `.print-ans-line`.
- `tasks/unique.js:460-487` создаёт `details.ws-ans`, `.ws-ans-wrap`,
  `.video-solution-slot`, `.print-ans-line`.
- `tasks/list.js:1080-1093` и `tasks/unique.js:502-515` ставят
  `data-stem-ends="formula"` после MathJax.

### 3.4 Mobile и viewport-наблюдения

Явных mobile-specific переопределений именно для `.task-card`, `.ws-item`,
`.task-fig`, `.ws-fig`, `.task-ans`, `.ws-ans`, `.print-ans-line` в
`trainer.css` нет. Поиск по `@media (max-width:...)` не показал отдельного
mobile-блока для карточек.

Практический смысл этого наблюдения:

- mobile regression идёт не из отдельного мобильного слоя;
- regression рождается из того, что общий screen-grid карточек уже стал
  слишком печатно-ориентированным;
- поэтому `W2.1+` нельзя ограничивать только `@media print`: сначала нужно
  признать, что screen-base уже компромиссная.

## 4. Print-селекторы по сущностям

### 4.1 Общий print-контур

`@media print` начинается в `tasks/trainer.css:3329` и обслуживает не только
`trainer/list/unique`, но ещё `hw` и `hw_create`. Это важно: любые правки
внутри print-блока имеют межстраничный эффект.

### 4.2 Print-переопределения карточек и фигур

| Селектор | Файл / место | Что перетирает | Тип изменения | Оценка |
| --- | --- | --- | --- | --- |
| `.task-card, .ws-item` | `tasks/trainer.css:3478-3489` | Screen-box `933-939` и поведение контейнера | Layout + print-pagination: `position:static`, новый border, `break-inside:avoid` | Высокий риск: селектор тот же, меняется и геометрия, и разбиение по страницам. |
| `.task-num, .ws-num` | `tasks/trainer.css:3491-3496` | Screen-border бейджа | Только внешний вид | Скорее безопасно: визуальное print-упрощение без смены layout. |
| `.task-fig, .ws-fig` | `tasks/trainer.css:3501-3507` | Screen-box фигуры `1241-1248` | Layout + visibility box: снятие рамки/padding, `position:static` | Средний риск: безопасно визуально, но вмешивается в positioning vectors. |
| `.task-fig img, .ws-fig img` | `tasks/trainer.css:3513-3514` | Screen-ограничения `1250-1258` | Геометрия + zoom-компенсация | Высокий риск: напрямую зависит от `beforeprint zoom=0.7`. |
| `.task-card:has(.task-fig[data-fig-type="vectors"]), .ws-item:has(.ws-fig[data-fig-type="vectors"])` | `tasks/trainer.css:3519-3521` | Screen vector-grid `1005-1014` | Layout: вместо `220px` третья колонка становится `29%` | Очень высокий риск: тот же scenario получает другую геометрию. |
| `.task-fig[data-fig-type="vectors"], .ws-fig[data-fig-type="vectors"]` | `tasks/trainer.css:3523-3527` | Screen `overflow:hidden`, `aspect-ratio` | Геометрия/visibility | Очень высокий риск: прямое print-отрицание screen-базы. |
| `.task-card:has(.task-fig[data-fig-type="derivatives"][data-fig-orientation="portrait"]), .ws-item:has(.ws-fig[data-fig-type="derivatives"][data-fig-orientation="portrait"])` | `tasks/trainer.css:3532-3535` | Screen `27%` колонку portrait derivatives | Layout: колонка расширяется до `29%` | Высокий риск: отдельный фигурный кейс имеет две разные canonical widths. |
| `.node.topic > .row` | `tasks/trainer.css:3537-3542` | Screen-flow аккордеона unique | Только pagination | Безопасно для print, но unique-specific и легко потерять при выносе print в отдельный файл. |
| `.ws-stem, .task-stem` | `tasks/trainer.css:3549-3553` | Screen stem-flow | Pagination: `break-after:avoid` | Средний риск: безопасно для print, но затрагивает все карточки. |

### 4.3 Print-переопределения ответов

| Селектор | Файл / место | Что перетирает | Тип изменения | Оценка |
| --- | --- | --- | --- | --- |
| `.task-ans, .ws-ans` | `tasks/trainer.css:3561-3565` | Screen-ответы `1198-1237` | Visibility: скрывает details целиком | Базовое print-переключение; безопасно только если есть рабочий replacement. |
| `.print-ans-line` | `tasks/trainer.css:3571-3579` | Screen `display:none` | Layout + visibility: включает DOM-строку ответа | Очень высокий риск: это основной print substitute вместо screen-answer. |
| `.task-card:not(:has(.task-fig)) .print-ans-line`, `.ws-item:not(:has(.ws-fig)) .print-ans-line` | `tasks/trainer.css:3581-3584` | Screen no-figure spacing | Spacing | Средний риск: зависит от того, как будет жить baseline `без картинки` после разделения. |
| `.task-card:has(.task-fig[data-fig-type="vectors"]) .print-ans-line`, `.ws-item:has(.ws-fig[data-fig-type="vectors"]) .print-ans-line` | `tasks/trainer.css:3588-3592` | Screen vector answer alignment `1040-1043` | Layout | Очень высокий риск: тот же смысловой сценарий, но другой элемент и другой механизм выравнивания. |
| `.task-card:has(.task-fig[data-fig-type="derivatives"]:not([data-fig-orientation="portrait"])) .print-ans-line`, `.ws-item:has(.ws-fig[data-fig-type="derivatives"]:not([data-fig-orientation="portrait"])) .print-ans-line` | `tasks/trainer.css:3597-3600` | Screen derivatives landscape grid | Layout | Очень высокий риск: print вынужден вручную перепривязывать строку ответа в `grid-row:3`. |
| `body.print-with-answers .print-ans-line` | `tasks/trainer.css:3619-3621` | Default print-line | Visibility | Безопасно внутри print, но требует точной синхронизации с JS-классом. |
| `body.print-with-answers .task-ans, body.print-with-answers .ws-ans` | `tasks/trainer.css:3623-3627` | Default print-hide answers | Visibility + spacing | Средний риск: зависит от того, что `print_btn.js` раскроет `details` заранее. |
| `body.print-with-answers .task-ans summary, body.print-with-answers .ws-ans summary` | `tasks/trainer.css:3629-3632` | Screen interactive summary | Visibility | Скорее безопасно: print-only cosmetic rule. |
| `body.print-with-answers .ws-ans-text::before, body.print-with-answers .task-ans > div::before` | `tasks/trainer.css:3636-3639` | Screen plain answer text | Content formatting | Средний риск: завязано на конкретную DOM-структуру ответа. |

### 4.4 Print-хуки из JS

| Хук | Файл / место | Что делает | Риск |
| --- | --- | --- | --- |
| `body.print-with-answers` | `app/ui/print_btn.js:29-35`, очистка `47-50` | Включает режим печати с ответами и раскрывает `details.task-ans/details.ws-ans` | Высокий: CSS print-mode завязан на этот класс. |
| `.print-custom-title` | `app/ui/print_btn.js:19-27` | Вставляет временный заголовок перед печатью | Средний: CSS `body > div {display:none}` уже заставил добавить отдельный override `3642-3650`. |
| `forceLoadImages()` | `app/ui/print_btn.js:126-140` | Переключает lazy-images в eager перед печатью | Средний: критично для фигура-страниц. |
| `window.addEventListener('beforeprint')` | `tasks/list.js:46-75`, `tasks/unique.js:50-63` | Ставит `body.style.zoom='0.7'`, скрывает fixed-элементы | Очень высокий: часть print CSS прямо комментирует зависимость от этого zoom. |
| `window.addEventListener('afterprint')` | `tasks/list.js:77-89`, `tasks/unique.js:64-71` | Снимает zoom и восстанавливает fixed-элементы | Высокий: сейчас печатный режим завершает не `print_btn.js`, а page-level cleanup. |

### 4.5 Что выглядит безопасным, а что уже протекло

Скорее безопасные print-правила:

- `@page` и базовый `html/body` reset в `3331-3375`;
- скрытие UI-хрома в `3386-3443`;
- `break-after:avoid` для `.node.topic > .row` и `.task-stem/.ws-stem`
  в `3537-3553`;
- форматирование `.print-custom-title` в `3642-3650`;
- MathJax print-fixes в `3659-3673`.

Потенциально уже протекшие в screen-логику через общие селекторы и
компромиссный CSS:

- vectors-grid с фиксированной `220px` колонкой и `padding-bottom:30px`
  (`1005-1014`);
- vectors answer alignment с отрицательным `margin-bottom`
  (`1040-1043`);
- derivatives landscape grid на три строки (`1064-1072`);
- portrait derivatives width `27%` как screen-compromise, который print уже
  расширяет до `29%` (`1109-1112` vs `3532-3535`);
- наличие `.print-ans-line` в DOM всех printable карточек ещё в обычном режиме.

## 5. Матрица страниц

| Страница / сценарий | DOM-сущности | Критичные CSS-сущности | Print hooks | Риск |
| --- | --- | --- | --- | --- |
| `trainer.html` одиночная карточка | Статический HTML: `.task-card.q-card`, `.task-stem`, `.task-fig`, отдельная `.answer-row` вне карточки (`tasks/trainer.html:136-160`) | Общая карточечная база, но без `.task-ans` внутри карточки | Явных print hooks на странице нет; нет `printBtn` | `medium`: single-card экран меньше зависит от `.task-ans`, но делит `.task-card/.task-fig` с остальными режимами. |
| `trainer.html` summary / review | `#summary`, `#reviewList`, JS-карточки `.task-card.hw-review-item`, `.task-fig`, но ответы уже в `.hw-review-answers` (`tasks/trainer.js:2085-2142`) | База `.task-card/.task-fig`; print-блок скрывает `.hw-review-controls`, `.hw-summary-head` (`3420-3428`) | Косвенно использует общий print CSS, но не `print_btn.js` | `high`: review использует тот же карточечный контейнер, но другую DOM-схему ответов; легко сломать при грубом выделении answer-layer. |
| `trainer.html` sheet mode | JS строит `.task-list` из `.task-card` без `details.task-ans`, вместо этого `.hw-answer-row` с `input` (`tasks/trainer.js:1561-1627`) | Общая карточечная база и фигурные селекторы; часть ответных правил уже не применима | Нет `printBtn`, но screen-layout тот же | `high`: это третий DOM-вариант trainer, использующий тот же CSS-контур карточек. |
| `list.html` список задач | `.task-list` из `article.task-card`, `details.task-ans`, `.print-ans-line` (`tasks/list.js:991-1060`) | Все базовые screen rules карточек + formula-marker + фигурные `data-fig-*` | `print_btn.js`, `beforeprint/afterprint zoom`, `print-with-answers` | `high`: наиболее прямое пересечение screen и print для canonical task-card. |
| `list.html` печать списка | Тот же DOM, но активны `@media print`, `.print-custom-title`, `body.print-with-answers` | Print-переопределения `3478-3646` | `print_btn.js` и `beforeprint/afterprint` | `high`: это главный consumer текущего print-контура. |
| `list.html` работа print dialog | Диалог `.print-dialog-overlay/.print-dialog` создаётся поверх body (`app/ui/print_btn.js:59-121`) | Screen CSS карточек не меняется, но print CSS скрывает `body > div` | `print_btn.js` | `medium`: логика отдельная, но есть хрупкая зависимость на override для `.print-custom-title`. |
| `unique.html` аккордеон | `#uniqAccordion`, узлы `.node.topic > .row`, внутри `.uniq-list` и `.ws-item` (`tasks/unique.html:134-141`, `tasks/unique.js:385-499`) | Общая карточечная база плюс unique-specific `ws-ans-wrap` и topic break rules | `print_btn.js`, `beforeprint/afterprint zoom` | `high`: print должен уважать и аккордеонные заголовки, и карточечные сценарии. |
| `unique.html` `ws-ans-wrap` | `div.ws-ans-wrap > details.ws-ans + .video-solution-slot` (`tasks/unique.js:473-482`) | `.ws-ans-wrap` rules `1216-1233`, vectors override для `.video-solution-slot` `1047-1051` | `print-with-answers` показывает/скрывает `.ws-ans`, но не перестраивает сам wrap | `high`: уникальный DOM-слой, которого нет в `list`. |
| `unique.html` видео-кнопки | `.video-solution-slot`, модалка видео, fixed overlays | Screen rules под vectors и общий print hide `.video-solution-btn`, `.vs-modal` (`3396-3414`) | `print_btn.js`, fixed-hide в `beforeprint` | `medium`: print не должен тащить видео-UI, но screen-layout unique от него зависит. |
| `unique.html` уникальные прототипы | `.ws-item` получает `data-topic-id`, `data-fig-*`, `data-stem-ends` из runtime (`tasks/unique.js:389-454`, `505-515`) | Все `.ws-item/.ws-fig/.ws-ans/.print-ans-line` rules | Все общие print hooks | `high`: unique повторяет большую часть list-карточек, но в другой DOM-обёртке и с video-slot. |

Риск по страницам в агрегированном виде:

- `trainer`: `high`.
  Причина: одна страница совмещает минимум три DOM-режима карточек
  (single-card, sheet, review), но живёт на том же CSS-контуре.
- `list`: `high`.
  Причина: это самый канонический task-card + print-flow consumer, где
  конфликт проявляется напрямую.
- `unique`: `high`.
  Причина: поверх общего карточечного слоя есть `ws-ans-wrap`,
  аккордеон и видео-слоты, то есть больше уникальных точек поломки.

## 6. Фигурные сценарии

### Без картинки

- Экран сейчас:
  карточка остаётся двухколоночной `num/stem`, а ответ уходит ниже с
  увеличенным `margin-top:2em` через `tasks/trainer.css:1204-1207`.
- Печать сейчас:
  `details.task-ans/.ws-ans` скрываются, вместо них включается
  `.print-ans-line` с отдельным `margin-top:24px`
  (`tasks/trainer.css:3581-3584`).
- Риск:
  `medium`. Сценарий прост, но завязан на двойную систему spacing:
  screen-margin у answer и print-margin у отдельного DOM-элемента.

### `vectors`

- Экран сейчас:
  включается отдельный grid `auto 1fr 220px`, карточка становится
  `position:relative`, фигура живёт в фиксированной колонке, ответ
  прижимается вниз, а у `unique` video-slot уходит в абсолютный правый
  нижний угол (`1005-1051`).
- Печать сейчас:
  тот же scenario перепривязывается на колонку `29%`, фигура получает
  `overflow:visible`, `aspect-ratio:unset`, а `.print-ans-line`
  прибивается к низу `align-self:end` (`3516-3527`, `3586-3592`).
- Риск:
  `high`. Это самый конфликтный сценарий, потому что screen и print
  используют один и тот же маркер `data-fig-type="vectors"`, но разные
  layout-модели.

### `graphs`

- Экран сейчас:
  для graphs меняется только ширина третьей колонки до `29%`, а у самой
  фигуры снимаются вертикальные paddings (`1083-1119`).
- Печать сейчас:
  отдельного graph-specific print-block нет; сценарий в основном живёт на
  общей print-геометрии фигур и на `zoom`-компенсации.
- Риск:
  `medium`. Графики менее конфликтны, чем vectors, но всё ещё завязаны на
  shared column sizing и общее print-масштабирование.

### `derivatives landscape`

- Экран сейчас:
  карточка перестраивается в три строки:
  `"num stem" / ". fig" / "ans ans"`, сама фигура получает центровку и
  ограничения ширины `56%` или `39%` для `landscape-narrow`
  (`1064-1108`).
- Печать сейчас:
  `.print-ans-line` вручную переносится в `grid-row:3` с `margin-top:2em`,
  чтобы не лечь поверх картинки (`3594-3600`).
- Риск:
  `high`. Это хрупкий сценарий с явной зависимостью print-line от
  screen-grid-структуры.

### `derivatives portrait`

- Экран сейчас:
  фигура уходит вправо, карточка возвращается к двухстрочной схеме, а
  ширина колонки становится `27%` (`1073-1080`, `1109-1112`).
- Печать сейчас:
  print расширяет ту же колонку до `29%` (`3529-3535`).
- Риск:
  `high`. Налицо две разные canonical widths для одного и того же
  маркера orientation.

### `large figure`

- Экран сейчас:
  `data-fig-size="large"` меняет grid-колонку карточки на `38%`,
  а изображение растягивается на всю ширину колонки
  (`986-990`, `1265-1266`).
- Печать сейчас:
  часть large-кейсов живёт на общих print-ограничениях, а часть
  дополнительно переопределяется через `vectors` и `derivatives portrait`.
- Риск:
  `medium`. База понятна, но large не единый сценарий: внутри него
  живут разные fig-type rules.

### `small figure`

- Экран сейчас:
  базовый three-column layout `auto 3fr 1.2fr`, а `img` ограничен
  `max-height:180px` (`971-983`, `1262`).
- Печать сейчас:
  отдельного small-specific print-rule нет; сценарий идёт через общие
  print-rules на `.task-fig/.ws-fig` и `.task-fig img/.ws-fig img`.
- Риск:
  `low/medium`. Самый предсказуемый кейс, но он всё равно зависит от
  shared figure box.

## 7. Baseline-артефакты

В репозиторий бинарные baseline-артефакты не добавлялись. Для `W2.0`
зафиксирован воспроизводимый способ их получения.

### 7.1 Что считать baseline-набором

Минимальный набор для сравнения до/после:

- desktop baseline для `trainer`;
- mobile baseline для `trainer`;
- desktop baseline для `list`;
- mobile baseline для `list`;
- desktop baseline для `unique`;
- mobile baseline для `unique`;
- хотя бы один baseline print-preview/PDF на репрезентативной карточке.

### 7.2 Локальный запуск

Из корня workspace:

```bash
cd /home/automation/EGE_rep_Вишня./EGE_rep
python3 -m http.server 8000
```

После этого страницы доступны по `http://localhost:8000/...`.

### 7.3 Репрезентативные URL и сценарии

`list.html`:

- `http://localhost:8000/tasks/list.html?topic=2.1&view=all` — vectors;
- `http://localhost:8000/tasks/list.html?topic=8.1&view=all` — derivatives;
- `http://localhost:8000/tasks/list.html?topic=11.1&view=all` — graphs.

`unique.html`:

- `http://localhost:8000/tasks/unique.html?section=2` — vectors;
- `http://localhost:8000/tasks/unique.html?section=8` — derivatives;
- `http://localhost:8000/tasks/unique.html?section=11` — graphs.

`trainer.html`:

- screen single-card: `http://localhost:8000/tasks/trainer.html?step=1`;
- sheet mode: `http://localhost:8000/tasks/trainer.html`;
- summary/review: довести сессию до конца на тех же данных.

Для воспроизводимости `trainer` требует `sessionStorage.tasks_selection_v1`.
Минимальный рабочий seed можно проставить в DevTools Console до загрузки
страницы:

```js
sessionStorage.setItem('tasks_selection_v1', JSON.stringify({
  topics: { '2.1': 1, '8.1': 1, '11.1': 1 },
  sections: {},
  mode: 'test',
  shuffle: false
}));
location.href = '/tasks/trainer.html?step=1';
```

Это даёт baseline на mixed-figure наборе: vectors + derivatives + graphs.

### 7.4 Viewport-матрица

Снимать минимум в двух viewport-профилях:

- desktop: `1440x1200`;
- mobile: `390x844`.

Для каждой страницы достаточно зафиксировать:

- первый экран;
- одну карточку vectors;
- одну карточку derivatives;
- одну карточку graphs;
- для `unique` дополнительно кейс с `ws-ans-wrap` и `video-solution-slot`;
- для `trainer` дополнительно `summary/review`.

### 7.5 Print baseline

Репрезентативный print baseline:

1. Открыть `list.html?topic=8.1&view=all` или `unique.html?section=8`.
2. Нажать кнопку печати.
3. Снять две версии:
   - без `withAnswers`;
   - с `withAnswers`.
4. В диалоге браузера выбрать `Save as PDF`.
5. Зафиксировать минимум первую страницу и страницу с derivatives landscape.

Почему именно эти страницы:

- `8.x` покрывает самый хрупкий кейс `derivatives landscape`;
- `list` даёт canonical `task-card`;
- `unique` даёт `ws-ans-wrap` и заголовки аккордеона.

### 7.6 Текущее automated baseline

Что удалось проверить локально:

- `node tools/check_no_eval.mjs` — проходит.

Что не удалось прогнать в текущем окружении:

- `cd tests && node print-features.js` — не запускается, потому что
  отсутствует модуль `puppeteer`.

Это не блокирует `W2.0`, но это важно зафиксировать как инженерный факт:
baseline print-smoke сейчас не воспроизводится из коробки без внешней
зависимости.

## 8. Главные конфликтные зоны

1. Общий grid-контур `.task-card/.ws-item` в `tasks/trainer.css:953-983`.
   Это единая база для `trainer/list/unique`, в которую уже встроены
   print-friendly допущения через фигуры и spacing.

2. Vectors-сценарий в `tasks/trainer.css:1005-1051` и `3516-3527`, `3586-3592`.
   Один и тот же marker-driven сценарий имеет две разные layout-модели:
   screen на `220px`, print на `29%`.

3. Derivatives landscape в `tasks/trainer.css:1064-1108` и `3594-3600`.
   Print line ответа знает о screen-grid и вручную перепрыгивает строку с
   фигурой.

4. Ответный слой `.task-ans/.ws-ans` vs `.print-ans-line` в
   `tasks/trainer.css:1198-1237` и `3561-3639`.
   Это две разные сущности для одного смыслового блока ответа, плюс
   `unique` добавляет третий слой `ws-ans-wrap`.

5. Зависимость print CSS от page-level JS zoom в `tasks/list.js:41-89` и
   `tasks/unique.js:50-71`.
   `zoom=0.7` и `zoom: calc(1 / 0.7)` в `3513-3514` образуют связку,
   которую нельзя ломать частично.

## 9. Что нельзя делать вслепую в W2.1+

Нельзя:

- выносить `@media print` в отдельный файл без переписи зависимостей на
  `beforeprint zoom`, `body.print-with-answers` и `.print-custom-title`;
- считать `.task-card/.ws-item` чисто screen-базой в текущем виде:
  vectors и derivatives уже содержат print-компромиссы;
- менять только `.task-ans/.ws-ans`, забыв про `.print-ans-line` и
  `ws-ans-wrap`;
- менять vectors-геометрию без одновременной проверки `unique`-страницы с
  `video-solution-slot`;
- менять derivatives portrait width, не сверяя print-версию `29%` и
  screen-версию `27%`;
- править pagination rules (`break-inside`, `break-after`) без проверки
  `unique`-аккордеона и первого элемента после topic-row;
- вводить новый print-state поверх старого поведения молча: сначала нужно
  явно картировать, какие текущие CSS-ветки будут жить под этим state.

Безопасная опора для `W2.1`:

- вводить явный print-state как новый слой управления;
- не менять пока канонический screen-layout карточек;
- сначала привязать существующий print-контур к state, а уже потом
  разбирать screen-base и фигурные правила.
