# Спецификация семантики resolve-подбора (WPS.1)

Дата: 2026-06-12. Источник истины: `docs/supabase/teacher_picking_resolve_batch_v1.sql`
(состояние после perf-фикса 2026-06-08). Назначение: единая спека для JS-порта
(`app/core/pick_filtered.js`) и витрины (`student_picking_snapshot_v1`).
При изменении серверного resolve этот файл и JS-движок обновляются вместе
(parity-гейт — `reports/wps_1/parity_*`).

## 1. Контракт RPC

```
teacher_picking_resolve_batch_v1(
  p_student_id uuid, p_source text='all', p_filter_id text=null,
  p_selection jsonb='{}', p_requests jsonb='[]', p_seed text=null,
  p_exclude_question_ids text[]=null, p_complete boolean=false) → jsonb
```

- Гейт: `auth.uid()=p_student_id` ИЛИ `is_teacher_for_student(p_student_id)`.
- `p_source ∈ {all,hw,test}`; `p_filter_id ∈ {null, unseen_low, stale, unstable, weak_spots}`.
- Seed: `coalesce(nullif(p_seed,''), md5(student|source|filter|selection::text|requests::text))`.
  **Клиент всегда передаёт непустой seed** (`getCurrentTeacherPickSessionSeed`);
  JS-движок ТРЕБУЕТ непустой seed и fallback-формулу не реплицирует.
- Payload: `{student, catalog_version, screen:{mode:'resolve_batch', can_pick, session_seed},
  filter:{label, filter_id}, selection:{normalized}, picked_questions[], shortages[],
  warnings[], generated_at}`.

## 2. Нормализация входа

**requests** (массив): `scope_kind` → lower(trim), допустимы
`proto|topic|section|global_all`; `scope_id` = nullif(trim); `n` = int (regex
`^-?[0-9]+$`), кламп `max(n,0)`. Валидная строка: `global_all` (n принудительно
:=1) ИЛИ (`scope_id` непуст И `n>0`). `request_order` = порядковый номер в
массиве, 1-based, **по исходному массиву до фильтрации** (ordinality).

**selection**: `topics` — массив `[{id,n}]` ИЛИ объект `{id:n}`; want=max(n,0),
суммируется по дубликатам id, остаются want>0. `protos` — то же, ключ `protos`
ЛИБО `unics` (массив или объект). `exclude_topic_ids` — массив строк или
объектов (`id`|`topic_id`). Ключ `sections` сервером игнорируется.
`selected_topic_exclusions = selection_topics ∪ exclude_topic_ids`.

**exclude_question_ids**: `coalesce(p_exclude_question_ids, '{}')`.

## 3. Видимый каталог

Цепочка `catalog_theme_dim → subtopic → unic → question`, на каждом уровне
`coalesce(is_enabled,true) AND NOT coalesce(is_hidden,false)`, join по
(unic_id, subtopic_id, theme_id). `manifest_path` = `coalesce(nullif(trim(...)),'')`.
`catalog_version` payload'а = max по всем уровням.

## 4. Состояние ученика

### 4.1 proto_state (per unic)
Один скан `answer_events` (`student_id = p_student_id`, `source=p_source` либо
all), join на visible_questions по question_id, group by unic_id:
`attempt_count_total`, `correct_count_total` (filter correct),
`unique_question_ids_seen` (distinct question_id), `last_attempt_at` =
max(coalesce(occurred_at, created_at)). Для unic без событий — нули/null.
`accuracy = correct/attempts` (null при 0 попыток).

Флаги: `has_correct = has_independent_correct = (correct>0)`;
`covered=(attempts>0)`; `solved=(correct>0)`;
`is_not_seen=(uniq=0)`; `is_low_seen=(uniq=1)`; `is_enough_seen=(uniq>=2)`;
`is_weak=(attempts>=2 AND accuracy<0.7)`;
`is_stale=(correct>0 AND attempts>=2 AND NOT is_weak AND last_attempt_at < now()-30d)`;
`is_unstable=(correct>0 AND attempts>=2 AND accuracy<0.7)`.

