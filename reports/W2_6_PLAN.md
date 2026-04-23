# W2_6_PLAN — Финальный acceptance screen/print

Дата создания: 2026-04-22  
Дата актуализации: 2026-04-22  
Волна: `W2.6`  
Статус: completed  
Приоритет: `P0`

Связанные документы:
- `W2_PLAN.md`
- `GLOBAL_PLAN.md`
- `PROJECT_STATUS.md`
- `docs/navigation/print_layout_contract.md`
- `w2_4_report.md`
- `w2_6_report.md`
- `w2_6_fix_report.md`
- `tests/print-features.js`
- `e2e/student/visual-walkthrough.spec.js`
- `e2e/student/w2-4-print-layout.spec.js`
- `e2e/student/w2-6-fix.spec.js`

---

## 0. Назначение подволны

`W2.6` не про новый layout-fix и не про structural CSS cleanup.

Это финальная acceptance/stabilization подволна для `W2`, задача которой:
- подтвердить, что уже сделанное разделение `screen/print` реально работает
  на живых страницах;
- собрать воспроизводимый evidence packet;
- закрыть `W2` как поведенчески подтверждённый трек или открыть отдельный
  follow-up с узким scope.

Актуальный статус на `2026-04-22`:
- первичный acceptance собран в `w2_6_report.md`;
- reviewer feedback закрыт узким fix-пакетом `w2_6_fix_report.md`;
- подволна принята и больше не находится в активном review-cycle.

Итог `W2.6`:
- `W2.6 completed`;
- можно переходить к `W2.5`;
- любой новый дефект после этого оформляется как отдельный follow-up, а не как незакрытый хвост `W2.6`.

---

## 1. Входной baseline

На входе в `W2.6` уже подтверждено:

- `W2.0` завершила inventory и freeze;
- `W2.1` ввела `body.print-layout-active` и managed print lifecycle;
- `W2.2` очистила screen-layout от основных print-driven компромиссов;
- `W2.3` собрала print-layout в отдельный state-gated контур;
- `W2.4` исправила mobile trainer regression и добавила Playwright visual spec.

Важный входной факт:
- `W2.4` уже зелёная по evidence, но это ещё не финальный acceptance всего
  `W2`, потому что не покрыт целиком реальный `trainer/list/unique`
  screen/mobile/print flow, включая lifecycle печати.
- после первичного `W2.6` acceptance выяснилось, что для честного закрытия
  нужны ещё:
  - реальный print entrypoint на `trainer`;
  - runnable `tests/print-features.js` в текущем test environment;
  - узкие screen-fixes для trainer sheet-mode.

---

## 2. Цель

Подтвердить, что:
- `trainer/list/unique` устойчивы в screen на desktop и mobile;
- print-state включается и очищается корректно;
- печать без ответов и с ответами не ломает screen-mode;
- переход `screen -> print -> screen` воспроизводим без грязного state;
- текущий контракт `body.print-layout-active + @media print` выдерживает
  финальный acceptance.

---

## 3. Out of Scope

В `W2.6` не входят:

- structural CSS refactor (`W2.5`);
- новые layout redesign changes;
- массовая правка DOM-структуры карточек;
- backend/RPC/SQL/auth-flow изменения;
- отдельная стабилизация `setup-student` session-capture flake, если он не
  блокирует acceptance;
- teacher visual/e2e;
- переписывание существующих e2e на новый harness без необходимости.

Если acceptance обнаружит новый дефект, его нельзя молча чинить в рамках
большой побочной волны. Нужно либо сделать узкий fix, либо открыть follow-up.

---

## 4. Основные проверяемые поверхности

Обязательные страницы:
- `tasks/trainer.html`
- `tasks/list.html`
- `tasks/unique.html`

Обязательные режимы:
- screen desktop
- screen mobile
- print без ответов
- print с ответами

Обязательные lifecycle-переходы:
- вход в print-state
- отмена печати / возврат
- повторный вход в печать
- cleanup после выхода

Обязательные contract points:
- `body.print-layout-active`
- `body.print-with-answers`
- `.print-ans-line`
- `details.task-ans`, `details.ws-ans`
- `ws-ans-wrap`
- `video-solution-slot`

