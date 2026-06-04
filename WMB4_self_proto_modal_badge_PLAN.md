# WMB4 — Бейдж прототипа в модалке для самого ученика (паритет с учителем)

Дата плана: 2026-06-04
Автор: куратор
Трек: WMB (модальный proto-бейдж) — продолжение WMB1/WMB2/WMB3
Зона: **RED-ZONE** (новый RPC + RLS/grant + ролевая развилка источника данных)
Критический путь: не сдвигает W2 (параллельная реактивная продуктовая волна)

---

## 1. Цель

В модалке подбора прототипов (`#protoPickerModal`) сам ученик на `home_student.html`
должен видеть на каждой карточке прототипа бейдж точности «последние 3 попытки»
(X/3) — так же, как его сейчас видит учитель, открывший этого ученика. Сейчас у
ученика бейджа нет вообще.

## 2. Контекст и мотивация

Оператор зафиксировал расхождение: отображение прототипов у самого
(авторизованного) ученика отличается от того, что видит учитель, открывший
ученика — у ученика на прототипах нет бейджа. Recon (read-only, эта сессия)
установил две причины:

1. **Гейт рендеринга — неверный предикат.** В `tasks/picker.js`:
   - `renderProtoModalCard` строит бейдж-группу только `if (IS_TEACHER_HOME)`
     (строка ~2898) и присоединяет head только `if (IS_TEACHER_HOME)` (строка
     ~2917–2918). У ученика (`IS_STUDENT_PAGE`) карточка прототипа состоит лишь из
     `meta` + `stem`, элемента бейджа в DOM нет.
   - `refreshProtoModalBadges` коротко выходит `if (!IS_TEACHER_HOME) return;`
     (строка ~2730).
   - Аккордеонные бейджи (раздел % / подтема «последние 3 попытки») гейтятся
     через `isStudentLikeHome()` и показываются обеим ролям — асимметрия именно
     на proto-уровне (модалка).
2. **Источник данных — teacher-only.** Per-prototype last-3 берётся из
   `proto_last3_for_teacher_v1` (+ `question_stats_for_teacher_v2` для date/all-time),
   оба гейтятся `teacher_students`-проверкой и `revoke from anon`. Self-эквивалента
   нет. Канонический `student_analytics_screen_v1(self)` отдаёт точность только на
   уровне подтемы (`subtopic_last3_avg_pct`), не пер-прототипно.

Подтверждено по коду:
- Ученик ходит в ту же модалку, что и учитель: `CAN_PROTO_MODAL = IS_STUDENT_PAGE
  || IS_TEACHER_HOME` (picker.js:77); клик по названию подтемы →
  `openProtoPickerModal` (picker.js:2499, 2509). `#protoPickerModal` присутствует в
  `home_student.html`.
- Встроенная панель `homeProtoPanel`/`homeProtoList` в `picker.js` **не используется
  вообще** (0 ссылок) — неактивная разметка, не источник проблемы.
- `student_proto_state_v1.proto_last3` уже считает корректное окно last-3 по
  `unic_id`; teacher-RPC — его узкое standalone-зеркало (WMB1 §3.1,
  `docs/supabase/proto_last3_for_teacher_v1.sql`).
- `type.id` карточки (`data-type-id`) == `unic_id` (доказано WMB1 §2; tie-break и
  семантика окна там же).

## 3. Out of scope (НЕ делаем)

- НЕ трогаем SQL канонических контрактов: `student_proto_state_v1.sql`,
  `student_topic_state_v1.sql`, `student_analytics_screen_v1.sql`,
  `teacher_picking_screen_v2.sql`, `question_stats_for_teacher_v2.sql`,
  `proto_last3_for_teacher_v1.sql`.
- НЕ меняем поведение teacher-пути модалки (тот же RPC, тот же бейдж/тултип/date).
- НЕ добавляем для self date-бейдж «последнее решение» и all-time строку тултипа
  (у self нет дешёвого источника — это `question_stats_for_teacher_v2`,
  teacher-only). Это явный **follow-up**, не входит в DoD (см. §11).
