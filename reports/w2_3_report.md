# W2.3 Report

Дата: 2026-04-22  
Волна: `W2.3`  
Статус: ready for review

## Что входило в W2.3

В рамки этой волны входило:

- подтвердить фактическую границу между screen-layer и print-layer;
- собрать print-layout карточек в отдельный явный контур;
- привязать print-specific layout к связке `@media print` +
  `body.print-layout-active`;
- снизить смешение print-state и answer-layer без расширения объёма до `W2.4`;
- проверить, что `list`, `unique`, `hw`, `hw_create` продолжают жить на общем
  lifecycle печати.

В рамки волны не входили:

- редизайн карточек;
- массовая перестройка DOM;
- закрытие `W2.4`, `W2.5`, `W2.6`.

## Какие файлы реально изменены

- `tasks/trainer.css`
- `tests/print-features.js`
- `docs/navigation/print_layout_contract.md`
- `w2_3_report.md`

## Как теперь проходит граница screen / print

### Screen-layer

Screen-база карточек остаётся в обычных screen-селекторах `tasks/trainer.css`:

- `.task-card`, `.ws-item`
- `.task-fig`, `.ws-fig`
- `.task-ans`, `.ws-ans`
- `.ws-ans-wrap`
- mobile contract `@media (max-width: 720px)`

Эти правила не зависят от `print-layout-active`.

### Print-layer

Print-layout карточек теперь оформлен как отдельный логический контур внутри
`@media print`, но его селекторы завязаны на `body.print-layout-active`.

Под этот контур вынесены и явно собраны:

- print grid карточек;
- print pagination (`break-inside`, `break-after`);
- print geometry для `vectors`, `graphs`, `derivatives`;
- print-only answer-line `.print-ans-line`;
- print-only размеры текста;
- print-only image compensation через `zoom: calc(1 / 0.7)`;
- print override для `ws-ans-wrap`, чтобы print-mode не зависел от
  screen-only flex-компоновки unique-страницы.

Отдельно зафиксирован контракт в:

- `docs/navigation/print_layout_contract.md`

## Что именно подтверждено по коду

- `app/ui/print_lifecycle.js` остаётся единым runtime-источником
  `print-layout-active` / `print-with-answers`;
- `app/ui/print_btn.js` по-прежнему использует managed flow и не возвращает
  page-level хаки;
- `tasks/list.js`, `tasks/unique.js`, `tasks/hw.js`, `tasks/hw_create.js`
  продолжают регистрировать общий `registerStandardPrintPageLifecycle()`;
- новый print-контур не требует возврата к разрозненным `beforeprint` /
  `afterprint` по страницам.

## Что проверено

Статически:

- обязательные документы волны прочитаны и сверены с кодом;
- print-блок `tasks/trainer.css` просмотрен целиком, включая хвостовые
  override'ы после основного блока;
- подтверждено, что print-layout rules теперь висят на
  `body.print-layout-active`.

Локально:

- `node tools/check_no_eval.mjs`
- `node tests/print-features.js` attempted

## Ограничения проверки в этой среде

- живой browser-smoke на реальных `list.html`, `unique.html`, `hw.html`,
  `hw_create.html` в интерактивном браузере не проводился в этом CLI-окружении;
- visual acceptance по PDF/print-preview не заявляется;
- `tests/print-features.js` в этой среде не исполняется, потому что отсутствует
  модуль `puppeteer` (`Cannot find module 'puppeteer'`);
- если `puppeteer` или локальный браузер в среде недоступны, `W2.6` всё ещё
  остаётся отдельным acceptance-этапом.

## Что остаётся на W2.4

- дальнейшее разведение figure-cases и answer-layer без опоры на общие
  карточечные сущности;
- проверка и, возможно, точечная доработка сложных комбинаций:
  `ws-ans-wrap`, `video-solution-slot`, `vectors`, `graphs`,
  `derivatives portrait/landscape`;
- подтверждение, что print-layout можно ещё сильнее отделить по ответственности
  без расширения объёма до `W2.5`.

## Рекомендация по следующему шагу

Переход к `W2.4` возможен, если оператор отдельно проведёт живой browser-smoke
по `list` и `unique` и не найдёт визуальных регрессий.

Если на этом smoke всплывут проблемы именно в `vectors / graphs / derivatives`
или в `ws-ans-wrap`, нужен follow-up внутри `W2.4`, а не возврат print-layout
обратно в screen-базу.
