# WTC2 · Фикс teacher-home «составления работ» (picker-side) — план для исполнителя

Дата: 2026-05-29
Автор: куратор
Тип: **изменение поведения** в движке added-tasks (`tasks/picker.js`, §17) — **RED-ZONE** (составление ДЗ учителем)
Статус: готов к исполнению
Связано: `reports/wtc1_teacher_compose_diag_report.md` (диагноз + доказательства), `WTC1_teacher_compose_diag_PLAN.md`

> **Процессная пометка.** Трек не в `GLOBAL_PLAN.md` (тег согласует оператор). Декомпозиция picker — **на паузе**
> (Шаги 0–2 закоммичены, ветка `w2-picker-decomp`). Этот фикс идёт поверх закоммиченного дерева.
> **Charnet НЕ защищает движок** (пинит только статистику) → регресс-сеть строится из probes WTC1.

---

## 1. Цель

Исправить семейство T0.2 «добавились не все задания» на стороне picker (один корень — счётчик отражает ЗАПРОШЕННОЕ,
а не фактически добавленное), по трём векторам: **#1 shortage** (показать правду), **#2 сетевой сбой** (не врать молча +
retry), **#3 refresh** (F5 не уничтожает собранную работу). Изменение поведения — корректное информирование/сохранение.

## 2. Контекст (диагноз WTC1, воспроизведено детерминированно)

- **Корень:** `#sum`=`getTotalSelected()` (sum `CHOICE_*`, picker.js:1958) = desired; фактически добавленные — в
  `_ADDED_CTX.buckets`, пополняются `appendPickedQuestionsToBucket` ровно на `returned_n`. Счётчик вниз не корректируется.
- **#1:** `teacher_picking_resolve_batch_v1` возвращает `shortages[].{requested_n,returned_n,is_shortage}` (ловится
  picker.js:3283), но FE игнорирует. E1b: count=99 → `#sum=99`, добавлено 26.
- **#2:** resolve `!res.ok → return []` (picker.js:3176), нет retry на `online`. A2: offline → `#sum=3`, добавлено 0, перманентный десинк.
- **#3:** `CHOICE_*` (module-`let`) не персистится; `persistAddedTasksContext` (2929) хранит только `buckets`. После F5
  boot-sync с пустым desired тримит бакеты до 0 (trim-phase ~picker.js:3432). I1: 4 → 0. **Двойной удар с T0.1** (F5 «лечит» разлогин и стирает работу).
- **Работает корректно (НЕ трогать):** seq-guard (B2), дебаунс-коалесинг (E3), trim при честном уменьшении (E4),
  изоляция вопросов по `sid` (B3), save-and-go freeze (H1). Регрессии здесь недопустимы.

## 3. Out of scope

- **#4 prefill↔`hw_create` консистентность** — кросс-модульно (`hw_create.js` потребляет counts+refs, :998-1001); отдельная волна **WTC3**. Здесь `hw_create.js` НЕ трогаем.
- **T0.1 разлогин / сессия / VPS** — отдельный трек, нужен живой репро (`supabase.js`/`supabase-rest.js` НЕ трогаем).
- Декомпозиция picker (на паузе), движок-рефактор сверх точечного фикса, role-split.
- `home_teacher.html`/любой HTML (core routing) — НЕ добавлять разметку; shortage показываем через существующие узлы модалки.
- auth-flow, RPC/SQL-контракты, governance-скрипты.

## 4. Затрагиваемые файлы