### 4.2 topic_state (per subtopic, rollup по proto_state)
`unique_proto_seen_count` = count(covered); `mastered_proto_count` =
count(has_independent_correct); `mastered_attempt/correct_count_total` =
sum по mastered protos; `last_mastered_attempt_at` = max по mastered;
`unstable_proto_count` = count(is_unstable). Флаги:
`is_not_seen=(seen=0)`; `is_low_seen=(0<seen<3)`;
`is_stale=(mastered>0 AND m_att>=2 AND m_acc>=0.7 AND last_mastered < now()-30d)`;
`is_unstable=(unstable>0 AND mastered>0 AND m_att>=2 AND m_acc<0.7)`.

### 4.3 question_stats (per question)
Из таблицы `student_question_stats` по student_id: `total` (coalesce 0).
**БЕЗ фильтра по source** (all-time, в отличие от proto_state). Используется
только признак `total=0` (unseen-first на стадии вопросов).

### 4.4 Точка отсчёта времени
`now()` берётся в момент исполнения. JS-движок использует
`snapshot.generated_at` как now-референс (флаги приезжают готовыми с сервера;
лестница stale 30/60/90д считается движком от generated_at). Дрейф = возраст
снимка; митигируется refetch по TTL/focus.

## 5. Фильтр-предикат (matched_filter)

`null→true; unseen_low→is_not_seen OR is_low_seen; stale→is_stale;
unstable→is_unstable; weak_spots→is_weak; иначе false`.

Отбор кандидатов: при `complete=false` строки с `matched_filter=false`
ИСКЛЮЧАЮТСЯ; при `complete=true` участвуют ВСЕ (лестница-градиент сортирует),
`matched_filter` остаётся флагом строки (бейдж).

## 6. Кандидаты и исключения по scope

| scope | кандидаты | исключения |
|---|---|---|
| proto | unic_id = scope_id | только фильтр (при complete фильтр игнорируется) |
| topic | subtopic_id = scope_id | unic ∈ selection_protos |
| section | theme_id = scope_id | subtopic ∈ selected_topic_exclusions; unic ∈ selection_protos |
| global_all | весь каталог | те же два |

## 7. Ранжирование прототипов (row_number per request_order)

Сортировка — последовательность ключей; null-обработка указана. `md5(x)` —
hex-строка, сравнение как text (байтовое для hex — в JS обычное `<`).

### 7.1 Окно default (complete=false), scope topic
1. weak_spots: `is_not_seen ? 1 : 0` (иначе 0)
2. weak_spots: `coalesce(accuracy,1.0)` asc (иначе 0)
3. weak_spots: `last_attempt_at` asc NULLS LAST (иначе null)
4. unseen_low: `not_seen→1, low_seen→2, else 99`; stale|unstable: `1`; else 0
5. stale: лестница `last<now-90d→0, <60d→1, <30d→2, else 9` (null→9); else 0
6. unstable: `coalesce(accuracy,1.0)` asc; else 0
7. unstable: `last_attempt_at` DESC NULLS LAST; else null
8. unstable: `attempt_count_total` desc; else 0
9. `md5(seed||'|proto|'||coalesce(filter,'none')||'|topic|'||request_order||'|'||unic_id)`

Потолок: `pick_rank <= requested_n`. `question_limit=1`.

### 7.2 Окно default, scope section
Как 7.1, но ключ 4 topic-aware:
unseen_low: `topic_not_seen&&not_seen→1, not_seen→2, topic_low&&low→3, low→4, else 99`;
stale: `topic_stale&&stale→1, stale→2, else 99`;
unstable: `topic_unstable&&unstable→1, unstable→2, else 99`.
md5-ключ: `...'|section|'...`. Потолок `requested_n`, limit 1.

### 7.3 Окно default, scope global_all
Партиция `(request_order, theme_id)`, ключи как 7.2,
md5: `seed||'|proto|'||filter||'|global_all|'||order||'|'||theme_id||'|'||unic_id`.
Берётся `pick_rank=1` на каждую тему (в pick_rows rank/limit переписываются в 1).

### 7.4 Окно complete (complete=true), topic/section/global_all
1–3. weak_spots-ключи (как выше)
4. unstable|stale: `has_correct→0, not_seen→1, else 2`; unseen_low:
   `not_seen→0, low_seen→1, else 2`; else 0
5. unstable при has_correct: `coalesce(accuracy,1.0)` asc; else 0
6. stale при has_correct: `last_attempt_at` asc NULLS LAST; else null
7. unseen_low: `unique_question_ids_seen` asc; else 0
8. `md5(seed||'|complete|'||filter||'|<scope>|'||order||'|'||[theme_id||'|' для global]||unic_id)`

