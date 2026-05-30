# WMB3 — Модальные бейджи прототипов: резолв baseId + split 1:многие на карточки-по-unic

**Ветка:** `wmb3-modal-per-unic` · **build:** `2026-05-30-3` · **FE-only, без SQL/деплоя.**
**Файл логики:** `tasks/picker.js` (единственный с не-`?v=` изменениями).

---

## 1. Корень (подтверждён разведкой + эмпирикой)

Модалка подбора слала в RPC `proto_last3_for_teacher_v1` ключ `type.id` карточки (3-сегм., напр. `7.1.2`),
но `catalog_question_dim.unic_id = baseIdFromProtoId(question_id)` (`app/core/pick.js:10-16`,
`tools/export_catalog.mjs:148-156`). Для «4.1-стиль» контента `question_id` 5-сегментный (`7.1.2.2.13`)
→ baseId 4-сегм. (`7.1.2.2`) ≠ `type.id` `7.1.2` → RPC по `type.id` ничего не находит → бейдж
откатывался на сумму по-вопросных окон (`aggregateStatsForQuestionIds`) → знаменатель > 3.

**Дополнительная находка (важно):** тот же `type.id`-ключ ломал и **подбор**. Resolve
(`teacher_picking_resolve_batch_v1.sql:398` — `on cb.unic_id = vri.scope_id where vri.scope_kind='proto'`)
матчит `scope_id` против `unic_id`. Старый `proto:type.id` → 0 совпадений → **0 задач из 6** для
4.1-стиль типов (эмпирически подтверждено, см. §5). То есть до WMB3 teacher мог выбрать эти 53 типа,
но получал пустую подборку. WMB3 чинит и бейдж, и подбор одним ключом.

## 2. Классификация 53 сломанных типов (детерминированно)

Сгруппировал `type.prototypes` по `baseIdFromProtoId(p.id)` по всем 84 манифестам из
`content/tasks/index.json`. Тип «сломан», если baseId ≠ type.id или групп > 1.

| Категория | Кол-во | Детект |
|---|---|---|
| OK (`type.id === baseId`, 1.1-стиль) | 131 | одна группа, base == type.id |
| **BROKEN 1:1** (`type.id != baseId`, одна группа) | **46** | одна группа, base != type.id |
| **BROKEN 1:многие** (групп > 1) | **7** | > 1 baseId-группы |
| **Итого сломанных** | **53** | разделы 4 / 7 / 9 / 12 |

**7 типов 1:многие:** `4.1.5` (→2), `4.1.7` (→4), `7.1.1` (→2), `7.1.2` (→4), `7.1.3` (→3),
`7.1.4` (→2), `9.3.2` (→2).
Разделы 1:1: 4/7/9/12. Разделы 1:многие: 4/7/9.

## 3. Правки (`tasks/picker.js`)

Единый принцип: **карточка модалки = unic (baseId), а не type.id.** baseId — общий ключ и для бейджа
(`proto_last3_for_teacher_v1` по `unic_id`), и для подбора (resolve `scope_id == unic_id`).

- **`buildProtoModalCards(types)`** (новое, ~2638): группирует `type.prototypes` по
  `baseIdFromProtoId(p.id)`. 1 группа → 1 карточка (`key=baseId`, заголовок `type.id + title`);
  > 1 группы → N карточек (`key=baseId`, заголовок `unic id + title`, свой `protos`/`cap`/`stem`).
- **`renderProtoModalCard(manifest, card)`** (~2870): принимает дескриптор карточки.
  `data-type-id = card.key` (unic); счётчик `CHOICE_PROTOS[card.key]`; cap/stem по `card.protos`.
- **`refreshProtoModalBadges(cards)`** (~2729): `unicIds = card.key[]` → `loadProtoLast3ForModal`;
  бейдж `last3Map.get(card.key)` (не `type.id`); aggStat для date/all-time — по `card.protos`.
- **`openProtoPickerModal`** (~2844): строит `cards = buildProtoModalCards(types)`, сортирует по
  unic-ключу (`compareId`), рендерит по карточке, передаёт `cards` в badge-refresh.
- **`protoModalSum`** (~2649) и `onTeacherContextChanged` badge-refresh (~3126): по `PROTO_MODAL_CARDS`.
- `PROTO_MODAL_CARDS` — новый модульный стейт (сбрасывается в open/close).
- `baseIdFromProtoId` уже импортирован (`picker.js:20`) — переиспользован.
- `node tools/bump_build.mjs` → `2026-05-30-3`.

RPC/провайдер (`app/providers/homework.js`), SQL, `export_catalog.mjs`, контент — **не тронуты.**

## 4. Эмпирика на проде (teacher `.auth/teacher.json`, ученик «Анна Алданькова»)

Локальный FE (worktree, build `2026-05-30-3`) против прод-бэка `api.ege-trainer.ru`. Сняты бейджи
через Playwright. **BEFORE** = committed picker.js (`2026-05-30-2`, подменён на тот же origin :8000).

