# WMB5 — Date-бейдж давности + all-time тултип для self proto-modal (полный паритет модалки)

Дата плана: 2026-06-04
Автор: куратор
Трек: WMB (модальный proto-бейдж) — реализует follow-up **WMB4-f1**
Зона: **RED-ZONE** (изменение существующего RPC: drop+create со сменой возвращаемых колонок + RLS/grant + FE)
Критический путь: не сдвигает W2 (параллельная продуктовая волна)

> ⛔️ **ПУБЛИКАЦИЯ ЗАПРЕЩЕНА БЕЗ ПОДТВЕРЖДЕНИЯ ОПЕРАТОРА.** Исполнитель НЕ
> делает `git push` и НЕ делает `git commit` — ни при каких обстоятельствах,
> даже когда всё зелёное. Работа доводится до DoD-границы и остаётся в рабочем
> дереве (uncommitted), чтобы оператор сам просмотрел diff. SQL в Supabase
> применяет ОПЕРАТОР. Коммит и пуш — только после явной команды оператора
> «коммить/пушь». (В прошлой волне публикация прошла сразу — здесь так НЕ делаем.)

---

## 1. Цель

Сделать модалку подбора прототипов (`#protoPickerModal`) у самого ученика
(`home_student.html`) полностью совпадающей с тем, что видит учитель,
открывший ученика: добавить **бейдж давности** «Последнее решение»
(`proto-modal-date-badge`) и дотянуть **тултип** stats-бейджа (строки «за всё
время: …» и «последняя попытка: …»). Само число точности X/3 уже отображается
(WMB4) — не трогаем.

## 2. Контекст и мотивация

WMB4 закрыл точность (X/3) для self, но сознательно вынес date-бейдж и all-time
в Out of scope (§3) и follow-up WMB4-f1 — у self-пути не было источника для
давности и all-time. Оператор подтвердил визуально: точность видна, давности на
прототипах у ученика нет.

Recon различий self vs «учитель открыл ученика» (read-only, эта сессия) показал,
что в **модалке** не хватает ровно двух вещей у self:
1. **A1. Date-бейдж** `proto-modal-date-badge` («Последнее решение по группе») —
   у учителя рисуется (`renderProtoModalCard` teacher-ветка) и наполняется
   (`refreshProtoModalBadges`, `picker.js:2885` `setModalDateBadge(... aggStat ...)`);
   у self не создаётся (self-ветка `renderProtoModalCard` строит только
   stats-бейдж; self-ветка `refreshProtoModalBadges` передаёт `last_attempt_at:
   null` и не зовёт `setModalDateBadge`).
2. **A2. Тултип stats-бейджа** у self без строк «за всё время: …» и «последняя
   попытка: …» — `setModalStatsBadge` (`picker.js:971,974`) добавляет их только
   при `total>0` / непустом `last_attempt_at`, а self передаёт `total:0,
   correct:0, last_attempt_at:null`.

Источник у учителя: `question_stats_for_teacher_v2` (per-question all-time + дата,
агрегируется `aggregateStatsForQuestionIds`). Для self чище **расширить уже
существующий** `proto_last3_for_self_v1` (создан в WMB4, потребитель только self)
тремя per-unic полями: `total`, `correct`, `last_attempt_at` — всё считается в том
же скане `answer_events ⋈ catalog_question_dim`, без второго запроса.

Прочие различия self vs teacher (вне scope этой волны, см. §3): подсветка
заголовков аккордеона по рекомендациям (B), панель `#htRecList` (C), виджет
прогноза в шапке термометр-vs-панель (D), детальность тултипов бейджей
раздела/подтемы (E). Это teacher-coaching / осознанная раскладка / косметика —
отдельные решения, в этой волне не трогаем.

Подтверждено по коду:
- date-бейдж создаётся **динамически** (`buildModalBadgeGroup` → `buildModalDateBadgeEl`,
  `picker.js:919-934`); в HTML его нет (grep `proto-modal-date-badge` в
  `home_*.html` = 0) → правок HTML не требуется.
- `setModalDateBadge` (`picker.js:979`) рисует бейдж при наличии `last_attempt_at`
  и `(total>0 || last3_total>0)`; всё это будет в расширенном RPC.
