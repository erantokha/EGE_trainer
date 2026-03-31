# Student Analytics Screen v1 Specification

Дата обновления: 2026-03-31

Этот документ фиксирует целевой layer-4 screen contract для student analytics screen после закрытия teacher-picking `v2` slice.

Связанные документы:
- [Архитектурный контракт 4 слоёв](architecture_contract_4layer.md)
- [Student Proto State v1 Specification](student_proto_state_v1_spec.md)
- [Student Topic State v1 Specification](student_topic_state_v1_spec.md)
- [Current Dev Context](current_dev_context.md)
- [Temporary Migration Exceptions](temporary_migration_exceptions.md)

## 1. Purpose

`student_analytics_screen_v1` — это канонический backend-driven screen payload для student analytics surfaces.

В первой волне он нужен, чтобы:
- убрать из [student.js](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/student.js) прямое чтение raw `answer_events`;
- перестать собирать teacher-facing student analytics screen из нескольких dashboard/coverage/read-path фрагментов;
- встроить в один screen payload готовые блоки для:
  - overall statistics;
  - theme / subtopic analytics;
  - coverage;
  - `variant12` / `worst3` teacher flows;
- подготовить единый layer-4 контракт, который позже сможет использовать и student self analytics screen.

Этот документ не описывает SQL-реализацию. Он задаёт продуктово-архитектурный контракт для будущего backend artifact.

## 2. Why v1 Exists

Сейчас student analytics сценарии живут в переходном состоянии:
- [student.js](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/student.js) читает `student_dashboard_for_teacher*` и отдельно `subtopic_coverage_for_teacher_v1`;
- логика `variant12` / `worst3` дополнительно читает raw `answer_events` с клиента;
- [stats.js](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/stats.js) использует fallback между `student_dashboard_self` и `student_dashboard_self_v2`;
- recommendations и smart-plan всё ещё считаются на фронте поверх dashboard payload.

`student_analytics_screen_v1` вводится, чтобы:
- закрыть `EX-RAW-ANSWER-EVENTS-STUDENT-SCREEN`;
- подготовить основу для снятия `EX-STUDENT-DASHBOARD-SELF-RPC-FALLBACK` и `EX-TEACHER-DASHBOARD-RPC-FALLBACK`;
- перестать считать screen payload на клиенте из нескольких несовместимых read-контрактов.

## 3. First Consumers

Первая волна consumers:
- [student.js](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/student.js)
- [variant12.js](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/variant12.js) или thin presenter поверх уже готового блока `variant12`

Следующая волна reuse:
- [stats.js](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/stats.js)
- future backend-driven recommendations / smart-plan

Не входят в scope `v1`:
- список выполненных работ через `list_student_attempts`;
- homework creation write-flow;
- final recommendations ranking contract.

## 4. Canonical Name And Ownership

Каноническое имя screen contract:
- `student_analytics_screen_v1`

Рекомендуемый owner:
- `student-analytics`

Причина:
- именно этот домен владеет teacher/student analytics surfaces;
- именно здесь сейчас остались raw-read и dashboard fallback exceptions;
- contract должен стать canonical bridge между layer-3 analytics state и несколькими UI surfaces.

## 5. Source Of Truth And Allowed Inputs

### 5.1. Allowed Inputs

`student_analytics_screen_v1` может строиться только поверх backend sources:
- `answer_events` как канонический layer-1 source через backend aggregation;
- layer-2 catalog dims;
- canonical layer-3 aggregates на уровнях `subtopic` и `theme`;
- future canonical layer-3 helper for recent-k metrics, если он понадобится для `last3`.

### 5.2. Forbidden Runtime Sources

Как постоянная архитектурная норма запрещено:
- читать raw `answer_events` из UI;
- вычислять `variant12` / `worst3` на клиенте через прямые REST-запросы к `answer_events`;
- тянуть analytics payload из нескольких независимых dashboard RPC и склеивать его на фронте;
- восстанавливать canonical coverage на клиенте отдельным ad-hoc запросом.

### 5.3. Compatibility Rule

