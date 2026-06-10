# WMB2 · Разведка (READ-ONLY): почему модальный per-прототип last-3 (WMB1) применился ВЫБОРОЧНО

Дата: 2026-05-30
План: `WMB2_modal_badge_recon_PLAN.md`
Тип: **разведка, READ-ONLY**. Ноль правок кода/SQL, ноль деплоя. Корень доказан по коду + эмпирические прод-пробы (Анна Алданькова).
Связано: `reports/wmb1_modal_proto_last3_report.md`, `docs/supabase/proto_last3_for_teacher_v1.sql`, `tools/export_catalog.mjs`, `tasks/picker.js`.

> **TL;DR корень.** Модалка шлёт в RPC `type.id` карточки (3-сегментный, напр. `9.6.1`). Но `catalog_question_dim.unic_id`
> у «4.1-стиль» контента (где question_id 5-сегментный, `9.6.1.1.1`) = **`baseIdFromProtoId(question_id)` = question_id
> без последнего сегмента = `9.6.1.1`** (4-сегментный), а НЕ `type.id`. Фильтр RPC `q.unic_id = any([type.id])` не
> находит ничего → `last3Map.get(type.id)=null` → бейдж откатывается на сумму по-вопросных окон (Y>3). Для «1.1-стиль»
> контента (question_id 4-сегментный) `baseId == type.id` → совпадает → бейдж работает. **WMB1 §2 проверил ровно
> 4.1-стиль (`4.1.json`) и сделал обратный вывод** («type.id = unic»), хотя `export_catalog.mjs` прямо называет этот случай.

---

## 1. Подтверждённый корень (§5.1) — с доказательством