topic/section под complete: потолок top-N СНИМАЕТСЯ (все ранжированные протоки
идут на стадию вопросов; N применится на even-distribution). global_all: po-прежнему
rank=1 на тему. proto-scope: ранжирования нет (pick_rank=1, limit=requested_n),
под complete фильтр-гейт игнорируется (явный клик по прототипу).

## 8. Стадия вопросов

Кандидаты: visible questions выбранных протоков MINUS exclude_question_ids.
`question_rn` = row_number, партиция `(request_order, proto_id)`, сортировка:
1. `total=0 → 0 else 1` (нерешённые вперёд; total из student_question_stats)
2. `md5(seed||'|question|'||coalesce(filter,'none')||'|'||scope_kind||'|'||
   coalesce(scope_id, section_id)||'|'||request_order||'|'||question_id)`

even-distribution: `complete_global_rn` = row_number, партиция `request_order`,
сортировка `question_rn asc, pick_rank asc,
md5(seed||'|evendist|'||request_order||'|'||proto_id||'|'||question_id)`.

Отбор строк:
- `complete=true И scope ∈ {topic,section}` → `complete_global_rn <= requested_n`;
- иначе → `question_rn <= question_limit` (proto: requested_n; topic/section
  default: 1; global_all: 1 на тему).

Строка результата: `{request_order, question_id, proto_id, topic_id, section_id,
manifest_path, scope_kind, scope_id, filter_id, matched_filter, pick_rank}`.
Порядок массива: `(request_order, section_id, topic_id, pick_rank, question_id)`
— клиент пересортировывает бакеты по `(pick_rank, question_id)`, поэтому
**критерий паритета: множество строк `(bucket, question_id, pick_rank)` на
request_order, не порядок массива**.

## 9. Shortages / warnings

Per request: `requested_n` (для global_all = число видимых тем), `returned_n`,
`is_shortage = returned<requested`, `reason_id =
insufficient_filter_candidates|insufficient_candidates`, `message =
'Подобрано X из Y[ по фильтру "<label>"].'`. Labels: unseen_low='Не решал /
мало решал', stale='Давно решал', unstable='Нестабильно решает',
weak_spots='Слабые места'. Warning `empty_resolve_batch` при нуле валидных
requests.

## 10. Требования к витрине (student_picking_snapshot_v1)

Обязательные данные (всё из §4 + каталог стадии вопросов):
- `protos[]`: unic_id, theme_id, subtopic_id, attempt_count_total,
  correct_count_total, unique_question_ids_seen, last_attempt_at, accuracy
  и все флаги §4.1 (готовыми, с серверным now()); **WPS.2:** + `last3_total`,
  `last3_correct`, `last3_accuracy` (окно «последние 3 попытки» per unic,
  зеркало `proto_last3` из `student_proto_state_v1`) — НЕ участвуют в resolve,
  питают self-бейджи прототипов;
- `topics[]`: subtopic_id, theme_id + флаги §4.2;
- `qstats`: `{question_id: total}` ТОЛЬКО для total>0 (отсутствие = 0);
- `questions`: компактно `{unic_id: [[question_id, manifest_path_index], ...]}`
  + `manifest_paths[]` (дедуп путей) — видимые вопросы каталога;
- `sections[]`: видимые theme_id (для global_all requested_n);
- `meta`: student_id, source, generated_at, catalog_version.

## 11. Клиентский потребитель (фиксация интеграции)

Студенческий путь: `batchFillStudentBuckets` →
`pickQuestionsViaTeacherScreenResolveBatch({requests, excludeQuestionIds,
studentId: self, filterId})` → RPC с `complete:true`, seed из
`getCurrentTeacherPickSessionSeed(sid)`, selection из
`buildTeacherResolveSelection()` (protos/topics из CHOICE_*; ключ sections
сервер игнорирует). Ответ → `buildPreviewQuestionsFromResolveRows` (нужны
question_id, proto_id, manifest_path, pick_rank, bucket-ключ из
scope_kind/scope_id/section_id) → ротация `pickByProtoRotation`.
Локальный движок обязан вернуть payload той же формы (см. §1), включая
`screen.session_seed`.