Если в первой реализации backend временно использует существующие dashboard/coverage artifacts как промежуточные backing sources, это допустимо только внутри backend.

Для UI `student_analytics_screen_v1` должен выглядеть как один канонический layer-4 read contract.

## 6. Supported Viewers

Контракт проектируется как общий analytics screen payload для двух viewer scopes:
- `teacher`
- `self`

Первая обязательная реализация:
- `teacher`

Допустимая первая реализация `self`:
- либо на том же RPC;
- либо как тонкий wrapper, возвращающий тот же response shape.

## 7. Core Principles

### 7.1. One Screen Payload

UI не должен собирать analytics screen из:
- dashboard RPC;
- separate coverage RPC;
- raw event queries;
- frontend-only derived selectors.

Один экран — один canonical screen payload.

### 7.2. Topic Analytics First

Главной единицей screen payload для аналитики темы является:
- `subtopic`

Именно `subtopic` должен быть first-class row в payload, потому что:
- coverage в продукте живёт на `unic`, агрегированном до `subtopic`;
- current analytics UI показывает статистику по подтемам;
- `variant12` и future recommendations выбирают именно `subtopic`.

### 7.3. Canonical Metrics

`student_analytics_screen_v1` обязан использовать только канонические метрики:
- `covered`
- `solved`
- `accuracy`
- `weak`
- `stale`

И не должен вводить альтернативные meanings этих состояний.

### 7.4. No Raw Event Leakage

Даже если внутри backend для first-pass реализации используется read helper над `answer_events`, наружу screen payload должен возвращать уже готовые агрегаты и готовые analytics blocks.

### 7.5. No Silent Fallback In UI

После rollout screen consumer не должен:
- silently fallback-иться на raw `answer_events`;
- silently собирать coverage отдельным запросом;
- silently вычислять `worst3` самостоятельно.

## 8. Request Contract

Рекомендуемый first-pass function shape:

```sql
student_analytics_screen_v1(
  p_viewer_scope text default 'teacher',
  p_student_id uuid default null,
  p_days integer default 30,
  p_source text default 'all',
  p_mode text default 'init'
)
returns jsonb
```

## 9. Request Field Semantics

### 9.1. `p_viewer_scope`

Поддерживаемые значения:
- `teacher`
- `self`

Правила:
- для `teacher` нужен явный `p_student_id`;
- для `self` `p_student_id` может быть `null`, а target student выводится из `auth.uid()`.

### 9.2. `p_student_id`

Для `teacher` это обязательный target student.

Функция должна:
- проверить право доступа teacher к student;
- вернуть auth/access error при отсутствии доступа;
- не подменять отсутствие доступа на фальшивый пустой payload.

### 9.3. `p_days`

Определяет UI period projection.

Этот параметр влияет на:
- `period` metrics;
- периодические rankings в analytics screen;
- period-based explanations в analytics blocks.

Он не должен менять:
- `all_time` metrics;
- canonical `stale` meaning;
- coverage denominator.

### 9.4. `p_source`

Поддерживаемые значения:
- `all`
- `hw`
- `test`

Именно в этом source-scope должны считаться:
- overall metrics;
- theme/subtopic metrics;
- recent-k metrics;
- `variant12` selection heuristics.

### 9.5. `p_mode`

В `v1` поддерживается:
- `init`

Дополнительные specialized modes не требуются, если весь экран уже можно отрисовать из одного payload.

Если future implementation захочет добавить `refresh` или более узкие probe-modes, они не должны ломать канонический `init`.

## 10. Response Contract

Рекомендуемый top-level shape:

```json
{
  "student": {},
  "catalog_version": "2026-03-29T19:15_03688ddd",
  "screen": {},
  "overall": {},
  "sections": [],
  "topics": [],
  "variant12": {},
  "recommendations": [],
  "warnings": [],
  "generated_at": "2026-03-31T12:00:00Z"
}
```

## 11. Top-Level Blocks

### 11.1. `student`

Минимальный required shape:

```json
{
  "student_id": "uuid",
  "viewer_scope": "teacher",
  "days": 30,
  "source": "all",
  "display_name": "Имя Фамилия",
  "grade": 10,
  "last_seen_at": "2026-03-31T08:15:00Z"
}
```

