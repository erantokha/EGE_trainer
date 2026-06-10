# WMB2 · РАЗВЕДКА (read-only): почему модальный per-прототип last-3 применился ВЫБОРОЧНО

Дата: 2026-05-30
Автор: куратор
Тип: **разведка, READ-ONLY** (ноль правок кода/SQL, ноль деплоя). + эмпирические прод-пробы. Результат — отчёт.
Статус: готов к исполнению
Связано: `reports/wmb1_modal_proto_last3_report.md` (WMB1, уже задеплоен), `docs/supabase/proto_last3_for_teacher_v1.sql`, `tasks/picker.js` (`refreshProtoModalBadges`).

> WMB1 задеплоен: бейдж карточки прототипа в модалке должен показывать «X/3» (last-3 по `unic_id`). Но на ПРОДЕ применилось **выборочно**: 1.1.1 = «3/3» (ок), а МНОГО прототипов всё ещё «X/Y» с Y>3 (9.6.1 «5/5», 4.3.1 «9/9», 7.1.2 «8/14», 9.10.1 «1/5», 4.4.1 «6/7», 4.2.1 «1/6» …). Нужно выяснить ПОЧЕМУ, чтобы потом точечно починить. **Эта волна — только разведка.**

---

## 1. Что уже известно (механизм, заземлён куратором)

В `tasks/picker.js` `refreshProtoModalBadges` (~стр.2730-2758):
```js
const last3Map = last3Res?.map; // ключ = unic_id из RPC proto_last3_for_teacher_v1
const protoLast3 = last3Map.get(typeId) || null;   // typeId = typ.id карточки модалки
badgeStat.last3_total  = protoLast3?.last3_total  || 0;
badgeStat.last3_correct = protoLast3?.last3_correct || 0;
// + aggStat (сумма по-вопросно из question_stats_for_teacher_v2) для total/correct/date
```
`setModalStatsBadge` (~стр.850-862, `useLast3 = last3_total>0`): если `last3_total>0` → показывает last-3 («X/3»); **иначе fallback на `aggStat.total/correct` (сумма по-вопросных окон, Y>3)**.

→ **Корень-симптом: `last3Map.get(typeId)` возвращает `null` (или `last3_total=0`) для «сломанных» прототипов** → бейдж откатывается на суммирование. Вопрос разведки — ПОЧЕМУ null для одних и не-null для других.

## 2. Ведущая гипотеза (проверить, не принять на веру)

Новый RPC `proto_last3_for_teacher_v1` (`docs/supabase/proto_last3_for_teacher_v1.sql`) фильтрует `q.unic_id = any(p_unic_ids)` и группирует по `q.unic_id` (join `answer_events.question_id → catalog_question_dim.question_id`). `p_unic_ids` = `PROTO_MODAL_TYPES.map(t=>t.id)` (typ.id карточек). Ключ возврата = `catalog_question_dim.unic_id`.

**Гипотеза:** `typ.id` (id карточки из манифеста темы) **НЕ равен** `catalog_question_dim.unic_id` для части прототипов (вероятно, более нового/другого контента) → RPC по ним не отдаёт строк (или отдаёт под другим ключом) → `last3Map.get(typeId)=null` → fallback. Для 1.1.1 совпадает (работает), для 7.1.2/9.6.1/4.3.1 — нет.

Альтернативы (тоже проверить): (a) attempted `question_id` отсутствуют в `catalog_question_dim` (контент-дрейф) → join пустой; (b) RPC возвращает строки, но FE-ключ/нормализация map расходится; (c) лимит/тип `text[]` при большом числе unic_ids; (d) `typ.id` несёт суффикс/префикс/регистр, отличный от `unic_id`.

## 3. Scope

- **READ-ONLY.** Ноль правок `.sql`/`.js`, миграций, деплоя, bump_build. Только чтение + эмпирические прод-пробы (через Playwright/RPC, как делает picker) + отчёт.
- Цель — НЕ чинить, а **точно установить корень** и **очертить, какие прототипы затронуты** (паттерн: какой контент/темы/возраст), чтобы спланировать фикс.
- PII: числа/ID — это каталог и агрегаты, не персональные данные ученика; не печатать токены.

