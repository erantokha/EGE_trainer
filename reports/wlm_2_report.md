# WLM.2 — Флаги занятия + теги навыков (слой 1) · отчёт исполнителя

Дата: 2026-06-17 · План: `WLM_2_PLAN.md` · Режим: автономный, RED-ZONE.
Артефакты: `reports/wlm_2/`.

---

## §5.1. Разведка фактического WLM.1 (read-only)

Прочитаны: `docs/supabase/konspekts.sql`, `app/providers/konspekts.js`, `tasks/list.js`
(режим занятия + рендер карточки), `tasks/list.html`, `tasks/trainer/pages/list.css`,
`tools/check_runtime_rpc_registry.mjs`, `docs/supabase/runtime_rpc_registry.md`.

### Фактическая модель (соответствие допущениям §6)

| Что | Факт | Совпадает с §6? |
|-----|------|-----------------|
| Контейнер занятия | таблица `public.konspekts` (`id uuid` PK, `teacher_id`, `student_id`, `lesson_date date`, `status draft/published`). Один draft на (teacher, student, дата) — partial-unique `uq_konspekts_draft_per_day`. | ✅ есть контейнер `konspekts(id)` |
| Создание контейнера | RPC `konspekt_start_v1(p_student_id)` → создаёт/возвращает сегодняшний draft под consent (`teacher_students`). | ✅ |
| Идентификатор карточки | `tasks/list.js` рендерит `<article class="task-card" data-qid="<question_id>" data-topic-id="…">` (~`list.js:1042`). Снимки `konspekt_snapshots.question_id` — тоже `text`. | ✅ `question_id text` |
| Consent-гейт | `public.teacher_students(teacher_id, student_id)` accepted-связь; все konspekt-RPC и RLS гейтят по ней. | ✅ та же проверка ownership+consent |
| Провайдер | `app/providers/konspekts.js` — RPC через `supaRest.rpc(...)`, helper `firstRow()`, импорты с `?v=…`. | ✅ расширяем его |
| UI режима занятия | глобал `LESSON = { active, konspekt, count, studentId, studentName, … }`; `mountLessonMode()` строит `.lesson-bar`; `lessonEnable()` → `document.body.classList.add('lesson-active')` + `lessonStart()` → `Konspekts.konspektStart()` → `LESSON.konspekt`; `lessonDisable()` снимает класс. | ✅ |
| Стили режима занятия | per-page `tasks/trainer/pages/list.css` (НЕ общий `trainer.css`). | ✅ per-page |

### Вывод разведки

Фактическая модель WLM.1 **полностью совпадает** с проектными допущениями §6 плана:
есть контейнер-занятие `konspekts(id uuid)`, к которому привязываются события, и идентификатор
карточки — `question_id text` (= `card.dataset.qid`). **Stop-ask 10(а) не требуется.**

Привязка `lesson_items`:
- `lesson_items.konspekt_id uuid references public.konspekts(id) on delete cascade`
- `lesson_items.question_id text` = `card.dataset.qid`
- `unique (konspekt_id, question_id)` — один флаг/набор тегов на карточку в рамках занятия.

Тонкость: контейнер `konspekt` создаётся лениво (`lessonStart()` после выбора ученика и включения
тумблера). Флаг ставится на карточку с `data-qid`, привязка — к `(konspekt_id, question_id)`. До
открытия конспекта upsert невозможен — UI сообщает «выберите ученика», как и для снимков.

Замечание про `check_runtime_rpc_registry.mjs`: скрипт проверяет структуру таблицы реестра
(7 ячеек, валидные owner/status, существование `source_sql_file`) и сверяет summary-счётчики
(`total` / `standalone_sql` / `snapshot_only` / `missing_in_repo`) с числом строк. Он **не** сверяет
реестр с кодом. Валидные owner: `auth-profile | homework-domain | teacher-directory |
student-analytics | teacher-picking`. Для новых RPC owner = `homework-domain` (как konspekt-RPC).

---

## §2. Что сделано пофайлово

**Backend (исходники, применяет оператор):**
- `docs/supabase/lesson_items.sql` — **новый**. Таблицы `skill_tags_dim` (словарь) + `lesson_items`
  (события карточки), RLS, 3 RPC, seed стартового словаря, GRANT/REVOKE. Идемпотентно
  (`create table if not exists`, `drop function if exists` + `create`, `on conflict do nothing` на seed).