### 11.2. `screen`

Минимальный shape:

```json
{
  "mode": "init",
  "source_contract": "student_analytics_screen_v1",
  "supports": {
    "variant12": true,
    "recommendations": false,
    "works": false
  }
}
```

Правила:
- `supports.recommendations` может быть `false` в `v1`, если рекомендационный блок ещё не backend-driven;
- `supports.works` может быть `false`, потому что список работ остаётся отдельным contract.

### 11.3. `overall`

Минимальный shape:

```json
{
  "last_seen_at": "2026-03-31T08:15:00Z",
  "last3": { "total": 3, "correct": 1 },
  "last10": { "total": 10, "correct": 6 },
  "period": { "total": 18, "correct": 11 },
  "all_time": { "total": 124, "correct": 86 }
}
```

Правила:
- `last3` нужен для консистентной screen vocabulary, даже если в UI он показывается не везде;
- если recent window не применим на overall-level, блок может быть `null`, но topic-level `last3` обязателен для `variant12.worst3`.

### 11.4. `sections`

`sections` — агрегаты на уровне `theme`.

Каждая строка обязана содержать:
- `theme_id`
- `title`
- `last_seen_at`
- `last10`
- `period`
- `all_time`
- `coverage`

Рекомендуемый shape:

```json
{
  "theme_id": "1",
  "section_id": "1",
  "title": "Планиметрия",
  "last_seen_at": "2026-03-31T08:15:00Z",
  "last10": { "total": 4, "correct": 2 },
  "period": { "total": 12, "correct": 7 },
  "all_time": { "total": 65, "correct": 41 },
  "coverage": {
    "unics_attempted": 7,
    "unics_total": 15,
    "pct": 47
  }
}
```

`section_id` допускается только как compat alias для текущего UI.

### 11.5. `topics`

`topics` — главная аналитическая таблица payload.

Каждая строка обязана содержать:
- `theme_id`
- `subtopic_id`
- `title`
- `topic_order`
- `last_seen_at`
- `last3`
- `last10`
- `period`
- `all_time`
- `coverage`
- `derived`

Рекомендуемый shape:

```json
{
  "theme_id": "1",
  "section_id": "1",
  "subtopic_id": "1.14",
  "topic_id": "1.14",
  "title": "Внешний угол",
  "topic_order": 14,
  "last_seen_at": "2026-03-31T08:15:00Z",
  "last3": { "total": 3, "correct": 1 },
  "last10": { "total": 8, "correct": 4 },
  "period": { "total": 5, "correct": 2 },
  "all_time": { "total": 18, "correct": 11 },
  "coverage": {
    "unics_attempted": 2,
    "unics_total": 7,
    "pct": 29
  },
  "derived": {
    "coverage_state": "covered",
    "sample_state": "enough",
    "performance_state": "weak",
    "freshness_state": "fresh"
  }
}
```

Правила:
- `topic_id` и `section_id` допускаются только как compat aliases;
- `coverage_state`, `sample_state`, `performance_state`, `freshness_state` обязаны быть projections поверх canonical metrics, а не отдельными UI heuristics;
- если точная derived vocabulary временно не нужна consumer-у, она всё равно должна жить в payload как canonical screen state для future recommendations reuse.

### 11.6. `variant12`

`variant12` обязан быть уже готовым block для UI и не должен требовать прямого чтения `answer_events`.

Рекомендуемый shape:

```json
{
  "uncovered": {
    "rows": [],
    "issues": []
  },
  "worst3": {
    "rows": [],
    "issues": []
  }
}
```

Каждая row обязана содержать:
- `theme_id`
- `theme_title`
- `subtopic_id`
- `subtopic_title`
- `mode`
- `reason`
- `picked_fallback`
- `meta`

Рекомендуемый row shape:

