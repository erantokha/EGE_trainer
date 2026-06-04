# WMB5 — отчёт исполнителя: date-бейдж + all-time тултип для self proto-modal

Дата: 2026-06-04
Трек: WMB (модальный proto-бейдж), волна WMB5 (реализует follow-up WMB4-f1)
Зона: RED-ZONE (изменение существующего RPC: drop+create со сменой return-колонок + RLS/grant + FE)
План: `WMB5_self_proto_modal_date_badge_PLAN.md`
Build id: **`2026-06-04-3`** (`version.json`)

> ⛔️ **НЕ ЗАКОММИЧЕНО, НЕ ЗАПУШЕНО — ЖДЁТ ОПЕРАТОРА.** Вся работа оставлена в
> рабочем дереве (uncommitted) для ревью. SQL в Supabase применяет оператор
> (`_wmb5_deploy.sql`). Коммит и пуш — только после явной команды оператора.

---

## 1. Итог

Реализована вся кодовая часть WMB5 (§5.1–§5.6). Self-ученик в модалке подбора
прототипов (`#protoPickerModal`) теперь получает **полный паритет** с teacher-видом:
- **date-бейдж «Последнее решение»** (`proto-modal-date-badge`) — дата + цвет по свежести;
- **тултип stats-бейджа** дотянут строками «за всё время: …» и «последняя попытка: …».

Точность X/3 (WMB4) не тронута. Teacher-путь модалки не изменён. Все governance
зелёные, charnet (teacher+student) зелёные, scope-lock соблюдён, 6 защищённых
SQL не тронуты, `rows=34` (без новых строк).

**Требует оператора (gated, §6):** применить `_wmb5_deploy.sql` (drop+create в одной
транзакции) ПЕРВЫМ; затем — только по явной команде — коммит + пуш FE. До деплоя
обновлённого RPC date-бейдж self деградирует gracefully (скрыт; live RPC отдаёт
3 колонки WMB4, лишние FE-поля → 0/null, без падения — обратная совместимость §6).

## 2. Изменённые / новые файлы (по §4)

Backend / контракты:
- `docs/supabase/proto_last3_for_self_v1.sql` — **MODIFY** (numstat +24 −4): в
  `returns table` добавлены `total integer, correct integer, last_attempt_at
  timestamptz`; в CTE `ranked` — `attempt_at = coalesce(ae.occurred_at,
  ae.created_at)`; в финальном select — `count(*)::int as total`, `count(*) filter
  (where r.correct)::int as correct`, `max(r.attempt_at) as last_attempt_at`. Из-за
  смены return-набора заголовок переведён на **`drop function if exists … + create`**
  (в одной транзакции). Окно last-3, scope (`where ae.student_id = auth.uid()`),
  guard (`security definer`/`search_path=public`/`revoke anon`/`grant authenticated`)
  — без изменений.
- `docs/supabase/_wmb5_deploy.sql` — **NEW**: самодостаточный idempotent
  `begin; drop if exists; create; revoke; grant; commit;` (паттерн `_wmb4_deploy.sql`).
  Откат: вернуть 3-колоночную WMB4-версию из git (`@ 7e075f5c`) и переприменить,
  либо `drop function`.
- `docs/supabase/runtime_rpc_registry.md` — **обновлено описание** существующей
  строки `proto_last3_for_self_v1` (приписка WMB5: 6 колонок, all-time +
  last_attempt_at, drop+create). **Счётчик rows не менялся — остался 34** (функция
  та же, не новая).

Frontend:
- `app/providers/homework.js` (numstat +9 −5): `protoLast3ForSelfV1` — в `map.set`
  добавлены `total`, `correct`, `last_attempt_at` (по образцу teacher per-question,
  но per-unic из одной строки ответа). Формат map:
  `unic_id -> { last3_total, last3_correct, total, correct, last_attempt_at }`.
- `tasks/picker.js` (numstat +29 −25):
  - `renderProtoModalCard` self-ветка: ручной одиночный stats-бейдж заменён на
    `buildModalBadgeGroup('proto-modal-badge', 'proto-modal-date-badge')` (date+stats,
    как teacher) с self-заголовками `'Моя статистика по группе'` / `'Последнее
    решение по группе'`. Структура карточки теперь идентична teacher (различаются
    только baseTitle и источник данных).
  - `refreshProtoModalBadges` self-ветка: в `badgeStat` проставлены
    `total/correct/last_attempt_at` из RPC-мапа (вместо прежних `0/0/null`); добавлен
    вызов `setModalDateBadge(cardEl.querySelector('.proto-modal-date-badge'),
    badgeStat, { baseTitle: 'Последнее решение по группе' })`. `setModalStatsBadge`
    сам подтягивает all-time/last-attempt строки тултипа из обновлённого `badgeStat`
    (отдельной FE-логики не потребовалось). Guard `seq`/`PROTO_MODAL_OPEN` сохранён.