## 4. Что промапить / выяснить

**A. FE-биндинг (подтвердить точно):**
- `refreshProtoModalBadges` (picker.js): как формируется `last3Map` (`loadProtoLast3ForModal` → `protoLast3ForTeacherV1` в `app/providers/homework.js`), какой ключ в map (нормализация `unic_id`?), как fallback срабатывает. Подтвердить, что Y>3 = именно fallback на `aggStat`.
- `openProtoPickerModal` / `PROTO_MODAL_TYPES`: откуда берётся `typ.id` (манифест темы `man.types[].id`), и `typ.prototypes[].id` (= question_id?). Как манифест грузится (`ensureManifest`/`toAbsUrl`/`content/...`).

**B. ID-маппинг (ядро):**
- Для РАБОЧЕГО (1.1.1) и НЕСКОЛЬКИХ сломанных (например 7.1.2, 9.6.1, 4.3.1, 9.10.1) — эмпирически на проде (teacher-аккаунт, ученик Анна Алданькова, как в WMB1-пробах) открыть модалку и снять:
  - `PROTO_MODAL_TYPES` → `typ.id` карточки;
  - ответ `proto_last3_for_teacher_v1(student, [typ.id…])` (через перехват response или прямой вызов провайдера в page.evaluate): какие `unic_id` вернулись, с какими `last3_total/last3_correct`;
  - ответ `question_stats_for_teacher_v2(question_ids)` (по `typ.prototypes[].id`): подтвердить, что attempted question_ids там есть (объясняет Y>3 в fallback).
  - Вывод: совпадает ли `typ.id` с `unic_id`, который реально вернул RPC? Где расходится?
- В контенте/каталоге: как соотносятся `typ.id` (манифест) ↔ `catalog_question_dim.unic_id` ↔ `question_id`. Есть ли в `content/` или в схеме поле, по которому видно, что для одних прототипов id-схема одна, для других — другая. (Прямого доступа к БД может не быть — тогда вывод по RPC-ответам + манифестам.)

**C. Паттерн затронутости:**
- Сгруппировать сломанные vs рабочие по разделам/темам/датам/«вариантов»/возрасту контента — есть ли система (например, всё из разделов 4/7/9, или прототипы с >1 «типом», или определённый формат id). Это сузит фикс.

## 5. Вопросы, на которые отчёт ДОЛЖЕН ответить

1. Подтверждённый корень: почему `last3Map.get(typeId)=null/0` у сломанных (key-mismatch `typ.id`↔`unic_id` / пустой join / нормализация / иное) — с доказательством (RPC-ответы + `file:line`).
2. Точная цепочка id: `typ.id` (манифест) → что ждёт RPC (`p_unic_ids`) → `catalog_question_dim.unic_id` → ключ `last3Map`. Где именно рвётся.
3. Для 1.1.1 (ок) vs ≥3 сломанных: фактические значения (typ.id, вернувшиеся unic_id+last3, attempted question_ids) — таблицей.
4. Паттерн: какие прототипы/темы затронуты и по какому признаку (оценка охвата: «почти все кроме X» / «только разделы Y»).
5. Рекомендация по фиксу (крупными мазками, НЕ реализовывать): где правильно чинить — маппинг id в RPC (принимать typ.id и резолвить в unic_id), или в манифесте/контенте, или в FE-ключе; что НЕЛЬЗЯ трогать (WL3.1-функции, `question_stats_for_teacher_v2`, фильтры/WSF1). Оценка объёма/red-zone.

## 6. Deliverable

`reports/wmb2_modal_badge_recon_report.md`: ответы на §5 с `file:line` и фактическими RPC-ответами (без токенов); таблица рабочий-vs-сломанные; гипотеза-корень с доказательством; черновой план фикса + оценка. **Никаких правок кода — только отчёт.**

Если для проб нужен прогон Playwright — учти флаки локального setup (гонка home-load), перезапусти при падении; teacher-аккаунт уже в `.auth/teacher.json`, ученик «Анна Алданькова» есть в списке.
