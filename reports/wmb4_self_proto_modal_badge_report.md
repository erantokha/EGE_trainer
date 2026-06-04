# WMB4 — отчёт исполнителя: бейдж прототипа в модалке для самого ученика

Дата: 2026-06-04
Трек: WMB (модальный proto-бейдж), волна WMB4
Зона: RED-ZONE (новый RPC + RLS/grant + ролевая развилка источника данных)
План: `WMB4_self_proto_modal_badge_PLAN.md`
Build id: **`2026-06-04-2`** (`version.json`)

---

## 1. Итог

Реализована вся кодовая часть WMB4 (§5.1–§5.7). Self-ученик на `home_student.html`
теперь получает в модалке подбора прототипов (`#protoPickerModal`) бейдж точности
«последние 3» (X/3) — паритет с тем, что видит учитель. Teacher-путь не изменён по
поведению. Все governance-скрипты зелёные, scope-lock соблюдён, 6 защищённых
SQL-файлов не тронуты.

**Требует куратора (gated, §6 плана):** деплой SQL (`_wmb4_deploy.sql`) первым,
затем FE push → Pages. До деплоя RPC self-бейдж деградирует gracefully («—», без
падения). Live-скриншоты self (X/3) и SQL self-scope тест выполнимы только после
деплоя RPC (см. §5 ниже) — это естественный handoff FE/SQL split-deploy.

---

## 2. Изменённые / новые файлы (по §4)

Backend / контракты:
- **NEW** `docs/supabase/proto_last3_for_self_v1.sql` — self-scoped зеркало
  teacher-RPC. Сигнатура `proto_last3_for_self_v1(p_unic_ids text[])` (без
  `p_student_id`), жёсткий `where ae.student_id = auth.uid()` вместо
  `teacher_students`-гейта. Окно идентично teacher-RPC (`partition by unic_id`,
  тот же ordering, join `catalog_question_dim`). `security definer` /
  `search_path=public` / `revoke from anon` / `grant to authenticated`.
- **NEW** `docs/supabase/_wmb4_deploy.sql` — самодостаточный idempotent
  create-or-replace + grant (паттерн `_wmb1_deploy.sql`). Откат:
  `drop function if exists public.proto_last3_for_self_v1(text[]);`.
- `docs/supabase/runtime_rpc_registry.md` — новая строка `proto_last3_for_self_v1`
  в домене Teacher Picking рядом с teacher-RPC + summary `33→34`
  (`Всего активных` и `standalone_sql`).

Frontend:
- `app/providers/homework.js` — новая `protoLast3ForSelfV1({ unic_ids, timeoutMs,
  chunkSize })` по образцу `protoLast3ForTeacherV1`, без `student_id` и без
  `p_student_id` в payload. Формат ответа идентичен: `{ ok, map, error }`,
  `map: unic_id -> { last3_total, last3_correct }`. Пустой ввод → `{ ok:true,
  map:new Map() }` без сетевого вызова. (numstat: +41 −3)
- `tasks/picker.js` (numstat: +125 −28):
  - импорт `protoLast3ForSelfV1`;
  - `_SELF_PROTO_LAST3_CACHE` (Map unic_id → {last3_total, last3_correct}, без sid) +
    загрузчик `loadProtoLast3ForSelf(unicIds, opts)` (кэширует и нули — как teacher);
  - `renderProtoModalCard`: гейт бейдж-группы `IS_TEACHER_HOME` → `CAN_PROTO_MODAL`.
    Для self присоединяется **только** stats-бейдж (`buildModalBadgeEl('proto-modal-badge')`
    в обёртке `modal-badge-group`); date-бейдж — teacher-only. Teacher-ветка сохранена
    дословно по содержимому;
  - `refreshProtoModalBadges`: снят ранний `if (!IS_TEACHER_HOME) return;` →
    `if (!CAN_PROTO_MODAL) return;`. Добавлена self-ветка `if (IS_STUDENT_PAGE)`:
    `loadProtoLast3ForSelf(unicIds)` → наполнение stats-бейджа X/3 (без student_id,
    без date-бейджа). Guard `seq !== _PROTO_MODAL_BADGE_SEQ || !PROTO_MODAL_OPEN`
    сохранён. Teacher-путь ниже — без изменений.

Build:
- `node tools/bump_build.mjs` → build `2026-06-04-2`. Все `?v=` синхронизированы,
  включая import `homework.js` в `picker.js` (`?v=2026-06-04-2`).

> Широкий список `M` в `git status` — ожидаемый эффект `bump_build` (синхронизация
> `?v=` и `<meta name="app-build">` по всему проекту, §4 «Build»). Проверено
> (python-скан diff): в нецелевых файлах изменены **только** version-теги и
> `app-build`-мета; контентных правок нет.

## 3. Governance (§9) — все зелёные