Build:
- `node tools/bump_build.mjs` → build `2026-06-04-3`; все `?v=` синхронизированы,
  включая import `homework.js` в `picker.js`. Широкий список `M` в `git status` —
  ожидаемый эффект bump (проверено python-сканом: в нецелевых файлах изменены только
  `?v=` и `<meta name="app-build">`, контентных правок нет).

## 3. Governance (§9) — все зелёные

```
check_runtime_rpc_registry → runtime-rpc registry ok
                             rows=34 standalone_sql=34 snapshot_only=0 missing_in_repo=0 (exceptions=6)
check_runtime_catalog_reads → runtime catalog read checks ok (task_js_files=43, critical_files=7)
check_no_eval               → no eval/new Function ok
check_trainer_css_layers    → trainer css layers v2 ok
node --check tasks/picker.js           → OK
node --check app/providers/homework.js → OK
```

Реестр согласован: `rows=34`, новых строк нет (DoD #5).

## 4. Нерегрессия charnet (§9) — зелёные

```
npx playwright test e2e/teacher/picker-stats-charnet.spec.js
                    e2e/student/picker-stats-charnet.spec.js
→ 4 passed (15.7s)
```

Оба режима зелёные. Голдены forecast-note, что в прошлой волне (WMB4) фиксировались
как устаревшие, оператор уже обновил коммитом `dc9deae1 test(score): refresh charnet
goldens for new forecast note text` — дрейф закрыт. Модальный бейдж в charnet-снимок
не входит (спеки снимают home-stats DOM, модалку не открывают) → правка WMB5
поверхность снимка не задевает по построению. Teacher-путь не изменён (DoD #4).

## 5. Неприкосновенность 6 защищённых SQL (§3 / §10)

`git diff` по каждому → **UNTOUCHED**:
`student_proto_state_v1.sql`, `student_topic_state_v1.sql`,
`student_analytics_screen_v1.sql`, `teacher_picking_screen_v2.sql`,
`question_stats_for_teacher_v2.sql`, `proto_last3_for_teacher_v1.sql`.

Scope-lock соблюдён: контентно изменены только файлы §4
(`proto_last3_for_self_v1.sql`, `homework.js`, `picker.js`, `runtime_rpc_registry.md`)
+ новый `_wmb5_deploy.sql`; остальное — bump_build.

## 6. Что выполнимо только после operator-деплоя RPC (gated, §6)

Требуют развёрнутого 6-колоночного `proto_last3_for_self_v1` в live Supabase
(деплой — за оператором, исполнитель в Supabase не пишет):

- **DoD #3 — live-скриншот self.** date-бейдж «Последнее решение» (дата + цвет) на
  решённой группе + тултип stats-бейджа со строками «за всё время: …» / «последняя
  попытка: …»; по нерешённой группе date-бейдж скрыт. Снимается:
  `python3 -m http.server 8000` → логин ученик → модалка подтемы с решёнными
  прототипами → скрин. До деплоя date-бейдж скрыт (live RPC = 3 колонки, graceful).
- **SQL-тест (§9, 6 колонок).** Под authenticated (ученик с попытками):
  `select * from proto_last3_for_self_v1(array['<unic c попытками>']);` → ненулевой
  `total`, свежий `last_attempt_at`; под anon → отказ/пусто.

PII / scope (§6 плана): скан по-прежнему строго `where ae.student_id = auth.uid()`,
`revoke anon` / `grant authenticated`. Новые поля — те же агрегаты по СВОИМ попыткам.
Доступа к чужим данным нет (нет параметра student_id; anon: `auth.uid()`=NULL → пусто).

## 7. Статус публикации (DoD #7)

**НЕ закоммичено, НЕ запушено.** Вся работа — в рабочем дереве (uncommitted).
Новые untracked: `docs/supabase/_wmb5_deploy.sql` (+ этот отчёт). Ждёт ревью
оператора и его явной команды на применение SQL / коммит / пуш.