- `docs/supabase/runtime_rpc_registry.md` — добавлена секция «Lesson items (WLM.2)» с 3 RPC; summary
  `48 → 51` (total и standalone_sql).

**Frontend:**
- `app/providers/konspekts.js` — добавлены 3 обёртки: `lessonItemUpsert`, `lessonItemsForKonspekt`,
  `skillTagsDim` (через `supaRest.rpc`).
- `tasks/list.js` — флаг-контролы на карточке (4 кнопки) + дропдаун тега навыка; состояние `LESSON`
  расширено (`skillDict`, `flagState`); монтирование/демонтаж в `lessonEnable`/`lessonDisable`;
  гидрация (повторный вход) в `lessonStart`; пассивные timestamps (`opened_at`/`flagged_at`).
- `tasks/trainer/pages/list.css` — стили `.lesson-flags / .lf-btn / .lf-skill*` (per-page, scope §4);
  скрытие при печати через `body.print-layout-active` (НЕ `@media print` — того требует
  `check_trainer_css_layers.mjs`) и при захвате (`body.dro-capturing` + `data-capture-hide`).
- `app/config.js` + `?v=` по всему репо — `node tools/bump_build.mjs` (build `2026-06-17-32-220254`).

**Не тронуто (scope-lock §7):** ученическая `tasks/konspekts.html`, `app/ui/header.js`, picker-движок,
auth-flow, общий `tasks/trainer/{base,print}.css`, governance-скрипты, существующие RPC и таблица
`konspekts` (привязка `lesson_items.konspekt_id → konspekts(id)` ничего в WLM.1 не меняет).

## §3. Финальные сигнатуры RPC и схема

```sql
-- словарь навыков (read для authenticated; write — только оператор через SQL)
skill_tags_dim(code text PK, label text, topic text, sort int, is_enabled bool)

-- событие карточки на занятии (приватно для учителя)
lesson_items(id uuid PK, konspekt_id uuid→konspekts(id) ON DELETE CASCADE, question_id text,
             flag text CHECK in (clean,hint,arith,lost), skill_tags text[] default '{}',
             opened_at timestamptz, flagged_at timestamptz, time_ms int,
             created_at, updated_at, UNIQUE(konspekt_id, question_id))

-- RPC (security definer, search_path=public, revoke anon / grant authenticated)
lesson_item_upsert_v1(p_konspekt_id uuid, p_question_id text, p_flag text,
                      p_skill_tags text[], p_opened_at timestamptz, p_flagged_at timestamptz)
  → public.lesson_items          -- upsert по (konspekt_id, question_id); гейт owner+consent;
                                  --   opened_at не перезатирается; time_ms = best-effort на бэке
lesson_items_for_konspekt_v1(p_konspekt_id uuid) → setof public.lesson_items   -- гейт owner+consent
skill_tags_dim_v1() → setof public.skill_tags_dim                              -- is_enabled, sort,label
```

**RLS-инварианты (проверка главного инварианта приватности):**
- `lesson_items`: единственная политика — `lesson_items_teacher_select` (SELECT для учителя-владельца
  контейнера под consent). **Student-select политики НЕТ.** INSERT/UPDATE/DELETE политик НЕТ → прямые
  записи запрещены всем (только security-definer RPC). RPC гейтят `NOT_OWNER`/`NO_CONSENT`/`AUTH_REQUIRED`.
- `skill_tags_dim`: `skill_tags_dim_read` (SELECT для authenticated) — это справочник; write-политик нет.
- anon: `revoke execute … from anon` на всех 3 RPC; `auth.uid() is null` → consent-предикаты ложны.

## §4. Стартовый словарь навыков — **требует ревью оператором**

Seed (`on conflict do nothing`, ручные правки оператора не перетираются повторным прогоном):

| code | label | topic |
|------|-------|-------|
| fractions | дроби | алгебра |
| discriminant | дискриминант | алгебра |
| roots_radicals | корни и радикалы | алгебра |
| interval_method | метод интервалов (анализ знаков) | алгебра |
| expr_transform | преобразование выражений | алгебра |
| sign_on_transfer | знак при переносе | алгебра |
| root_loss_gain | потеря/появление корня | алгебра |
| odz | ОДЗ | общее |
| reduction_formulas | формулы приведения | тригонометрия |
| double_angle | формулы двойного угла | тригонометрия |
| trig_circle | тригонометрическая окружность / отбор корней | тригонометрия |
| planimetry_facts | базовая планиметрия (факты) | планиметрия |