| Карточка | BEFORE (старый type.id-ключ) | AFTER (WMB3, baseId-ключ) | Стиль |
|---|---|---|---|
| `1.1.1` (контроль) | `3/3` ✓ | `3/3` ✓ | 1.1 OK |
| `1.1.2` (контроль) | `1/3` ✓ | `1/3` ✓ | 1.1 OK |
| `4.2.1` → `4.2.1.1` | **`1/6`** ✗ | `1/3` ✓ | broken 1:1 |
| `4.2.2` → `4.2.2.1` | **`3/4`** ✗ | `2/3` ✓ | broken 1:1 |
| `4.3.1` → `4.3.1.1` | **`9/9`** ✗ | `3/3` ✓ | broken 1:1 |
| `4.4.1` → `4.4.1.1` | **`6/7`** ✗ | `2/3` ✓ | broken 1:1 |
| `7.1.1` → `7.1.1.1/.2` | **`5/5`** ✗ | `3/3`, `2/2` ✓ | broken 1:многие (2 карты) |
| `7.1.2` → `7.1.2.1..4` | **`8/14`** ✗ | `1/2`,`3/3`,`2/3`,`2/3` ✓ | broken 1:многие (4 карты) |
| `7.1.3` → `7.1.3.1..3` | **`1/6`** ✗ | `1/3`,`0/1`,`0/1` ✓ | broken 1:многие (3 карты) |
| `7.1.4` → `7.1.4.1/.2` | **`3/9`** ✗ | `1/3`,`1/3` ✓ | broken 1:многие (2 карты) |
| `7.2.1..6` → `7.2.x.1` | **`2/4`,`3/4`,`2/6`,…** ✗ | `2/3`,`Не решал`,`2/3`,… ✓ | broken 1:1 |
| `9.6.1` → `9.6.1.1` | **`5/5`** ✗ | `3/3` ✓ | broken 1:1 |

Все ≥ 8 репортнутых-сломанных групп (4.2/4.3/4.4/7.1.x/7.2.x/9.6.1) перешли с «X/Y, Y>3» на «X/3»
(≤3). Контроль 1.1.1/1.1.2 не изменился. **DoD #1, #2 закрыты.**

## 5. Подбор не сломан (DoD #3)

Resolve-проба: выбрать N в модалке, открыть added-tasks, прочитать `question_id` resolved-задач,
сверить baseId с ключом карточки.

**AFTER (WMB3):** выбрал по 2 из `7.1.2.2` (split), `7.1.3.1` (split), `4.2.1.1` (1:1) →
`#sum = 6`, «Показано: 6 из 6», resolved:
`4.2.1.1.8, 4.2.1.1.20, 7.1.2.2.2, 7.1.2.2.13, 7.1.3.1.5, 7.1.3.1.9` — **каждый baseId совпал с
выбранной карточкой** (2+2+2). Подбор split-карточек идёт по-прототипно (по unic) — как и
ожидалось планом.

**BEFORE (старый type.id-ключ):** те же выборы (ключи `7.1.2`, `7.1.3`, `4.2.1`) → «Показано: **0 из 6**».
Подтверждает, что старый ключ ломал resolve, а WMB3 — чинит.

**charnet** (`e2e/teacher/picker-stats-charnet.spec.js`): **зелёный** (golden совпал) — снимок home-аккордеона,
модалка вне его; модальные правки не меняют home-render.

**Полный teacher-suite** (`e2e/teacher`, против worktree FE): **24 passed, 2 failed**. Оба провала
(`home.spec.js` — `networkidle` против прод-RPC; `wtc2-compose-fix.spec.js` — `expect <99, got 99`,
устаревшее предположение о размере банка) **воспроизводятся идентично на старом picker.js** → они
pre-existing/data-environmental, не от WMB3. `wtc4-resolve-complete` (resolve-полнота) — зелёный.

## 6. Governance / артефакты

- `check_runtime_rpc_registry.mjs` / `check_runtime_catalog_reads.mjs` / `check_no_eval.mjs` — **OK**.
- `node --check tasks/picker.js` — **OK**.
- `git diff --stat`: только `tasks/picker.js` (логика) + `?v=` cache-bust по дереву + `version.json`.
  **NONE** из `.sql` / `content/` / `export_catalog.mjs` не тронуто.

## 7. Заметка для куратора (не блокер)

`CHOICE_PROTOS` теперь ключуется baseId. Персист added-tasks (`persistAddedTasksContext`) сохраняет
их как есть → round-trip корректен. Единственный граничный случай: подборка, **сохранённая старым
кодом** (type.id-ключи), восстановленная после деплоя WMB3 — старые ключи всё равно не резолвились
(0 задач) и до WMB3, так что это строгое улучшение; sessionStorage к тому же пер-сессионный.