- НЕ оживляем `homeProtoPanel` (подтверждённо мёртвая разметка).
- НЕ расширяем payload `student_analytics_screen_v1(self)` пер-прототипными
  счётчиками (это смена screen-контракта — отдельная, более тяжёлая инициатива).
- НЕ трогаем работу по интерполяции вторичного балла (`picker_stats.js`,
  уже в проде, отдельная задача).
- НЕ декомпозируем `picker.js` (это W2; здесь только аддитивная правка).

## 4. Затрагиваемые файлы (поимённо)

Backend / контракты:
- **NEW** `docs/supabase/proto_last3_for_self_v1.sql` — self-scoped зеркало
  teacher-RPC.
- **NEW** `docs/supabase/_wmb4_deploy.sql` — самодостаточный idempotent
  create-or-replace + grant (паттерн `_wmb1_deploy.sql`).
- `docs/supabase/runtime_rpc_registry.md` — новая строка в домене
  «Teacher Picking / Prioritization» (или соседнем self-разделе) + пересчёт
  summary (`rows=33` → `34`, `standalone_sql` +1).

Frontend:
- `app/providers/homework.js` — новая `protoLast3ForSelfV1({ unic_ids, timeoutMs,
  chunkSize })` по образцу `protoLast3ForTeacherV1` (623–660), но без `student_id`
  и без `p_student_id` в payload. Формат ответа идентичен: `{ ok, map, error }`,
  `map: unic_id -> { last3_total, last3_correct }`.
- `tasks/picker.js`:
  - импорт `protoLast3ForSelfV1` (строка ~16, рядом с `protoLast3ForTeacherV1`);
  - `renderProtoModalCard` (~2898, ~2917): гейт бейдж-группы `IS_TEACHER_HOME` →
    `CAN_PROTO_MODAL` (т.е. обе роли получают элемент бейджа). Для self
    присоединяется **только stats-бейдж** (date-бейдж не добавляется, см. §3);
  - новый self-кэш `_SELF_PROTO_LAST3_CACHE` (Map unic_id → {last3_total,
    last3_correct}, без sid-ключа) + загрузчик `loadProtoLast3ForSelf(unicIds,
    opts)` по образцу `loadProtoLast3ForModal`;
  - `refreshProtoModalBadges` (~2729): развилка источника по роли —
    `IS_TEACHER_HOME` → существующий teacher-путь (как сейчас, требует
    `TEACHER_VIEW_STUDENT_ID`); `IS_STUDENT_PAGE` → новый self-путь (без
    student_id), наполняет stats-бейдж X/3. Снять ранний `if (!IS_TEACHER_HOME)
    return;`.

Build:
- `node tools/bump_build.mjs` — синхронизация всех `?v=` (в т.ч. import
  `homework.js` в `picker.js`).

## 5. Пошаговый план

> **Task-tracking (обязательно для исполнителя):** в начале работы создай TaskList
> через `TaskCreate` с пунктами §5.1–§5.7 этого плана. По мере выполнения обновляй
> статус каждого пункта через `TaskUpdate`: `in_progress` при старте шага,
> `completed` при завершении. Это нужно, чтобы оператор наблюдал прогресс в
> реальном времени через task-panel, без чтения stdout.