- `setModalStatsBadge` уже умеет показывать all-time строку при `total>0`
  (`picker.js:971`) — отдельной FE-логики не нужно, только данные.

## 3. Out of scope (НЕ делаем)

- ⛔️ **НЕ `git commit` и НЕ `git push`** (см. баннер вверху). Публикация — только
  после явного подтверждения оператора.
- **B (подсветка рекомендаций в заголовках)** и **C (панель `#htRecList`)** — НЕ
  реализуем для self. Это teacher-coaching на учительских данных
  (`teacher_picking_screen_v2`), которых нет в self-контракте; отдельная крупная
  инициатива (новые self-данные + новый UI-блок).
- **D (термометр vs панель прогноза в шапке)** — осознанная per-page раскладка,
  оба показывают один прогноз; не дефект.
- **E (детальность тултипов section/topic-бейджей)** — косметика, не в scope.
- НЕ трогаем teacher-путь модалки (его данные/бейджи/тултип не меняем).
- НЕ трогаем 6 защищённых SQL: `student_proto_state_v1`, `student_topic_state_v1`,
  `student_analytics_screen_v1`, `teacher_picking_screen_v2`,
  `question_stats_for_teacher_v2`, `proto_last3_for_teacher_v1`.
- НЕ меняем точность X/3 (WMB4) и аккордеонные бейджи раздела/подтемы.
- НЕ декомпозируем `picker.js` (это W2).

## 4. Затрагиваемые файлы (поимённо)

Backend / контракты:
- `docs/supabase/proto_last3_for_self_v1.sql` — **MODIFY**: добавить в `returns
  table` три колонки `total integer, correct integer, last_attempt_at timestamptz`;
  считать их в том же CTE. Из-за смены набора колонок `create or replace`
  невозможен → **`drop function if exists` + `create`** (в одной транзакции).
- `docs/supabase/_wmb5_deploy.sql` — **NEW**: самодостаточный idempotent
  `begin; drop…; create…; revoke/grant; commit;`.
- `docs/supabase/runtime_rpc_registry.md` — **обновить описание** существующей
  строки `proto_last3_for_self_v1` (упомянуть all-time + last_attempt_at).
  **Счётчик rows НЕ меняется (остаётся 34)** — функция та же, не новая.

Frontend:
- `app/providers/homework.js` — `protoLast3ForSelfV1`: расширить значения `map`
  полями `total`, `correct`, `last_attempt_at` (по образцу teacher-маппинга
  per-question, но per-unic из одной строки ответа).
- `tasks/picker.js`:
  - `renderProtoModalCard` self-ветка (`~2998`): вместо ручного одиночного
    stats-бейджа использовать `buildModalBadgeGroup('proto-modal-badge',
    'proto-modal-date-badge')` (как teacher) с self-заголовками; присоединить
    обе плашки. (Структура карточки становится идентичной teacher, отличаются
    только baseTitle-тексты и источник данных.)
  - `refreshProtoModalBadges` self-ветка (`~2784`): в `badgeStat` проставить
    `total/correct/last_attempt_at` из RPC и вызвать `setModalDateBadge(
    cardEl.querySelector('.proto-modal-date-badge'), badgeStat, { baseTitle:
    'Последнее решение по группе' })` в дополнение к `setModalStatsBadge`.

Build:
- `node tools/bump_build.mjs` — синхронизация `?v=`.

## 5. Пошаговый план

> **Task-tracking (обязательно для исполнителя):** в начале работы создай TaskList
> через `TaskCreate` с пунктами §5.1–§5.6. Обновляй статус через `TaskUpdate`
> (`in_progress`/`completed`) по ходу — чтобы оператор видел прогресс в task-panel.