**Цепочка кода:**
- FE: `refreshProtoModalBadges` собирает `unicIds.push(typeId)` где `typeId = typ.id` — `tasks/picker.js:2710-2712`; затем `last3Map.get(typeId)` — `:2744`.
- Provider: `protoLast3ForTeacherV1` шлёт `p_unic_ids = part` (= type.id'ы) и ключует map по `row.unic_id` (catalog) — `app/providers/homework.js:639, 644-648`.
- RPC: `proto_last3_for_teacher_v1` фильтрует `q.unic_id = any(p_unic_ids)`, join `answer_events.question_id → catalog_question_dim.question_id`, ключ возврата = `q.unic_id` — `docs/supabase/proto_last3_for_teacher_v1.sql:41,51-55,58`.
- **Каталог:** `catalog_question_dim.unic_id = baseIdFromProtoId(question_id)` — `tools/export_catalog.mjs:156,177` (и unic_dim `:190`). `baseIdFromProtoId` = `parts.length>=4 && last numeric ? parts.slice(0,-1).join('.') : s` — **`:28-36`** (отбрасывает последний сегмент question_id).
- FE-fallback: `setModalStatsBadge` `useLast3 = last3_total>0` (`tasks/picker.js:904-906`) — при `last3_total=0` показывает `aggStat.total/correct` (сумма по-вопросных last-3 окон `question_stats_for_teacher_v2`, Y>3). `loadProtoLast3ForModal` при отсутствии строки кэширует `{0,0}` (`:847-855`).

**Где именно рвётся:** `picker.js:2712` кладёт в `p_unic_ids` **3-сегментный `type.id`**, а каталог хранит **4-сегментный `unic_id`** (для 5-сегментных question_id). Фильтр RPC не матчит → пусто → fallback.

**Эмпирическое подтверждение (прод, Анна Алданькова, teacher-аккаунт):**
- `proto_last3_for_teacher_v1(Анна, ['1.1.1','9.6.1','4.3.1','9.10.1','7.1.2'])` → вернул **только** `{unic_id:'1.1.1', last3:3/3}`; для `9.6.1/4.3.1/9.10.1/7.1.2` — **ни одной строки**.
- `proto_last3_for_teacher_v1(Анна, ['9.6.1.1','4.3.1.1','9.10.1.1','7.1.2.1..4'])` (правильные baseId) → строки **есть**: `9.6.1.1`=3/3, `4.3.1.1`=3/3, `9.10.1.1`=3/0, `7.1.2.1`=2/1, `7.1.2.2`=3/3, `7.1.2.3`=3/2, `7.1.2.4`=3/2.
- `student_proto_state_v1(Анна)`: `9.6.1/4.3.1/9.10.1/7.1.2` **отсутствуют** как unic_id; `9.6.1.1`={last3 3/3, attempts 5}, `4.3.1.1`={3/3, attempts 9} — совпадает с репортнутыми fallback «5/5», «9/9».

## 2. Точная цепочка id (§5.2)

```
МАНИФЕСТ types[].id           = "9.6.1"            (3 сегмента)   ← карточка модалки, data-type-id
МАНИФЕСТ prototypes[].id      = "9.6.1.1.1"        (5 сегментов)  = question_id
        │
        ▼  export_catalog.mjs: baseIdFromProtoId(question_id) = drop last segment
catalog_question_dim.unic_id  = "9.6.1.1"          (4 сегмента)   ← реальный unic в БД
catalog_unic_dim.unic_id      = "9.6.1.1"
        │
FE отправляет p_unic_ids = [ type.id = "9.6.1" ]   ← picker.js:2712  ✗ (надо было "9.6.1.1")
RPC: where q.unic_id = any(['9.6.1'])              → 0 строк (каталог знает "9.6.1.1")
last3Map.get("9.6.1") = null → last3_total=0 → fallback на aggStat (Y>3)
```
Для «1.1-стиль»: question_id `1.1.1.1` (4 сегмента) → baseId = `1.1.1` = type.id → совпадает → работает.

**Разрыв ровно один: FE кладёт `type.id` (3-сегм) вместо `baseIdFromProtoId(question_id)` (4-сегм).** RPC/каталог/семантика окна — корректны.

## 3. Таблица рабочий vs сломанные (§5.3) — фактические RPC-ответы (Анна)

| type.id (карточка) | question_id формат | catalog unic_id (baseId) | proto_last3 по **type.id** | proto_last3 по **baseId** | all-time attempts (fallback Y) | бейдж сейчас |
|---|---|---|---|---|---|---|
| `1.1.1` (OK) | `1.1.1.1` (4-сегм) | `1.1.1` (=type.id) | **3/3** ✓ | 3/3 | — | «3/3» (last-3, верно) |
| `9.6.1` | `9.6.1.1.1` (5-сегм) | `9.6.1.1` | **нет строки** | 3/3 | 5 | «5/5» (fallback) |
| `4.3.1` | `4.3.1.1.1` | `4.3.1.1` | **нет строки** | 3/3 | 9 | «9/9» (fallback) |
| `9.10.1` | `9.10.1.1.1` | `9.10.1.1` | **нет строки** | 3/0 | 5 | «0/5»→«1/5» (fallback) |
| `7.1.2` (1:многие) | `7.1.2.1.1` | `7.1.2.1`,`7.1.2.2`,`7.1.2.3`,`7.1.2.4` | **нет строки** | 2/1, 3/3, 3/2, 3/2 | ~14 | «8/14» (fallback, сумма по 4 unic) |

## 4. Паттерн затронутости (§5.4)

Скан всех манифестов `content/tasks/**/*.json` (`baseIdFromProtoId` vs `type.id`):
- **Рабочих типов (`type.id == unic`): 131.**
- **Сломанных типов (`type.id != unic`): 53.**

По разделам ЕГЭ (первый сегмент `type.id`):

| Раздел | Сломанных типов | Примеры |
|---|---|---|
| **4** (теория вероятностей) | 13 | `4.1.1…4.1.8`, `4.2.1`, `4.2.2`, `4.3.1`, `4.4.1` |
| **7** (преобразования) | 17 | `7.1.1…7.1.4`, `7.2.1…7.2.6`, `7.3.1…7.3.4` |
| **9** (модели/прикладные) | 21 | `9.1.1`, `9.2.1…9.14.1`, `9.10.1` |
| **12** (исследование функций) | 2 | `12.3.1`, `12.3.2` |

**Признак затронутости = question_id 5-сегментный** («4.1-стиль»: между `type.id` и номером вопроса есть лишний уровень-подгруппа). Это разделы 4 / 7 / 9 / 12. Разделы 1 / 2 / 3 / 5 / 6 / 8 / 10 / 11 — «1.1-стиль» (4-сегм question_id) → работают.

**Под-случаи:**
- **1:1 (тип → один unic): 46 типов** (напр. `9.6.1`→`9.6.1.1`, `4.3.1`→`4.3.1.1`). Фикс тривиален: резолв `type.id`→единственный baseId.
- **1:многие (тип → несколько unic): 7 типов** (напр. `7.1.2`→`7.1.2.1..4`, `4.1.1`→`4.1.1.1`,`4.1.1.2`). Для них «last-3 на прототип» неоднозначен — нужно продуктовое решение (см. §5).

## 5. Рекомендация по фиксу (§5.5) — крупными мазками, НЕ реализовано

**Чинить в FE** (`tasks/picker.js`, `refreshProtoModalBadges`), а не в RPC/каталоге:

- Вместо `unicIds.push(typeId)` (`:2712`) — резолвить **catalog unic_id(ы) типа из его question_id'ов**: для каждого `typ` собрать `unicIds = dedupe(typ.prototypes.map(p => baseIdFromProtoId(p.id)))` (та же функция, что в `export_catalog.mjs:28-36` — продублировать в FE или вынести в `app/core/`). Передавать эти baseId в RPC.
- Ключ бейджа: вместо `last3Map.get(typeId)` — суммировать last-3 по unic'ам данного типа (`:2744`).

**Развилка для 1:многие (7 типов):** «last-3 на карточку-тип» при нескольких unic'ах не определён однозначно:
- (a) показать сумму last-3 по unic'ам типа → знаменатель снова >3 (`7.1.2` → 2+3+3+3 = 11/3·4) — возвращает исходную проблему WMB1 (раздутый знаменатель). НЕ годится как есть.
- (b) показать одну карточку на **unic** (4-сегм), а не на манифест-`type` — но это меняет UX модалки (больше карточек) и связано с тем, как `type` используется для подбора (scope_id=type.id в screen-RPC).
- (c) показать last-3 «канонического» unic типа (где `prototype.unic=true`) — есть ровно один флаг на тип (проверено: `unic`-flagged всегда один id) → его baseId = первый unic. Простой и совместимый вариант, но семантически «last-3 одного представителя группы».
→ **Это продуктовое решение куратора.** Для **46 типов 1:1** фикс (а) и есть точное решение (один unic, знаменатель ≤3).

**Что НЕЛЬЗЯ трогать:**
- `tools/export_catalog.mjs` / схему `unic_id` — на ней держатся `student_proto_state_v1`, `teacher_picking_screen_v2`, WSF1-фильтры, WL3.1, весь подбор (scope_id=type.id резолвится в screen через `cb.unic_id = p.scope_id` — но там это работает, т.к. экран оперирует unic-уровнем каталога; менять baseId сломает всё).
- `proto_last3_for_teacher_v1.sql` — RPC корректен (правильно фильтрует по catalog unic_id; баг не в нём).
- `student_proto_state_v1`, `student_topic_state_v1`, `question_stats_for_teacher_v2` — не трогать.

**Объём / зона:** фикс **FE-only**, **НЕ red-zone** (ни SQL, ни деплой БД). Правка локализована в `refreshProtoModalBadges` + хелпер baseId. SQL-деплой не нужен. Риск низкий для 46 типов 1:1; для 7 типов 1:многие — сначала продуктовое решение, потом код. e2e/charnet не покрывают модальный бейдж (WMB1 §4) → проверка эмпирическая (как здесь).

## 6. Заметка: где WMB1 ошибся

WMB1 §2 «проверил `typ.id == unic_id`» на `content/tasks/probability/4.1.json` и заключил «`type.id = "4.1.1"` (= unic)». Но `4.1` — **ровно** 4.1-стиль (5-сегм question_id `4.1.1.1.1`), и `export_catalog.mjs:148-151` прямо документирует: «In 4.1-style manifests typ.id is 3-level but protos are 5-level, so one type contains several unic sub-groups». То есть проверочный пример WMB1 был контрпримером, прочитанным наоборот; §7 («рассинхрон не возникает») — неверен для всех 53 типов разделов 4/7/9/12.

## 7. Ограничения соблюдены

READ-ONLY: ноль правок `.sql`/`.js`/контента, ноль деплоя/bump. Temp-проба-spec удалена. PII/токены не печатались (только каталожные id + агрегаты last3/attempts). Корень доказан и кодом (`file:line`), и прод-RPC-ответами.