- **§5.1 — SQL self-RPC.** Создать `docs/supabase/proto_last3_for_self_v1.sql`:
  зеркало teacher-RPC с двумя отличиями — (а) сигнатура `proto_last3_for_self_v1(
  p_unic_ids text[])` без `p_student_id`; (б) вместо CTE `allowed`/`teacher_students`
  — жёсткая привязка к себе через `where ae.student_id = auth.uid()`. Остальное
  идентично: `language sql stable security definer set search_path to 'public'`,
  то же окно `row_number() over (partition by q.unic_id order by
  coalesce(ae.occurred_at, ae.created_at) desc, ae.created_at desc, ae.id desc)`,
  join `catalog_question_dim`, `last3_total/last3_correct` filter `rn<=3`,
  `revoke execute … from anon`, `grant execute … to authenticated`,
  `begin/commit`. Эталонный шаблон:

  ```sql
  begin;
  create or replace function public.proto_last3_for_self_v1(
    p_unic_ids text[]
  )
  returns table(unic_id text, last3_total integer, last3_correct integer)
  language sql stable security definer set search_path to 'public'
  as $function$
    with ranked as (
      select
        q.unic_id, ae.correct,
        row_number() over (
          partition by q.unic_id
          order by coalesce(ae.occurred_at, ae.created_at) desc,
                   ae.created_at desc, ae.id desc
        )::int as rn
      from public.answer_events ae
      join public.catalog_question_dim q on q.question_id = ae.question_id
      where ae.student_id = auth.uid()
        and q.unic_id = any(p_unic_ids)
    )
    select r.unic_id,
           count(*) filter (where r.rn <= 3)::int as last3_total,
           count(*) filter (where r.rn <= 3 and r.correct)::int as last3_correct
    from ranked r group by r.unic_id order by r.unic_id;
  $function$;
  revoke execute on function public.proto_last3_for_self_v1(text[]) from anon;
  grant  execute on function public.proto_last3_for_self_v1(text[]) to authenticated;
  commit;
  ```
  Плюс `docs/supabase/_wmb4_deploy.sql` (та же inline-команда для применения в
  SQL editor; функция новая → backup не нужен; откат —
  `drop function if exists public.proto_last3_for_self_v1(text[]);`).

- **§5.2 — Provider.** Добавить `protoLast3ForSelfV1` в `app/providers/homework.js`
  по образцу `protoLast3ForTeacherV1`: тот же `rpcTry`-слой и chunking по 500,
  `rpcTry(['proto_last3_for_self_v1','protoLast3ForSelfV1'], { p_unic_ids: part },
  …)`, без `student_id`. Пустой `unic_ids` → `{ ok:true, map:new Map() }`.

- **§5.3 — picker.js: импорт + self-кэш + загрузчик.** Импортировать
  `protoLast3ForSelfV1`. Завести `_SELF_PROTO_LAST3_CACHE` и
  `loadProtoLast3ForSelf(unicIds, opts)` (кэшировать в т.ч. нули, чтобы не
  дёргать RPC повторно — как в teacher-загрузчике).

- **§5.4 — picker.js: рендер бейдж-элемента для обеих ролей.** В
  `renderProtoModalCard` заменить гейт `IS_TEACHER_HOME` на `CAN_PROTO_MODAL` для
  создания/присоединения бейджа. Для self присоединять только stats-бейдж
  (date-бейдж — teacher-only). Сохранить teacher-ветку без изменений по содержимому.

- **§5.5 — picker.js: развилка данных в `refreshProtoModalBadges`.** Снять ранний
  `if (!IS_TEACHER_HOME) return;`. Ввести ветвление: teacher → текущий путь
  (`loadTeacherStatsForModal` + `loadProtoLast3ForModal`, требует
  `TEACHER_VIEW_STUDENT_ID`); student → `loadProtoLast3ForSelf(unicIds)` →
  наполнить stats-бейдж X/3 (`last3_total>0` → «X/3», иначе «Не решал»/пусто).
  Сохранить guard `seq !== _PROTO_MODAL_BADGE_SEQ || !PROTO_MODAL_OPEN`.

- **§5.6 — Bump build.** `node tools/bump_build.mjs`; зафиксировать новый build id.

- **§5.7 — Registry + governance.** Обновить
  `docs/supabase/runtime_rpc_registry.md` (новая строка + summary-счётчики).
  Прогнать все governance-скрипты (§9).