---

## 5. Ожидаемые артефакты

Исполнитель должен вернуть:

- `w2_6_report.md` — итоговый acceptance report;
- screenshots по screen/mobile/print сценариям;
- trace/video для спорных кейсов или lifecycle-проверок;
- список команд, которые были реально прогнаны;
- явный итог:
  - `W2.6 completed`
  - или `W2.6 blocked/follow-up required`

Желаемая структура артефактов:
- `test-results/w2-6/...`

Если исполнитель использует другой каталог артефактов, это нужно явно указать
в отчёте.

---

## 6. Допустимые изменения

Разрешено:
- дополнять существующие Playwright specs;
- добавлять новый `e2e/student/w2-6-*.spec.js`, если это чище, чем
  перегружать `w2-4-print-layout.spec.js`;
- точечно усиливать `tests/print-features.js`, если это помогает проверить
  lifecycle contract;
- добавлять screenshots/trace hooks и локальные helper assertions;
- делать узкие layout/lifecycle fixes, если они напрямую выявлены `W2.6`.

Не разрешено без stop-ask:
- разворачивать большой CSS refactor;
- менять архитектуру print-flow;
- расширять scope на teacher pages;
- переделывать весь e2e harness;
- смешивать acceptance с `W2.5`.

---

## 7. Пошаговый план реализации

### W2.6.0 — Подтвердить стартовый baseline

Статус: `pending`

Шаги:
1. Проверить, что входной baseline `W2.4` действительно доступен:
   - `w2_4_report.md`
   - `e2e/student/w2-4-print-layout.spec.js`
   - `e2e/student/visual-walkthrough.spec.js`
2. Не начинать с рефактора тестов; сначала убедиться, что текущий контур
   запускается.
3. Зафиксировать известный внешний риск:
   - `setup-student` flake допустим как residual risk, если повторный запуск
     снимает проблему и acceptance при этом не искажается.

Результат:
- понятный стартовый baseline без ложного ощущения, что acceptance уже закрыт.

### W2.6.1 — Дособрать screen evidence

Статус: `pending`

Шаги:
1. Проверить `trainer`, `list`, `unique` на desktop.
2. Проверить те же страницы на mobile.
3. Не ограничиваться только видимостью элементов:
   - где нужно, добавить geometry assertions;
   - где нужно, проверять отсутствие collapse/overlap.
4. Если `W2.4` уже покрывает часть сценариев, не дублировать blindly:
   - переиспользовать существующий spec там, где он уже релевантен;
   - добавить только недостающие реальные страницы или состояния.

Результат:
- финальный screen evidence set по `trainer/list/unique`.

### W2.6.2 — Подтвердить print-state lifecycle

Статус: `pending`

Шаги:
1. Проверить print без ответов.
2. Проверить print с ответами.
3. Проверить возврат в screen после print-state.
4. Проверить повторный вход в print.
5. Проверить cleanup:
   - `print-layout-active` не остаётся висеть;
   - `print-with-answers` не протекает обратно в screen;
   - `zoom` / page-level print markers очищаются.

Результат:
- подтверждение того, что проблема уже не только "визуально выглядит лучше",
  а lifecycle реально управляем.

### W2.6.3 — Прогнать существующий print/test контур

Статус: `pending`

Минимальный набор:
1. `node tools/check_no_eval.mjs`
2. `cd tests && node print-features.js`
3. relevant Playwright runs по student-flow

Если потребуется:
- headed/diag запуск для спорного кейса;
- повтор setup только при известном flake.

Результат:
- acceptance опирается не только на screenshots, но и на существующий
  automated safety net.

### W2.6.4 — Узкий fix only if needed

Статус: `pending`

Правило:
- если в acceptance найден дефект, исправление допустимо только если оно:
  - узкое;
  - находится внутри `W2` scope;
  - не превращается в `W2.5`.

Если дефект требует:
- массового CSS reshuffle;
- новой DOM-схемы;
- изменения соседних page families;
то нужно stop-ask / follow-up packet, а не молчаливое расширение scope.

