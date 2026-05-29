# WMB1 — Модальный бейдж прототипа = последние 3 попытки (per-prototype, X/3)

Дата: 2026-05-29
Ветка: `wmb1-modal-proto-last3`
Worktree: `/Users/anton/Projects/EGE_trainer/.claude/worktrees/agent-a4ab6d5bd96204564`
Build id: `2026-05-30-1`
Зона: RED-ZONE (новый RPC + teacher-home FE). Деплой SQL→FE — gated куратором.

## 1. Проблема

Бейдж карточки прототипа в модалке подбора (`#protoPickerModal`,
`refreshProtoModalBadges`, `tasks/picker.js`) показывал «X/4» вместо «X/3».

Корень: статистика бралась из `question_stats_for_teacher_v2` (last-3 окно
**partition by question_id**) и затем суммировалась по всем вариантам-вопросам
прототипа через `aggregateStatsForQuestionIds` → знаменатель раздувался до 3·N.
FE не может восстановить last-3 на уровне прототипа из по-вопросных агрегатов
(нет таймстемпов отдельных попыток) → нужен per-unic last-3 из SQL.

WL3.1 уже считает корректный last-3 по прототипу в `student_proto_state_v1`
(partition by `unic_id`), но эта функция не использовалась для модального бейджа,
и трогать её было нельзя (out-of-scope). Решение: новый узкий standalone-RPC с
той же семантикой окна.

## 2. Проверка `typ.id == unic_id` (stop-ask п.6)

Подтверждено по коду и контенту:

- `tasks/picker.js:3956` (`buildQuestionForPreview`): `proto_id: String(type?.id || '')`.
- `docs/supabase/teacher_picking_screen_v2.sql`: `requested_proto_id = p.scope_id`,
  `cb.unic_id = p.scope_id`, `cb.unic_id as proto_id` — то есть `proto_id` (= `type.id`)
  на бэке равен `unic_id`.
- Контент-манифест (`content/tasks/probability/4.1.json`): `type.id = "4.1.1"`
  (= unic), `prototype.id = "4.1.1.1.1"` (= question_id). Поле `prototype.unic` —
  булев флаг канонического варианта, НЕ unic_id.
- Карточка модалки: `row.dataset.typeId = type.id`; бейдж матчится по
  `.tp-item[data-type-id="<type.id>"]`.

Вывод: `type.id` (data-type-id карточки) = `unic_id` в `catalog_question_dim`.
`prototype.id` = `question_id`. STOP-ASK не сработал.

## 3. Сделано

### 3.1 NEW SQL RPC — `docs/supabase/proto_last3_for_teacher_v1.sql`

`proto_last3_for_teacher_v1(p_student_id uuid, p_unic_ids text[])
returns table(unic_id text, last3_total int, last3_correct int)`:

- Окно: `row_number() over (partition by q.unic_id order by
  coalesce(ae.occurred_at, ae.created_at) desc, ae.created_at desc, ae.id desc)`
  по `answer_events ae join catalog_question_dim q on q.question_id = ae.question_id`,
  фильтр `q.unic_id = any(p_unic_ids)`. `last3_total = count(*) filter (rn<=3)`,
  `last3_correct = count(*) filter (rn<=3 and ae.correct)`, group by `q.unic_id`.
- Семантика окна идентична `student_proto_state_v1.proto_last3` (partition by
  `unic_id`, тот же order-by с `ae.id desc` тай-брейком).
- Guard зеркалит `question_stats_for_teacher_v2`: `language sql stable`,
  `security definer`, `set search_path to 'public'`, teacher-доступ через CTE
  `allowed` (`exists(select 1 from teacher_students where teacher_id=auth.uid()
  and student_id=p_student_id)`), `where exists (select 1 from allowed)`,
  `revoke execute … from anon`, `grant execute … to authenticated`. begin/commit,
  idempotent `create or replace`.
- `student_proto_state_v1` НЕ менялась — переиспользована только семантика окна.

Примечание по guard: `question_stats_for_teacher_v2` (зеркалируемый эталон) —
`language sql` без явного `row_security=off` и без `raise … AUTH_REQUIRED`; доступ
режется через `where exists(select 1 from allowed)` (пустой результат для чужого
ученика / anon). Новый RPC следует именно этому образцу (а не plpgsql-варианту
`student_proto_state_v1` с `row_security=off` и явными raise), как требовал план
(«зеркалить `question_stats_for_teacher_v2`»).

### 3.2 FE provider — `app/providers/homework.js`

Добавлен `protoLast3ForTeacherV1({ studentId/student_id, unic_ids, timeoutMs,
chunkSize })` по образцу `questionStatsForTeacherV1`: тот же `rpcTry`-слой,
chunking по 500, формат ответа `{ ok, map, error }`, где `map: unic_id ->
{ last3_total, last3_correct }`. Кэша на уровне provider нет (кэш — на стороне
picker.js, см. ниже), т.к. у модалки нет topic-кэш-семантики.

### 3.3 FE модалка — `tasks/picker.js`

- Импорт `protoLast3ForTeacherV1` (строка 16).
- Новый кэш `_TEACHER_PROTO_LAST3_CACHE` (sid -> Map(unic_id -> {last3_total,
  last3_correct})) + загрузчик `loadProtoLast3ForModal(sid, unicIds, opts)` с
  кэшированием (включая нули для unic без попыток — чтобы не дёргать RPC повторно).