- **§5.1 — SQL: расширить self-RPC.** В `proto_last3_for_self_v1.sql` добавить в
  CTE `ranked` поле `attempt_at = coalesce(ae.occurred_at, ae.created_at)`, а в
  финальный select — `count(*)::int as total`, `count(*) filter (where r.correct)::int
  as correct`, `max(r.attempt_at) as last_attempt_at`. Сменить заголовок на
  `drop function if exists … + create` (return-колонки изменились). Эталон:

  ```sql
  begin;
  drop function if exists public.proto_last3_for_self_v1(text[]);
  create function public.proto_last3_for_self_v1(p_unic_ids text[])
  returns table(
    unic_id text,
    last3_total integer,
    last3_correct integer,
    total integer,
    correct integer,
    last_attempt_at timestamptz
  )
  language sql stable security definer set search_path to 'public'
  as $function$
    with ranked as (
      select
        q.unic_id, ae.correct,
        coalesce(ae.occurred_at, ae.created_at) as attempt_at,
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
    select
      r.unic_id,
      count(*) filter (where r.rn <= 3)::int                  as last3_total,
      count(*) filter (where r.rn <= 3 and r.correct)::int    as last3_correct,
      count(*)::int                                           as total,
      count(*) filter (where r.correct)::int                  as correct,
      max(r.attempt_at)                                       as last_attempt_at
    from ranked r
    group by r.unic_id
    order by r.unic_id;
  $function$;
  revoke execute on function public.proto_last3_for_self_v1(text[]) from anon;
  grant  execute on function public.proto_last3_for_self_v1(text[]) to authenticated;
  commit;
  ```
  Плюс `_wmb5_deploy.sql` (та же транзакция для вставки в SQL editor; откат —
  вернуть 3-колоночную WMB4-версию из git-истории).

- **§5.2 — Provider.** В `protoLast3ForSelfV1` (`homework.js`) расширить
  `map.set(uid, {...})`: добавить `total: Number(row?.total||0)||0`,
  `correct: Number(row?.correct||0)||0`,
  `last_attempt_at: row?.last_attempt_at || null`.

- **§5.3 — picker.js: рендер date-бейджа для self.** В `renderProtoModalCard`
  self-ветке заменить ручной stats-бейдж на `buildModalBadgeGroup` (date+stats) с
  self-заголовками (`'Моя статистика по группе'` / `'Последнее решение по группе'`);
  присоединить группу к `head`.

- **§5.4 — picker.js: наполнение в self-ветке.** В `refreshProtoModalBadges`
  self-ветке проставить в `badgeStat` `total/correct/last_attempt_at` из RPC-мапа
  и добавить вызов `setModalDateBadge('.proto-modal-date-badge', badgeStat, {
  baseTitle: 'Последнее решение по группе' })`. `setModalStatsBadge` оставить —
  он сам подтянет all-time/last-attempt строки из обновлённого `badgeStat`.

- **§5.5 — Bump build.** `node tools/bump_build.mjs`; зафиксировать build id в отчёте.

- **§5.6 — Registry + governance.** Обновить описание строки
  `proto_last3_for_self_v1` в реестре (rows не меняется). Прогнать governance (§9).

## 6. Данные / контракты / миграции

- **Изменение существующего RPC** (не новый). Потребитель один — self FE.
- **DROP+CREATE в одной транзакции** обязателен: `create or replace` не меняет
  набор возвращаемых колонок Postgres'а. Транзакция атомарна → окна «функции нет»
  не возникает.
- **Обратная совместимость с задеплоенным FE:** текущий задеплоенный
  `protoLast3ForSelfV1` читает `row.unic_id/last3_total/last3_correct` по имени —
  лишние колонки игнорируются, ничего не падает (на время до пуша нового FE).
- **rows в реестре не меняется (34)** — функция та же.
- **PII / scope:** скан по-прежнему строго `where ae.student_id = auth.uid()`,
  `revoke anon`/`grant authenticated`. Новые поля — те же агрегаты по своим
  попыткам. Доступа к чужим данным нет.
- **Порядок (gated оператором):** SQL первым (`_wmb5_deploy.sql`), затем — ТОЛЬКО
  после явной команды оператора — коммит + пуш FE.

## 7. Риски и stop-ask точки

**RED-ZONE** (изменение RPC со сменой сигнатуры + RLS/grant). Scope lock:
- **Можно:** только файлы §4.
- **Запрещено без approval:** любой из 6 защищённых SQL (§3), teacher-ветка
  модалки, любой screen-контракт, `home_*.html`/auth/`tools/`/workflow,
  **а также `git commit` и `git push`**.

Риски:
1. **Смена return-колонок без DROP** → ошибка `cannot change return type`.
   Митигирован: §5.1 предписывает `drop … + create`.
2. **Утечка чужих данных** — нет: жёсткий `auth.uid()`, новые поля те же агрегаты.
3. **Регрессия teacher-пути** — не трогаем; self-ветка изолирована. Проверяется
   teacher-смоком.