Результат:
- либо acceptance закрывается без кода;
- либо закрывается с узким fix;
- либо split в follow-up.

### W2.6.5 — Собрать финальный report/evidence packet

Статус: `pending`

В отчёте обязательно указать:
- что именно проверялось;
- какие команды были выполнены;
- какие артефакты получены;
- какие сценарии зелёные;
- какие residual risks остались;
- закрыта ли `W2.6`;
- можно ли открывать `W2.5`.

Результат:
- у reviewer и оператора есть воспроизводимый пакет, а не устный пересказ.

---

## 8. Рекомендуемые команды

Минимальный пакет:

```bash
node tools/check_no_eval.mjs
cd tests && node print-features.js
```

```bash
npx playwright test --project=student e2e/student/visual-walkthrough.spec.js --reporter=list
```

```bash
npx playwright test --project=student e2e/student/w2-4-print-layout.spec.js --reporter=list
```

Если нужен отдельный `W2.6` spec:

```bash
npx playwright test --project=student e2e/student/w2-6-acceptance.spec.js --reporter=list
```

Диагностический режим:

```bash
npm run e2e:diag -- --project=student <spec>
```

Известный auth/session follow-up:

```bash
rm -f .auth/student.json
npx playwright test --project=setup-student --reporter=list
```

Этот шаг не должен превращаться в отдельную волну стабилизации auth-layer.

---

## 9. Основные файлы для handoff исполнителю

К чтению в первую очередь:
- `W2_PLAN.md`
- `GLOBAL_PLAN.md`
- `w2_4_report.md`
- `docs/navigation/print_layout_contract.md`

К изменению с высокой вероятностью:
- `e2e/student/w2-4-print-layout.spec.js`
- `tests/print-features.js`
- при необходимости новый `e2e/student/w2-6-acceptance.spec.js`
- при необходимости `tasks/trainer.css`
- при необходимости `app/ui/print_lifecycle.js`
- при необходимости `app/ui/print_btn.js`

Изменения в `tasks/list.js` / `tasks/unique.js` допустимы только если acceptance
покажет реальную lifecycle/print-state проблему именно там.

---

## 10. Риски и stop-ask точки

Основные риски:
- acceptance выявит проблему не в `trainer`, а в `list` или `unique`, которые
  пока покрыты слабее;
- lifecycle печати окажется зелёным в `emulateMedia('print')`, но не в реальном
  page flow;
- исполнитель начнёт чинить структуру CSS вместо acceptance;
- известный `setup-student` flake начнёт маскировать реальные выводы.

Stop-ask обязателен, если:
- нужен крупный CSS refactor;
- нужно править больше трёх page families;
- требуется менять print contract, зафиксированный в
  `docs/navigation/print_layout_contract.md`;
- найден дефект, который уходит в auth/session/runtime, а не в W2 screen/print.

---

## 11. Критерии приёмки (DoD)

`W2.6` считается закрытой, если одновременно выполнено:

- есть browser evidence по `trainer/list/unique`;
- есть screen evidence для desktop и mobile;
- есть print evidence без ответов и с ответами;
- подтверждён lifecycle cleanup;
- `tests/print-features.js` и базовые безопасные проверки зелёные;
- сформирован `w2_6_report.md`;
- итог однозначен:
  - либо `W2.6 completed`;
  - либо открыт отдельный follow-up с узким scope.

`W2.6` не считается закрытой, если:
- есть только screenshots без описанного lifecycle;
- есть только synthetic checks без реальных browser artifacts;
- acceptance подменена structural-polish работой;
- найден дефект, но он не выделен в follow-up.

---

## 12. Готовая постановка для исполнителя

Исполнителю нужно ставить задачу в таком виде:

1. не перепридумывать `W2`, а закрыть именно `W2.6`;
2. собрать финальный acceptance packet по `trainer/list/unique`;
3. подтвердить screen desktop/mobile и print with/without answers;
4. проверить cleanup `print-layout-active` и related lifecycle;
5. при необходимости внести только узкий fix;
6. вернуть `w2_6_report.md`, commands run, artifacts и явный verdict.

Ключевой запрет:
- не смешивать `W2.6` с `W2.5`.