## 6. Данные / контракты / миграции

- **Новый RPC**, аддитивный. Backup БД не нужен (только `create or replace`
  новой функции). Откат — `drop function`.
- **Контракты:** добавляется один standalone-RPC в реестр. Канонические
  screen-контракты (`student_analytics_screen_v1`, `teacher_picking_screen_v2`)
  и backing read-models (`student_proto_state_v1`, `student_topic_state_v1`) **не
  меняются**. Спеки в `docs/navigation/*` модальный бейдж не описывают — правок
  спек не требуется (как и в WMB1 §3.5).
- **Порядок деплоя (gated куратором, как WMB1 §6):** SQL первым (применить
  `_wmb4_deploy.sql`), FE вторым (push → Pages). Если FE опередит RPC —
  `rpcTry` вернёт ошибку → self-бейдж покажет пусто/«—» (graceful, без падения).
- **PII:** RPC отдаёт только агрегаты `last3_total/last3_correct`, строго по
  `auth.uid()`. Доступа к чужим данным нет ни по дизайну (нет параметра
  student_id), ни по данным (`where ae.student_id = auth.uid()`), ни для anon
  (`revoke` + `auth.uid()` = NULL → пустой результат).

## 7. Риски и stop-ask точки

**RED-ZONE** (новый RPC + RLS/grant + ролевая развилка доступа к данным). Scope
lock:
- **Можно:** только файлы из §4.
- **Запрещено без explicit approval оператора:** любой из 6 защищённых SQL-файлов
  (§3), любая правка teacher-ветки модалки по содержимому, расширение payload
  любого screen-RPC, правка `home_*.html`/auth-flow/`tools/`/workflow.

Риски:
1. **Утечка чужих данных** через self-RPC. Митигировано: нет параметра
   student_id, жёсткий `where ae.student_id = auth.uid()`, `revoke from anon`.
   Проверяется в §9 (self-scope test).
2. **`type.id != unic_id`** на student-манифесте сломал бы матч бейджа.
   Доказано в WMB1 §2 для общего пути; если на self-пути обнаружится иной
   ключ карточки — **stop-ask** (триггер §6.3 п.10).
3. **Регрессия teacher-пути** при правке общего `renderProtoModalCard` /
   `refreshProtoModalBadges`. Митигировано: teacher-ветка сохраняется
   дословно, развилка только добавляет self-ветку. Проверяется charnet
   teacher + ручным teacher-смоком.
4. **Кеш-busting.** Без `bump_build` фикс не доедет до браузеров. §5.6
   обязателен.

### Autonomy policy

> **Режим работы: автономный.** Не останавливайся за подтверждением на каждом
> шаге, не спрашивай «продолжать ли», не проси промежуточного ревью. Доведи до
> DoD и верни отчёт (`reports/wmb4_*_report.md` + completion summary). Куратор
> принимает работу целиком по факту.
>
> **Останавливайся (stop-ask) только в экстренных случаях:**
> 1. Попытка изменить файл вне §4.
> 2. Попытка зайти в зону §3 Out of scope или red-zone §7 без approval.
> 3. План противоречит реальности кода (функция/строка/RPC не та; сигнатура
>    разошлась с реестром).
> 4. DoD недостижим без выхода за scope.
> 5. Governance-скрипт упал, причина не очевидна из diff волны.
> 6. Обнаружена уязвимость/утечка креденшлов.
> 7. Задача распалась на 2+ независимых.
> 8. Один тест/сценарий упал 2+ раза подряд после починки, причина неясна.
> 9. Нужно архитектурное решение, влияющее на модули вне §4 (новый общий
>    хелпер, смена формата хранения).
> 10. **Проектные триггеры WMB4:** (а) ключ карточки прототипа на self-пути
>     оказался НЕ равен `unic_id` (расходится с WMB1 §2); (б) self-RPC в тесте
>     вернул данные по `unic_id`, которых у тестового ученика не было попыток
>     (подозрение на утечку/ошибку scope); (в) для нерегрессии teacher-пути
>     потребовалось тронуть любой из 6 защищённых SQL-файлов.
>
> **Не экстренное (работай сам):** мелкие развилки внутри scope, имена
> переменных/локальных селекторов, порядок шагов §5 без ущерба DoD, повторный
> прогон governance/smoke, желание «показать промежуточный результат».
>
> **Формат stop-ask:** короткое сообщение — какой пункт сработал, что
> обнаружено, варианты, рекомендация. После — жди решения.