```
check_runtime_rpc_registry → runtime-rpc registry ok
                             rows=34 standalone_sql=34 snapshot_only=0 missing_in_repo=0 (exceptions=6)
check_runtime_catalog_reads → runtime catalog read checks ok (task_js_files=43, critical_files=7)
check_no_eval               → no eval/new Function ok
check_trainer_css_layers    → trainer css layers v2 ok (base !important=19, pages !important=41)
node --check tasks/picker.js          → OK
node --check app/providers/homework.js → OK
```

Реестр согласован: `rows=34` (DoD #5). RPC `protoLast3ForSelfV1` использует тот же
`rpcTry` + `_chunks(…,500)`-слой, что и teacher (`rpcTry` определён в homework.js:416,
`_chunks` — 564; 3-й arg `{timeoutMs}` rpcTry игнорирует — паритет с teacher-версией).

## 4. Неприкосновенность 6 защищённых SQL (§3 / §10)

`git diff` по каждому → **UNTOUCHED**:
`student_proto_state_v1.sql`, `student_topic_state_v1.sql`,
`student_analytics_screen_v1.sql`, `teacher_picking_screen_v2.sql`,
`question_stats_for_teacher_v2.sql`, `proto_last3_for_teacher_v1.sql`.

Scope-lock соблюдён: контентно изменены только файлы §4 (`homework.js`, `picker.js`,
`runtime_rpc_registry.md`) + 2 новых SQL; остальное — bump_build.

## 5. Что выполнимо только после curator-деплоя RPC (gated, §6)

Эти пункты DoD требуют развёрнутого `proto_last3_for_self_v1` в live Supabase
(деплой gated куратором, исполнитель в Supabase не пишет) и не могут быть закрыты из
FE-песочницы:

- **DoD #3 — live-скриншот self (X/3).** До деплоя RPC self-бейдж рисуется gracefully
  пустым («—», `rpcTry` → `RPC_NOT_AVAILABLE`), что НЕ является доказательством X/3.
  Полноценный скриншот «X/3 / Не решал» снимается после деплоя:
  `python3 -m http.server 8000` → логин ученик → подтема с попытками → скрин.
- **SQL self-scope тест (§9).** Под ролью authenticated (ученик A):
  `select * from proto_last3_for_self_v1(array['<unic ученика A>']);` → ненулевые
  счётчики; под anon → пусто (`revoke` + `auth.uid()`=NULL). Выполняется в SQL
  editor после применения `_wmb4_deploy.sql`.

PII-инвариант self-RPC (§6 плана) обеспечен по дизайну: нет параметра `student_id`,
жёсткий `where ae.student_id = auth.uid()`, `revoke from anon`. Утечка чужих данных
невозможна ни по сигнатуре, ни по данным, ни для anon.

## 6. Нерегрессия charnet (§9) — ВАЖНО для куратора

Прогон обоих charnet-спеков (`e2e/student/picker-stats-charnet.spec.js`,
`e2e/teacher/picker-stats-charnet.spec.js`): **каждый падает на ОДНОЙ И ТОЙ ЖЕ
единственной строке снимка** — и это **предсуществующий дрейф, не связанный с WMB4**:

```
- "note": "Округление: <N> перв. → <N> втор."          (golden, устаревший)
+ "note": "Прогноз по текущей точности: <N> перв. → <N> втор."   (текущий рендер)
```

Диагностика:
- Строка живёт в `tasks/picker_stats.js:267` и введена коммитом
  **`e4d2a703 feat(score): плавный вторичный балл через интерполяцию первичного`** —
  это явный **out-of-scope §3** WMB4 («НЕ трогаем интерполяцию вторичного балла,
  picker_stats.js, уже в проде»). Golden charnet под тот коммит не обновляли.
- Мой diff к `picker_stats.js` — **только** `?v=` bump (контент идентичен до/после),
  поэтому baseline (до WMB4) падал бы на этой же строке.
- **Модальный бейдж в charnet-снимок не входит** (спеки снимают home-stats DOM:
  `#accordion`/forecast/thermo, модалку не открывают) → правка WMB4 поверхность
  снимка не задевает по построению.

**Голдены НЕ обновлял** — это вне §4 и относится к треку интерполяции балла
(решение/обновление снимка — за куратором, отдельно от WMB4). Прочие ассерты обоих
спеков (sanity: thermo/forecast присутствие, режим student-like/teacher-combo) —
зелёные.

## 7. Follow-up (вне DoD, §11)

- **WMB4-f1:** date-бейдж «последнее решение» + all-time строка тултипа для self
  (нужен self-аналог `question_stats_for_teacher_v2` или поле `last_attempt_at` в
  self-RPC). Открывать только по запросу оператора.
- **Побочно (не WMB4):** charnet-голдены `picker-stats-student.txt` /
  `picker-stats-teacher-viewing-student.txt` устарели на forecast-note после
  коммита `e4d2a703` — требуют обновления в рамках score-интерполяционного трека.
