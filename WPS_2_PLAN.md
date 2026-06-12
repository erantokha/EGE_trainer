# WPS_2_PLAN — Витрина для учителя и бейджей (трек WPS, эконом-режим)

Дата: 2026-06-12. Пре-одобрено оператором вместе с WPS.1 («закончить обе волны»).
Режим: эконом (smoke-тесты, без Fable-субагентов, SQL заливает оператор в конце).

## 1. Цель
Распространить витрину WPS.1 на (а) подбор с фильтром у УЧИТЕЛЯ (локально, 0
round-trip после прогрева) и (б) self-бейджи прототипов ученика (нулевые RPC
за счёт посева кеша из снимка). SQL заливки остаётся ОДНА (файл 01 обновляется
до деплоя — last3-поля).

## 2. Контекст
- Гейт `student_picking_snapshot_v1` уже self-or-teacher — серверных изменений,
  кроме last3-полей в payload, не нужно.
- Teacher-путь идёт через ту же точку `pickQuestionsViaTeacherScreenResolveBatch`
  (локальная ветка WPS.1 уже там, расширяется только гейт + кеш по student_id).
- Все self-бейджи (предпросмотр, прото-модалка, WFX1-прогрев) сходятся в
  `_SELF_PROTO_LAST3_CACHE` через `loadProtoLast3ForSelf` — посев кеша из
  снимка закрывает их одним местом; форма записи требует `last3_total/
  last3_correct` → расширение снимка (зеркало `proto_last3` CTE из
  `student_proto_state_v1`, parity-проверка против него же в файле 02).

## 3. Out of scope
Прогревы УЧИТЕЛЬСКОЙ модалки (`warmTeacherModalStatsForStudent`,
`question_stats_for_teacher_v2`, `proto_last3_for_teacher_v1`) — не трогаем.
Per-bucket добор остатка (screen_v2-resolve) — не трогаем. Изменения движка
`pick_filtered.js` — не требуются (resolve last3 не использует). trainer/list/hw.

## 4. Затрагиваемые файлы
- `docs/supabase/student_picking_snapshot_v1.sql` (+`proto_last3` CTE, 3 поля) —
  функция ещё НЕ задеплоена, контракт не ломается; зеркало в
  `reports/wps_1/sql/01_apply_*.sql`, расширение сверки в `02_verify_*.sql`.
- `tasks/picker.js`: WPS-блок → кеш Map по student_id + негативный кеш сбоев,
  прогрев учителя в `setTeacherStudentViewUI`, посев `_SELF_PROTO_LAST3_CACHE`,
  гейт локальной ветки sid==self ИЛИ sid==TEACHER_VIEW_STUDENT_ID.
- `docs/supabase/runtime_rpc_registry.md` (note), спека §10 (поля last3),
  `reports/wps_2_report.md`, bump build.

## 5. Шаги
§5.1 SQL last3 (canonical+01+02) → §5.2 picker.js Map-кеш/гейт/прогрев/посев →
§5.3 registry+спека → §5.4 governance+юнит+bump → §5.5 отчёт.
Task-tracking: TaskCreate по §5.1–§5.5.

## 6. Данные/контракты
Изменение payload НЕзадеплоенной функции = не red-zone-изменение живого
контракта; деплой той же одной транзакцией (файл 01). Реестр обновить.

## 7. Риски / stop-ask
Каркас autonomy WPS.1 действует (триггеры 1–9 + 10a-e). Доп. триггер: если
teacher-кеш по student_id требует инвалидации сложнее TTL+visibility — стоп.
Риск: снимок учителя протухает, пока ученик решает, — то же TTL/focus-поведение,
что у self (приемлемо: подбор, не отчётность).

## 8. DoD
1) Снимок несёт last3_total/last3_correct/last3_accuracy; файл 02 сверяет их с
   `student_proto_state_v1` (parity_mismatch=0 после деплоя).
2) Подбор с фильтром у учителя после выбора ученика не зовёт resolve-RPC
   (smoke шаг 4 инструкции, teacher-вариант).
3) Self-бейджи предпросмотра/модалки рендерятся без `proto_last3_for_self_v1`
   RPC при наличии снимка (Network-smoke).
4) Fallback: сбой снимка → RPC-путь, негативный кеш не даёт молотить запросами.
5) Юнит-тесты WPS.1 зелёные без правок движка; governance 4/4; bump.
6) Отчёт `reports/wps_2_report.md`.

## 9. Проверка
`node tests/unit/pick_filtered.test.mjs`; governance ×4; после деплоя — файл 02,
`node reports/wps_1/parity_check.mjs` (не зависит от last3), браузер-smoke
учителя и self-бейджей по инструкции отчёта WPS.2.

## 10. Артефакт
`reports/wps_2_report.md` (+ обновлённая инструкция заливки — те же файлы 01/02).