```json
{
  "theme_id": "1",
  "theme_title": "Планиметрия",
  "subtopic_id": "1.14",
  "subtopic_title": "Внешний угол",
  "mode": "worst3",
  "reason": "Последние 3: 1/3 (33%)",
  "picked_fallback": false,
  "meta": {
    "last3_total": 3,
    "last3_correct": 1,
    "last3_pct": 33,
    "all_total": 18,
    "all_correct": 11,
    "all_pct": 61
  }
}
```

### 11.7. `recommendations`

В `student_analytics_screen_v1` recommendations block допускается как:
- пустой массив `[]`, если separate recommendations contract ещё не введён;
- либо backend-driven projection поверх тех же topic rows.

В `v1` recommendations не считаются обязательным block.

### 11.8. `warnings`

`warnings` — массив user-visible или diag-visible предупреждений.

Он нужен для:
- partial degradation;
- empty-state explanations;
- transparent handling of edge cases без silent fallback.

## 12. Canonical Topic-State Vocabulary

`topics[*].derived` должен использовать следующую vocabulary:

- `coverage_state`
  - `uncovered`
  - `covered`

- `sample_state`
  - `none`
  - `low`
  - `enough`

- `performance_state`
  - `weak`
  - `stable`

- `freshness_state`
  - `fresh`
  - `stale`

Mapping rules:
- `coverage_state = uncovered`, если по topic coverage `unics_attempted = 0`;
- `sample_state = none`, если в topic нет затронутых `unic`;
- `sample_state = low`, если topic-level затронуто `1` или `2` `unic`;
- `sample_state = enough`, если topic-level затронуто `3+` `unic`;
- `performance_state = weak`, если topic-level rollup weak;
- `freshness_state = stale`, если topic-level mastered subset stale.

## 13. `variant12` Semantics

### 13.1. `uncovered`

Для каждого видимого `theme` screen contract обязан выбрать одну `subtopic` по правилу:
1. приоритет у `period.total = 0`;
2. если таких нет, выбирается `subtopic` с минимальным `all_time.total`;
3. tie-break — лексикографически меньший `subtopic_id`.

### 13.2. `worst3`

Для каждого видимого `theme` screen contract обязан выбрать одну `subtopic` по правилу:
1. приоритет у худшей `last3_pct`;
2. при равенстве — большее `last3_total`;
3. затем меньшее `all_time.total`;
4. затем лексикографически меньший `subtopic_id`.

Если в `theme` нет ни одной `subtopic` с `last3.total > 0`, screen contract обязан:
- fallback-нуться на правило `uncovered`;
- выставить `picked_fallback = true`.

### 13.3. No Raw Event Reads In UI

UI не должен:
- отдельно запрашивать последние 3 `answer_event` по topic;
- сам собирать `last3` map;
- сам решать, какая тема считается `worst3`.

Все эти решения должны приходить из `variant12` block или из topic rows внутри `student_analytics_screen_v1`.

## 14. Out Of Scope

Эта спецификация пока не покрывает:
- список выполненных работ;
- create-homework write path;
- full recommendations ranking contract;
- smart-plan payload;
- exact question picking;
- preview card rendering.

Эти блоки вводятся отдельными specs и не должны раздувать analytics screen contract без необходимости.

## 15. Acceptance Criteria

`student_analytics_screen_v1` можно считать принятым, если одновременно выполнены условия:
- [student.js](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/student.js) больше не читает raw `answer_events`;
- teacher analytics screen больше не собирает payload из `student_dashboard_for_teacher*` + `subtopic_coverage_for_teacher_v1` на клиенте;
- `variant12` и `worst3` работают без raw event queries из UI;
- `coverage` приходит в составе screen payload, а не отдельным ad-hoc RPC;
- UI читает один canonical screen contract;
- browser smoke подтверждает:
  - auth/access behavior;
  - top-level shape;
  - `sections` / `topics` / `coverage`;
  - `variant12.uncovered`;
  - `variant12.worst3`.

## 16. Next Step After Spec

После утверждения этого документа следующий рабочий шаг:
- подготовить `docs/supabase/student_analytics_screen_v1.sql`;
- перевести [student.js](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/student.js) на новый payload;
- затем возвращаться к dashboard fallback cleanup и recommendations backendization.