- **MODIFY** `tasks/picker.js` — движок added-tasks (sync/append/persist/boot) + текст shortage в существующих узлах модалки `#addedTasksHint`/`#addedTasksMeta`. Изменяемое module-state (`CHOICE_*`) — можно персистить (это и есть фикс #3).
- **NEW** `e2e/teacher/wtc2-compose-fix.spec.js` — регресс-сеть (из probes WTC1: E1b/A2/I1 + counter-truth), RED на текущем коде → GREEN после фикса.
- **MECHANICAL** `node tools/bump_build.mjs` — `?v=` (sanctioned).
- **NEW** `reports/wtc2_teacher_compose_fix_report.md`.

Запрещено вне списка: `hw_create.js`, `home_*.html`, `app/providers/*`, прочий продукт (не-`?v=`) → stop-ask §6.3 п.1/2.

## 5. Пошаговый план

> **Task-tracking (обязательно):** TaskList через `TaskCreate` по §5.1–§5.7, статусы `TaskUpdate`.

**5.1. Регресс-сеть RED-first (тесты до фикса).** `e2e/teacher/wtc2-compose-fix.spec.js` — переиспользовать
`e2e/helpers/teacher-trace.cjs`. Закодировать **ожидаемое (исправленное)** поведение как assertions; на текущем коде
они **должны падать** (фиксируем RED-baseline в отчёте):
- **counter-truth:** после sync `#sum`/видимый счётчик = фактически добавленному (или явный shortage-индикатор), не desired;
- **#1 shortage (E1b):** при `n=99` UI сообщает shortage (текст «запрошено 99, доступно M») И счётчик не «врёт» молча;
- **#2 сеть (A2):** offline-resolve → при возврате `online` авто-retry добирает / либо явная пометка «не добавлено»;
- **#3 refresh (I1):** добавить 4 → reload → added-set сохранён (≥ добавленного до reload), не 0.

**5.2. Fix #1 — правда о shortage (низкий риск, высокая ценность).** В `syncAddedTasksToSelection`/append-пути собрать
`shortages` (уже приходят, picker.js:3283) в состояние контекста; в `renderAddedTasksPreview`/модалке показать через
**существующие** `#addedTasksHint`/`#addedTasksMeta`: «Запрошено N, доступно M (банк исчерпан)». Видимый счётчик
привести к фактическому ИЛИ рядом показать фактическое (см. §«Открытые решения» — рекомендация: показать оба явно,
без тихой подмены). charnet-гейт §5.6.

**5.3. Fix #2 — сетевой сбой не врёт молча + retry.** При resolve `!res.ok` из-за сети: не оставлять счётчик впереди
реального — пометить бакет «incomplete» и (рекомендация) повесить разовый `window.addEventListener('online', …)` →
`scheduleSyncAddedTasks({reason:'reconnect'})` для добора; как минимум показать «не удалось добавить, повторите».
Не трогать seq/дебаунс-логику (она корректна). charnet-гейт §5.6.

**5.4. Fix #3 — F5 не уничтожает сборку (САМЫЙ рисковый, последним).** Персистить `CHOICE_*` per-context рядом с
`buckets` (в `persistAddedTasksContext`/store-схеме), регидрировать ДО boot-sync. **Критично:** отличать «пустой desired
из-за свежего boot до регидрации» от «юзер намеренно очистил (bulkResetAll)» — boot-sync НЕ должен тримить, пока CHOICE
не регидрирован. Не ломать честный trim при реальном уменьшении (E4 должен остаться GREEN). charnet-гейт §5.6.

**5.5. `node tools/bump_build.mjs`.**

**5.6. Гейты (после КАЖДОГО fix 5.2–5.4).** (а) **charnet зелёный** (статистика не задета — иначе регресс, stop-ask);
(б) соответствующие wtc2-assertions из RED → GREEN; (в) WTC1-«корректное» (E3/E4/B2/H1) НЕ сломано.

**5.7. Полная проверка + отчёт.** `npm run e2e` (charnet + wtc2 зелёные; новых reds сверх known pre-existing нет) +
governance + browser-smoke teacher-home со **скриншотом** shortage-сообщения (red-zone требует визуал). Отчёт §11.

## 6. Данные / контракты / миграции

SQL/RPC не меняются (shortage-данные уже приходят). sessionStorage-схема added-store **расширяется** (CHOICE per-context) —
обратная совместимость: старый store без CHOICE не должен ломать boot (трактовать как «нет сохранённого desired»). `?v=` bump обязателен.

## 7. Риски и stop-ask точки

**RED-ZONE** (составление ДЗ, движок §17). Усиленно: scope lock §4, регресс-сеть RED→GREEN, charnet-гейт после каждого fix, browser-smoke + скриншот.

- **#3 persist** — главный риск регресса: можно случайно сломать честный trim (E4) или восстановить «фантомный» набор. Гасится: чёткое разделение fresh-boot vs user-cleared + E4/I1 в регресс-сети.
- **Задеть корректное** (seq/дебаунс/изоляция по sid) — недопустимо; E3/E4/B2 в сети как guard.
- **Соблазн** залезть в `hw_create`/`home_teacher.html`/сессию → запрещено (§3), stop-ask.

## 6.3 Режим работы: автономный

> **Режим работы: автономный.** Доведи до DoD, верни отчёт. Куратор принимает целиком.
>
> **Останавливайся (stop-ask) только в экстренных случаях:**
> 1. Правка файла вне §4 (особенно `hw_create.js`/`home_*.html`/`app/providers/*`) с не-`?v=` изменением.
> 2. Заход в §3 (#4/hw_create, T0.1/сессия, декомпозиция) без approval.
> 3. План противоречит реальности (функция/механизм иной, чем в §2).
> 4. DoD недостижим без выхода за scope (например, shortage нельзя показать без правки HTML — тогда stop-ask с вариантом).
> 5. Governance упал, причина не из diff.
> 6. Уязвимость/утечка.
> 7. Задача распадается на независимые.
> 8. Тест/charnet плывёт 2+ раза после починки, причина неясна.
> 9. Архитектурное решение вне §4 (например, фикс требует менять RPC-контракт или формат store несовместимо).
> 10. **Проектные триггеры:**
>     - (a) **charnet покраснел** после любого fix → STOP-ASK (фикс задел статистику — это регресс, не цель);
>     - (b) **WTC1-«корректное» (E3/E4/B2/H1) сломалось** → STOP-ASK (задели работающее);
>     - (c) выбранный подход к #3 (persist CHOICE) грозит «фантомным» восстановлением или ломает honest-trim, и
>       развязка не очевидна → STOP-ASK (не угадывать на риске порчи сборки);
>     - (d) shortage/счётчик-семантика требует продуктового решения вне §«Открытые решения» → STOP-ASK.
>
> **Что НЕ экстренный случай:** имена/тексты сообщений; порядок 5.2–5.4; повторные прогоны.
>
> **Формат stop-ask:** пункт, что обнаружено, варианты, рекомендация.

## 8. Критерии приёмки (DoD)

1. `#1` shortage: при дефиците банка UI явно сообщает «запрошено N, доступно M», видимый счётчик не вводит в заблуждение (соответствует §«Открытые решения»).
2. `#2` сеть: после offline-resolve нет «тихого» десинка — авто-retry на `online` добирает или явная пометка; счётчик честен.
3. `#3` refresh: F5 во время сборки **сохраняет** added-set (не 0); честный trim при реальном уменьшении (E4) сохранён; `bulkResetAll` по-прежнему чистит.
4. Регресс-сеть `wtc2-compose-fix.spec.js`: соответствующие assertions **RED→GREEN**; зафиксирован RED-baseline до фикса.
5. **charnet зелёный** (golden не менялись) после всех фиксов; WTC1-«корректное» (E3/E4/B2/H1) зелёное.
6. `npm run e2e` без новых reds сверх known pre-existing; governance-trio зелёный.
7. Browser-smoke teacher-home + **скриншот** shortage-сообщения (red-zone).
8. `bump_build` прогнан; вне `picker.js` — только `?v=`. Отчёт `reports/wtc2_teacher_compose_fix_report.md` (§11).

## 9. План проверки

```bash
# RED-baseline ДО фикса:
npm run e2e -- e2e/teacher/wtc2-compose-fix.spec.js   # ожидаемо часть RED (зафиксировать)
# ... фикс ...
node tools/bump_build.mjs
npm run e2e -- e2e/teacher/wtc2-compose-fix.spec.js   # GREEN
npm run e2e -- e2e/student/picker-stats-charnet.spec.js e2e/teacher/picker-stats-charnet.spec.js  # charnet остаётся GREEN
npm run e2e                                            # без новых reds сверх known pre-existing
node tools/check_runtime_rpc_registry.mjs && node tools/check_runtime_catalog_reads.mjs && node tools/check_no_eval.mjs
git diff --stat                                        # логика только в picker.js; остальное ?v=
```

## 10. Открытые решения (вшиты рекомендации куратора — оператор может переопределить ДО старта)

1. **Shortage UX:** *рекомендация* — показать **явно** «запрошено N, доступно M» в модалке + счётчик отражает фактическое (не тихая подмена числа). Альтернативы: (б) молча скорректировать счётчик; (в) пытаться добрать, ослабив exclude.
2. **Сетевой сбой:** *рекомендация* — пометка «не добавлено» + авто-retry по `online`. Альтернатива: только пометка без авто-retry.
3. **F5/persist:** *рекомендация* — персистить `CHOICE_*` per-context + регидрация до boot-sync. Альтернатива: не тримить бакеты, пока CHOICE пуст из-за свежего boot (без персиста CHOICE) — проще, но менее полно.

## 11. Отчётный артефакт

`reports/wtc2_teacher_compose_fix_report.md`:
- что и где изменено (`file:line`, по каждому из #1/#2/#3) + выбранный вариант из §10;
- RED-baseline регресс-сети ДО фикса (доказательство, что ловит) → GREEN после;
- charnet зелёный (golden не менялись) + WTC1-«корректное» (E3/E4/B2/H1) зелёное;
- полный `npm run e2e` + governance; browser-smoke + **скриншот** shortage-сообщения;
- обратная совместимость store (старый формат без CHOICE не ломает boot);
- новый build-id; `git diff --stat` (логика только в picker.js); список файлов; что осталось в WTC3 (#4 prefill/hw_create) и T0.1-трек.
