# W2 · Шаг 1 — Вынос `tasks/picker_common.js` (план для исполнителя)

Дата: 2026-05-29
Автор: куратор
Трек: W2 (декомпозиция `tasks/picker.js`) · шаг 1
Тип: **правка продуктового кода** (`tasks/picker.js`) — **red-zone-adjacent** (модуль обеих home-страниц)
Статус: готов к исполнению
Связано: `reports/w2_picker_3file_volume_recon_report.md`, `reports/w2_picker_target_arch_design_report.md`, `W2_step0_charnet_PLAN.md`, `reports/w2_step0_charnet_report.md`

> **Процессная пометка.** Шаг НЕ внесён в `GLOBAL_PLAN.md` (решение оператора). **Стратегически нейтрален:**
> `picker_common.js` нужен и 3-файловому пути, и полному `W2_2_PLAN.md` — его создание не коммитит ни в одну
> стратегию (развилка остаётся на Шаге 2).
>
> **Pre-condition:** characterization-сеть Шага 0 присутствует и зелёная в рабочем дереве (обе charnet-специи +
> golden + `e2e/helpers/stats-snapshot.cjs`). Она — главный регресс-гейт этого шага.

---

## 1. Цель

Вынести **чистые stateless-утилиты** из `tasks/picker.js` в новый модуль `tasks/picker_common.js` (с `export`),
заменив определения на импорты. Поведение идентично — это **механический lift без изменения логики**.
`picker.js` ужимается; появляется переиспользуемая роле-агностичная база.

## 2. Контекст и мотивация