- `refreshProtoModalBadges`: теперь параллельно (`Promise.all`) тянет по-вопросную
  статистику (`loadTeacherStatsForModal`, как раньше) И per-unic last-3
  (`loadProtoLast3ForModal` по `unicIds = types.map(t=>t.id)`).
- Бейдж КАРТОЧКИ строится из `badgeStat`, где `last3_total/last3_correct` берутся
  из per-unic RPC (по `typ.id`), а `total/correct/last_attempt_at` — из по-вопросного
  агрегата (для all-time строки тултипа). `setModalStatsBadge` показывает «X/3»,
  если `last3_total>0`; при `last3_total=0` → пусто/«Не решал».
- **Date-бейдж оставлен как есть** — по-прежнему из по-вопросного агрегата
  (`aggStat.last_attempt_at`).
- Прочие потребители `aggregateStatsForQuestionIds` (added-tasks бейджи:
  picker.js:4133, 4197, 4264; helper `getTeacherModalCachedAggregate`) НЕ тронуты.

### 3.4 Bump build

`node tools/bump_build.mjs` → `version.json: 2026-05-30-1`. Импорт homework.js в
picker.js синхронизирован на `?v=2026-05-30-1`.

### 3.5 Deploy + registry

- NEW `docs/supabase/_wmb1_deploy.sql` — самодостаточный inline create-or-replace
  + grant нового RPC. Backup не нужен (функция новая). Откат:
  `drop function if exists public.proto_last3_for_teacher_v1(uuid, text[]);`
- `docs/supabase/runtime_rpc_registry.md`: новая строка в «Teacher Picking /
  Prioritization», summary 32→33 (total + standalone_sql).
- Спеки: ни один spec в `docs/navigation/` не описывает модальный бейдж или новый
  helper-RPC; правок спек не требуется (изменение не меняет screen-контракты
  `teacher_picking_screen_v2` / `student_*_state_v1`). Registry — синхронизирован.

## 4. Проверки

- `node --check tasks/picker.js` — OK.
- `node --check app/providers/homework.js` — OK.
- `node tools/check_runtime_rpc_registry.mjs` — OK (`rows=33 standalone_sql=33`).
- `node tools/check_runtime_catalog_reads.mjs` — OK.
- `node tools/check_no_eval.mjs` — OK.
- `node tools/check_trainer_css_layers.mjs` — OK.
- charnet e2e:
  - `e2e/teacher/picker-stats-charnet.spec.js` — **2 passed** (setup-teacher + spec).
  - `e2e/student/picker-stats-charnet.spec.js` — **2 passed** (setup-student + spec).
  - Снимок home-статистики не изменился (модальный бейдж не входит в charnet),
    как и ожидалось.

## 5. Подтверждение неприкосновенности (git diff)

`git diff --name-only` по защищённым файлам — пусто (НЕ изменены):
`student_proto_state_v1.sql`, `student_topic_state_v1.sql`,
`teacher_picking_screen_v2.sql`, `student_analytics_screen_v1.sql`,
`question_stats_for_teacher_v2.sql`.

Содержательные FE-правки (вне bump-bump `?v=`): только `tasks/picker.js`
(import + cache + `loadProtoLast3ForModal` + `refreshProtoModalBadges`) и
`app/providers/homework.js` (`protoLast3ForTeacherV1`). Остальные ~75 изменённых
файлов — исключительно `?v=` bump от `tools/bump_build.mjs`.

## 6. Порядок деплоя для куратора (gated)

1. **SQL первым**: применить `docs/supabase/_wmb1_deploy.sql` в Supabase SQL editor
   (idempotent; повторный прогон безопасен). Это создаёт RPC до того, как FE начнёт
   его вызывать.
2. **FE вторым**: push ветки → деплой GitHub Pages (build `2026-05-30-1`).
   Порядок важен: новый FE дёргает `proto_last3_for_teacher_v1`; если RPC ещё нет,
   `rpcTry` вернёт ошибку → `loadProtoLast3ForModal` отдаст `{ok:false}` →
   `refreshProtoModalBadges` покажет «—»/«Статистика недоступна» (graceful, но
   бейдж пустой). Поэтому SQL должен опередить FE.

Откат: `drop function if exists public.proto_last3_for_teacher_v1(uuid, text[]);`
+ revert FE-коммита. Старый по-вопросный путь (`question_stats_for_teacher_v2`)
не трогался и продолжит работать для прочих потребителей.

## 7. Находки / заметки

- В `refreshProtoModalBadges` сохранён вызов `loadTeacherStatsForModal` — он нужен
  для date-бейджа и all-time строки тултипа (per-unic RPC не отдаёт `last_attempt_at`
  и all-time totals). Это два независимых запроса в `Promise.all`, лишней latency
  почти нет (оба греются из общих кэшей).
- Теоретический рассинхрон `aggStat.total>0` при `protoLast3.last3_total=0` не
  возникает: обе выборки считают одни и те же `answer_events` по тем же question_id
  (через `catalog_question_dim`); если попытки есть — оба окна непустые.
- STOP-ASK не потребовался: scope не расширялся, out-of-scope не задет,
  `typ.id == unic_id` подтверждён, governance зелёный, PII не затронуты (только
  агрегаты last3_total/last3_correct).