4. **Кеш-busting** — без `bump_build` фикс не доедет. §5.5 обязателен.

### Autonomy policy

> **Режим работы: автономный** в пределах §4. Доведи до DoD-границы и верни отчёт
> (`reports/wmb5_*_report.md` + summary). **НЕ коммить и НЕ пушь** — оставь в
> рабочем дереве для ревью оператором.
>
> **Останавливайся (stop-ask) только в экстренных случаях:**
> 1. Попытка изменить файл вне §4.
> 2. Попытка зайти в Out of scope §3 / red-zone §7 без approval.
> 3. План противоречит реальности кода (сигнатура/строка/RPC не та).
> 4. DoD недостижим без выхода за scope.
> 5. Governance упал, причина не из diff волны.
> 6. Уязвимость/утечка креденшлов.
> 7. Задача распалась на 2+ независимых.
> 8. Тест/сценарий упал 2+ раза подряд, причина неясна.
> 9. Архитектурное решение, влияющее на модули вне §4.
> 10. **Проектные триггеры WMB5:** (а) `drop function` затрагивает не только
>     `proto_last3_for_self_v1` (напр. конфликт перегрузки сигнатур) — остановись;
>     (б) self-RPC в тесте вернул `last_attempt_at`/`total` по чужим попыткам —
>     остановись; (в) **любая необходимость/искушение сделать `git push` или
>     `git commit`** — НЕ делай, это всегда требует явного подтверждения оператора.
>
> **Не экстренное:** мелкие развилки реализации, имена локальных переменных,
> порядок шагов §5, повторный прогон governance/smoke.
>
> **Формат stop-ask:** что сработало, что обнаружено, варианты, рекомендация.

## 8. Критерии приёмки (DoD)

1. `proto_last3_for_self_v1` (обновлённый SQL в репо) возвращает 6 колонок,
   self-scoped, `drop+create`, `revoke anon`/`grant authenticated`; `_wmb5_deploy.sql`
   применим атомарно.
2. `protoLast3ForSelfV1` отдаёт `map: unic_id -> { last3_total, last3_correct,
   total, correct, last_attempt_at }`.
3. На `home_student.html` в модалке прототипа по решённой группе виден **бейдж
   давности** «Последнее решение» (дата + цвет по свежести), а тултип stats-бейджа
   содержит строки «за всё время: …» и «последняя попытка: …». По нерешённой
   группе date-бейдж скрыт (как у учителя). **Скриншот обязателен (red-zone).**
4. Teacher-путь модалки не изменился (ручной teacher-смок + charnet teacher
   зелёный).
5. Governance зелёные; реестр согласован (rows=34, без новых строк).
6. `bump_build` выполнен, build id в отчёте.
7. **Работа НЕ закоммичена и НЕ запушена** — оставлена в рабочем дереве; отчёт это
   фиксирует.

## 9. План проверки (конкретные команды)

- `node --check tasks/picker.js` и `node --check app/providers/homework.js`.
- `node tools/check_runtime_rpc_registry.mjs` (ожидаемо `rows=34`),
  `check_runtime_catalog_reads.mjs`, `check_no_eval.mjs`, `check_trainer_css_layers.mjs`.
- **SQL-тест** (после применения оператором, под authenticated): `select * from
  proto_last3_for_self_v1(array['<unic c попытками>']);` → ненулевые `total`,
  свежий `last_attempt_at`; под anon — отказ/пусто.
- **Ручной смок (обязателен, red-zone):** `python3 -m http.server 8000` → войти
  учеником → модалка подтемы с решёнными прототипами → скриншот: бейдж давности +
  тултип all-time. Teacher-смок: та же группа у учителя — без изменений.
- **e2e charnet** (нерегрессия): `e2e/student|teacher/picker-stats-charnet` —
  зелёные (модалка не входит в charnet-снимок).

## 10. Отчётный артефакт

`reports/wmb5_self_proto_modal_date_badge_report.md`: diff по §4, вывод governance,
результат SQL-теста (6 колонок), build id, скриншоты self (date-бейдж + тултип) и
teacher (без изменений), подтверждение неприкосновенности 6 защищённых SQL,
**явная отметка «НЕ закоммичено, НЕ запушено — ждёт оператора»**.