- `reports/w2_picker_3file_volume_recon_report.md`: `common`-корзина ~556 строк / 33 функции (из них 5 уже в
  `picker_added_tasks.js` после W2.1'). Реальный набор Шага 1 — generic-утилиты (~20–28 функций), движок и
  статистику не трогаем.
- Прецедент готов: W2.1' уже вынес `picker_added_tasks.js` тем же приёмом (no DOM / no state / no cycle).
  Паттерн импорта в `tasks/picker.js:23`: `import { … } from './picker_added_tasks.js?v=2026-05-26-2';` — зеркалить.
- `picker_added_tasks.js` НЕ использует ни одного common-кандидата (проверено grep'ом) → править его не нужно.
- Safety-net: Шаг 0 пинит data→DOM-контракт обоих рендереров статистики. Чистый вынос обязан оставить снимки
  зелёными — это и есть критерий «логику не задели».

## 3. Out of scope

НЕ делаем на этом шаге:
- `picker_stats.js` / любую правку рендереров статистики (`applyDashboardHomeStats`/`applyTeacherPickingHomeStats`)
  и писателей бейджей — это Шаг 2;
- вынос изменяемого состояния (`CHOICE_*`/`SECTIONS`/`CATALOG`/`LAST_DASH`/…) — состояние остаётся module-level в `picker.js`;
- resolve/preview-трио (`buildQuestionForPreview`/`getTeacherResolveManifestIndex`/`buildPreviewQuestionsFromResolveRows`)
  — это engine-adjacent, отдельный микрошаг (в `picker_added_tasks.js`), НЕ в этот common;
- любой role-split, event-bus, движок added-tasks (§17);
- правку `picker_added_tasks.js`, `playwright.config.cjs`, helper'ов e2e, governance-скриптов;
- фикс pre-existing red `teacher/home` smoke (находка Шага 0 — отдельный трек);
- любое изменение поведения, бизнес-логики, DOM-структуры.

## 4. Затрагиваемые файлы

- **NEW** `tasks/picker_common.js` — вынесенные чистые утилиты (с `export`).
- **MODIFY** `tasks/picker.js` — удалить определения вынесенных функций, добавить `import { … } from './picker_common.js?v=<build>';` (зеркалить паттерн строки 23).
- **MECHANICAL (sanctioned)** `node tools/bump_build.mjs` — перепишет `?v=` build-id по репозиторию. Это ожидаемый
  cache-bust-инвариант (`CLAUDE.md`), НЕ scope expansion. **Единственные логические правки — в `picker.js` +
  `picker_common.js`; все прочие изменённые файлы должны содержать ТОЛЬКО изменение `?v=`-строк.**
- **NEW** `reports/w2_step1_common_report.md` — отчёт.

Любой файл вне этого списка с **не-`?v=`** правкой = выход за scope (stop-ask §6.3 п.1).

## 5. Пошаговый план

> **Task-tracking (обязательно):** в начале создай TaskList через `TaskCreate` с пунктами §5.1–§5.7,
> обновляй статус `TaskUpdate` (`in_progress`/`completed`) по ходу.

**5.1. Определить набор для выноса (grounding по ТЕКУЩЕМУ коду, по ИМЕНАМ — не по строкам).**
Номера строк в `reports/w2_0_artifacts/function_inventory.csv` устарели (baseline 5130 vs текущий 4947) — искать
функции по имени. Кандидаты (из volume-разведки, generic pure utils):

- **Tier A (однозначно чистые — вынести):** `safeJsonParse`, `fmtName`, `emailLocalPart`, `getAppBuildTag`,
  `readCache`, `writeCache`, `pct`, `badgeClassByPct`, `fmtPct`, `fmtCnt`, `fmtDateTimeRu`, `fmtDateShortRu`,
  `badgeClassByLastAttemptAt`, `supabaseRefFromUrl`, `sessionTtlSec`, `anyPositive`, `inferTopicIdFromQuestionId`,
  `interpolate`, `escapeHtml`, `esc`, `compareId`.
- **Tier B (вынести ВМЕСТЕ с их dependency-closure, если closure чист):** `asset`, `buildStemPreview`,
  `typesetMathIfNeeded`, `ensureMathJaxLoaded` (несут приватный `let __mjLoading` — перенести вместе с ним).
  Их зависимости из `app/*` (`toAbsUrl`/`withBuild`/`setStem` и т.п.) `picker_common.js` импортирует напрямую из `app/*`.

**Инвариант чистоты (жёсткий):** функция уходит в `picker_common.js`, ТОЛЬКО если она НЕ читает изменяемое
module-state `picker.js` (`CHOICE_*`, `SECTIONS`, `CATALOG`, `LAST_DASH`, `TEACHER_VIEW_STUDENT_ID`, `PICK_MODE`,
`$`/`$$` если они завязаны на состояние, и т.п.). Чтение **frozen-const** (`IN_TASKS_DIR`/`PAGES_BASE`) допустимо
только если этот const переносится вместе (он тоже неизменяемый pure-вычислимый) ИЛИ функция от него не зависит.
Сверяться с `reports/w2_0_artifacts/state_flow.csv` + читать тело каждой функции. Если кандидат читает изменяемое
состояние → **исключить из выноса**, зафиксировать в отчёте (это решение внутри scope, НЕ stop-ask). `picker_common.js`
импортирует ТОЛЬКО из `app/*` и НИЧЕГО из `picker.js`/`picker_added_tasks.js` (лист остаётся листом, граф ацикличен).

**5.2. Создать `tasks/picker_common.js`.** Перенести выбранные функции (+ нужные frozen-const/приватные кэши),
пометить `export`. Шапка-комментарий: назначение, инвариант «no picker-state, no cycle, imports only app/*».

**5.3. Переключить `tasks/picker.js` на импорт.** Удалить перенесённые определения; добавить
`import { … } from './picker_common.js?v=<build>';` рядом со строкой 23 (зеркалить паттерн `picker_added_tasks.js`).
Убедиться, что все внутренние вызовы вынесенных функций теперь резолвятся через импорт (0 dynamic dispatch →
достаточно статической замены).

**5.4. `node tools/bump_build.mjs`.** Синхронизировать `?v=` (новый модуль импортируется picker.js). Зафиксировать
новый build-id.

**5.5. Регресс-гейт (главное).** Прогнать обе charnet-специи Шага 0 — **обязаны остаться зелёными** (data→DOM не
изменился). Если хоть один golden упал → **STOP-ASK §6.3 п.10a** (чистый вынос изменил рендеринг = что-то не так;
**НЕ обновлять golden, чтобы «позеленить»** — это замаскирует регресс).

**5.6. Полная проверка.** `npm run e2e` (новых reds сверх двух known pre-existing быть не должно) + governance-trio
+ browser-smoke `home_student.html` и `home_teacher.html` (консоль чистая, аккордеон+статистика рендерятся,
прото-модалка открывается, bulk-pick → start ведёт в trainer). Conservation: посчитать функции picker.js до/после,
функции picker_common.js, подтвердить «снято = добавлено, без дублей, без осиротевших ссылок».

**5.7. Отчёт `reports/w2_step1_common_report.md`** — см. §11.

## 6. Данные / контракты / миграции

SQL/RPC/миграции не требуются. Runtime-контракты не затрагиваются (выносятся чистые утилиты, не read/write seams).
`?v=` bump обязателен (§5.4). `docs/navigation/*` sync не нужен (структура экранов не меняется).

## 7. Риски и stop-ask точки

**Red-zone-adjacent:** `tasks/picker.js` — модуль обеих home-страниц (близко к core routing `home_*.html`).
Применяется усиленный режим: scope lock (§4), обязательный browser-smoke обеих home-страниц (§5.6), регресс-гейт
charnet (§5.5).

Риски:
- **Скрытая не-чистота:** кандидат читает изменяемое состояние → молчаливый перенос сломает его. Гасится
  инвариантом §5.1 (verify против `state_flow.csv` + тело) + charnet-гейтом.
- **Сломанная ссылка после удаления определения** (функция вызывалась где-то ещё) → ловится `npm run e2e` +
  browser-smoke (ReferenceError в консоли).
- **Забыли `bump_build`** → браузер подтянет старый picker.js без нового импорта. Обязателен §5.4; проверяется в smoke.
- **Соблазн «заодно» вынести статистику/состояние/resolve-трио** → запрещено (§3); stop-ask на расширение (§6.3 п.9).

## 6.3 Режим работы: автономный

> **Режим работы: автономный.** Не останавливайся за подтверждением на каждом шаге, не проси промежуточного
> ревью. Доведи до DoD и верни отчёт (`reports/w2_step1_common_report.md` + completion summary). Куратор принимает
> работу целиком.
>
> **Останавливайся (stop-ask) только в экстренных случаях:**
> 1. Попытка изменить файл вне §4 с **не-`?v=`** правкой.
> 2. Попытка зайти в зону §3 (статистика/состояние/resolve-трио/движок/`picker_added_tasks.js`/red-zone) без approval.
> 3. План противоречит реальности (функция/импорт не существует; сигнатура иная).
> 4. DoD недостижим без выхода за scope.
> 5. Governance упал после `bump_build`, причина не очевидна из diff-а.
> 6. Уязвимость/утечка креденшлов.
> 7. Задача распадается на две независимых.
> 8. Один и тот же тест/снимок плывёт 2+ раза подряд после починки, причина неясна.
> 9. Нужно архитектурное решение вне §4.
> 10. **Проектные триггеры этой волны:**
>     - (a) **charnet-golden упал** после выноса (§5.5) → STOP-ASK; НЕ обновлять golden ради зелёного — это маскировка регресса;
>     - (b) кандидат-утилита читает изменяемое module-state → исключить из выноса и **зафиксировать в отчёте**
>       (это within-scope решение, НЕ стоп); стоп только если без неё рушится связность closure и непонятно как;
>     - (c) `npm run e2e` дал **новый** red сверх двух known pre-existing (`w2-6-fix` flake, `teacher/home` smoke) → STOP-ASK.
>
> **Что НЕ экстренный случай (работай сам):** имена/порядок; точный состав Tier B при verified-чистоте; повторный
> прогон governance/e2e/bump_build; решение исключить нечистого кандидата (с записью в отчёт).
>
> **Формат stop-ask:** короткое сообщение — какой пункт, что обнаружено, варианты, рекомендация. Жди решения.

## 8. Критерии приёмки (DoD)

1. `tasks/picker_common.js` создан; вынесенные функции `export`; модуль импортирует ТОЛЬКО из `app/*`, НИЧЕГО из
   `picker.js`/`picker_added_tasks.js` (ацикличность сохранена).
2. `tasks/picker.js` импортирует вынесенные функции; их прежние определения удалены; внутренние вызовы резолвятся.
3. **Обе charnet-специи Шага 0 зелёные** (golden НЕ изменены) — поведение статистики идентично.
4. `npm run e2e` — без новых reds сверх двух known pre-existing; governance-trio зелёный.
5. Browser-smoke `home_student.html` + `home_teacher.html`: консоль чистая, аккордеон+статистика+прото-модалка+
   bulk-pick→start работают (скриншоты/лог в отчёт).
6. `node tools/bump_build.mjs` прогнан; `?v=` синхронизирован; вне `picker.js`/`picker_common.js` все прочие правки —
   только `?v=`.
7. Conservation: функции picker.js (до) = picker.js (после) + picker_common.js, без дублей и осиротевших ссылок.
8. `reports/w2_step1_common_report.md` создан (§11).

## 9. План проверки (конкретные команды)

```bash
node tools/bump_build.mjs
# главный регресс-гейт — статистика не должна измениться:
npm run e2e -- e2e/student/picker-stats-charnet.spec.js e2e/teacher/picker-stats-charnet.spec.js
npm run e2e                       # полный — без новых reds сверх 2 known pre-existing
node tools/check_runtime_rpc_registry.mjs
node tools/check_runtime_catalog_reads.mjs
node tools/check_no_eval.mjs
python3 -m http.server 8000       # + руками: home_student.html и home_teacher.html (консоль, рендер, модалка, start)
git diff --stat                   # подтвердить: логика только в picker.js + picker_common.js; остальное — ?v=
```

## 10. Зачем именно так

Чистый вынос generic-утилит — самый безопасный первый кусок декомпозиции: нулевое изменение логики, регресс-гейт
готов (charnet), стратегия не выбирается. `picker.js` становится меньше, появляется чистая база для будущих
экранов и для Шага 2 (статистика). Состояние и движок не трогаются → R1/R2 полного плана не задеты.

## 11. Отчётный артефакт

`reports/w2_step1_common_report.md`:
- финальный список вынесенных функций (+ какие кандидаты исключены как нечистые и почему);
- подтверждение инварианта (picker_common.js импортирует только из `app/*`, нет цикла);
- conservation-учёт (picker.js до/после, picker_common.js, без дублей);
- вывод обоих charnet-прогонов (зелёные, golden не менялись), полного `npm run e2e`, governance-trio;
- browser-smoke evidence обеих home-страниц (скрин/лог, консоль чистая);
- новый build-id; `git diff --stat` (логика только в 2 файлах, остальное `?v=`);
- явный список созданных/изменённых файлов.