## 8. Критерии приёмки (DoD)

1. `docs/supabase/proto_last3_for_self_v1.sql` существует, self-scoped через
   `auth.uid()`, `revoke from anon` / `grant to authenticated`, семантика окна
   идентична teacher-RPC; `_wmb4_deploy.sql` применим idempotent.
2. `protoLast3ForSelfV1` в `homework.js` возвращает `{ ok, map }`,
   `map: unic_id -> { last3_total, last3_correct }`; пустой ввод → пустой map без
   сетевого вызова.
3. На `home_student.html` открытие модалки подтемы, по которой у ученика есть
   попытки, показывает на карточках прототипов бейдж «X/3»; по прототипу без
   попыток — «Не решал»/пусто. (Скриншот — обязателен, red-zone.)
4. Teacher-путь модалки не изменился по поведению (charnet teacher зелёный +
   ручной teacher-смок: бейдж X/3 и date-бейдж как раньше).
5. Все governance-скрипты зелёные; реестр согласован (`rows=34`).
6. `bump_build` выполнен, новый build id зафиксирован в отчёте.

## 9. План проверки (конкретные команды)

- `node --check tasks/picker.js` и `node --check app/providers/homework.js`.
- `node tools/check_runtime_rpc_registry.mjs` (ожидаемо `rows=34
  standalone_sql=34`).
- `node tools/check_runtime_catalog_reads.mjs`, `node tools/check_no_eval.mjs`,
  `node tools/check_trainer_css_layers.mjs`.
- **SQL self-scope тест** (в SQL editor / через psql под ролью authenticated):
  - под учеником A: `select * from proto_last3_for_self_v1(array['<unic ученика A>']);`
    → ненулевые счётчики по решённым прототипам;
  - под anon: вызов → отказ/пусто (revoke + `auth.uid()` NULL);
  - подтвердить отсутствие параметра student_id (прочесть невозможно по чужому).
- **Ручной смок (обязателен, red-zone):** `python3 -m http.server 8000` →
  логин как ученик → открыть подтему с попытками → скриншот карточек с X/3;
  логин как учитель → выбрать ученика → открыть ту же подтему → скриншот
  (teacher-бейдж + date не изменились).
- **e2e charnet** (нерегрессия): `e2e/student/picker-stats-charnet.spec.js` и
  `e2e/teacher/picker-stats-charnet.spec.js` — оба зелёные (модальный бейдж не
  входит в charnet-снимок, поэтому снимок не должен поменяться).

## 10. Отчётный артефакт

`reports/wmb4_self_proto_modal_badge_report.md` с фактами: diff по §4,
вывод governance, результат self-scope SQL-теста, build id, скриншоты
self + teacher (или ссылки на smoke-артефакты), подтверждение
неприкосновенности 6 защищённых SQL-файлов (`git diff --name-only`).

## 11. Follow-up (вне DoD)

- **WMB4-f1 (опционально):** date-бейдж «последнее решение» + all-time строка
  тултипа для self. Требует либо расширить `proto_last3_for_self_v1` полем
  `last_attempt_at` (max occurred_at по unic), либо отдельный self-аналог
  `question_stats_for_teacher_v2`. Открывать только по запросу оператора —
  ученику, смотрящему свои прототипы, дата менее критична, чем учителю.