Расширение/правка — оператором через SQL (`insert … on conflict do update` / `update … set is_enabled=false`);
изменения сразу появляются в дропдауне (словарь читается из БД, не хардкод).

## §5. Доказательства Уровня A

- Governance — все зелёные:
  - `check_runtime_rpc_registry.mjs`: `rows=51 standalone_sql=51 snapshot_only=0 missing_in_repo=0`.
  - `check_runtime_catalog_reads.mjs`: ok. `check_no_eval.mjs`: ok.
  - `check_trainer_css_layers.mjs`: ok (`base !important=33, pages !important=88`).
- `tests/print-features.js`: **Прошло 36 / Упало 0** (без регрессий).
- `node --check`/ESM-парс: `tasks/list.js` и `app/providers/konspekts.js` синтаксически валидны.
- `node tools/bump_build.mjs`: прогнан, build `2026-06-17-32-220254`.
- Скриншоты вёрстки (визуальный harness `reports/wlm_2/flags_harness.html` — реальные tokens/base/list.css
  + точная разметка `buildCardFlags`/`buildSkillDropdown`, словарь мокнут):
  - `reports/wlm_2/shot1_cards.png` — карточка с 4 флаг-кнопками + кнопка «Навык»; и карточка с
    активным флагом ⚠️ (синее кольцо) + «Навык: 2».
  - `reports/wlm_2/shot2_active_and_menu.png` — открытое меню навыка (группы Алгебра/Общее/Тригонометрия,
    чекбоксы, 2 выбраны), активный флаг визуально выделен.
  - Скрипт: `reports/wlm_2/_shots.cjs`. (Полный e2e на реальной странице — Level B, нужен бэкенд.)

## §6. Инструкция оператору — применение бэкенда

1. Применить SQL на проде (Supabase SQL editor), один файл, идемпотентно:
   ```
   docs/supabase/lesson_items.sql
   ```
   Создаёт `skill_tags_dim` (+ seed 12 навыков), `lesson_items`, RLS, 3 RPC, GRANT/REVOKE.
   Backup не нужен (только новые объекты). Storage/bucket не требуется (флаги — без файлов).
2. (Опц.) отревьюить и расширить стартовый словарь навыков (§4) — `insert … on conflict do update`.
3. Прод-фронт уже ссылается на новые RPC (build `2026-06-17-32-220254`); до применения SQL флаги
   деградируют мягко (дропдаун «Словарь навыков пуст», сохранение покажет ошибку статуса), без падений.

## §7. Что ждёт живой приёмки (Уровень B — после бэкенда оператором)

- **B1.** Учитель в режиме занятия флажит 2–3 карточки + ставит теги → перезагрузка вкладки → флаги/теги
  на месте (`lesson_items_for_konspekt_v1` гидрация в `lessonStart`).
- **B2.** Ученик НЕ видит флаги нигде (нет student-RLS на `lesson_items`, нет student-скоуп RPC) —
  RLS-негатив: прямой PostgREST-select ученика к `lesson_items` → пусто.
- **B3.** Словарь навыков в дропдауне из БД; добавление кода оператором появляется в UI.
- **B4.** e2e: `e2e/teacher/wlm2-flags.spec.js` (простановка + персистенция),
  `e2e/student/wlm2-flags-private.spec.js` (RLS-негатив, обязателен).
  Эти e2e-файлы не создавались (требуют живого бэкенда и QA-аккаунтов) — пишутся на этапе Level B.

## §8. Отклонения и решения внутри scope

- **Print-hide флагов:** план §4 разрешал стили только в `pages/*.css`, а `check_trainer_css_layers.mjs`
  запрещает `@media print` в page-файлах (print-правила → только `print.css`, вне scope §4). Решение
  внутри scope: скрытие через `body.print-layout-active .lesson-flags{display:none}` (print-state
  селектор без `@media`) — governance зелёный, `print.css` не тронут.
- **Привязка флага к карточке** через `data-qid` (= `question_id`), а не к снимку конспекта: снимки
  WLM.1 не несут `question_id` (рисовалка передаёт null), а флаг ставится на конкретную карточку списка.
  Это корректно и независимо от снимков; совпадает с §6 (`unique(konspekt_id, question_id)`).
- **`lesson_item_upsert_v1` не требует статуса `draft`** (в отличие от `konspekt_add_snapshot_v1`):
  флаг — приватная оценка, ложных отказов «конспект уже собран» быть не должно; гейт = owner+consent.

