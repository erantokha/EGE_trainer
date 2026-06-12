# WPS.2 — Витрина для учителя и self-бейджей · Отчёт

Дата: 2026-06-12. План: `WPS_2_PLAN.md` (пре-одобрен оператором вместе с WPS.1).
Режим: эконом. Build: `2026-06-12-2-190438`.

## 1. Что сделано

| Шаг | Статус | Артефакт |
|---|---|---|
| §5.1 last3 в снимок | ✅ | `docs/supabase/student_picking_snapshot_v1.sql`: +CTE `proto_last3` (зеркало `student_proto_state_v1`), `protos[]` += `last3_total/last3_correct/last3_accuracy`; зеркала: `reports/wps_1/sql/01_apply_*.sql`; файл `02_verify_*.sql` сверяет last3-поля с `student_proto_state_v1` |
| §5.2 picker.js | ✅ | кеш снимков `Map` по `student_id` + негативный кеш сбоев (5 мин, не молотит RPC до деплоя/при сбоях сети); гейт локальной ветки расширен: self ИЛИ выбранный ученик учителя; прогрев в `setTeacherStudentViewUI`; посев `_SELF_PROTO_LAST3_CACHE` из снимка (guard: старый снимок без last3 кеш не сеет); visibility-refetch всех протухших снимков |
| §5.3 реестр + спека | ✅ | note WPS.2 в `runtime_rpc_registry.md`; спека §10 — поля last3 (помечены «НЕ участвуют в resolve») |
| §5.4 проверки | ✅ | governance 4/4 ok, юнит-тесты 22/22 ok (движок не менялся), `node --check` чист, bump `2026-06-12-2-190438` |
| §5.5 отчёт | ✅ | этот файл |

## 2. Эффекты после деплоя

- **Учитель**: после выбора ученика подбор с фильтром (включая «Выбрать всё» и
  батчи `syncAddedTasksToSelection` — они идут через ту же точку
  `pickQuestionsViaTeacherScreenResolveBatch`) считается локально: снимок
  прогревается при выборе ученика (~0.3–0.5с в фоне), дальше 0 round-trip'ов.
- **Ученик**: бейджи прототипов (предпросмотр, прото-модалка, WFX1-прогревы) берутся
  из посеянного кеша → `proto_last3_for_self_v1` не вызывается при живой витрине;
  прогревы WFX1 находят кеш заполненным и не шлют RPC.
- Серверные RPC (`proto_last3_for_self_v1`, resolve) остаются fallback-путями —
  ничего не удалено, контракты не менялись.

## 3. Безопасность отката

Как в WPS.1: `WPS_LOCAL_PICK_ENABLED=false` (+bump) — всё на RPC; без деплоя SQL
фронт работает по-старому (негативный кеш гасит повторные попытки fetch на 5 мин).
Старая версия снимка (если бы была задеплоена без last3) бейджи не ломает — посев
кеша выключается guard'ом.

## 4. Что НЕ делалось (по плану §3)

Прогревы учительской модалки (`warmTeacherModalStatsForStudent` — 3 RPC при выборе
ученика) — кандидат WPS.3; per-bucket добор остатка (screen_v2) — серверный fallback.

## 5. ЕДИНАЯ ИНСТРУКЦИЯ ЗАЛИВКИ (WPS.1 + WPS.2 — одна заливка)

Файлы уже содержат WPS.2-расширение. Порядок тот же, что в `reports/wps_1_report.md §5`:

1. `reports/wps_1/sql/01_apply_student_picking_snapshot_v1.sql` → Supabase SQL Editor,
   целиком, выполнить (`Success. No rows returned`).
2. `reports/wps_1/sql/02_verify_student_picking_snapshot_v1.sql` → выполнить:
   `duration_ms ≤ 300` (last3-окно добавляет ~50–100 мс к прежней оценке),
   `parity_mismatch = 0` (теперь включая last3-поля), `payload_bytes` записать.
3. `node reports/wps_1/parity_check.mjs` → `31 прогонов, расхождений: 0`.
4. Smoke ученика: home_student → фильтр → «Выбрать всё» → предпросмотр: в Network
   нет `teacher_picking_resolve_batch_v1` и нет `proto_last3_for_self_v1`
   (бейджи из витрины); снимок — 1 запрос на загрузке.
5. Smoke учителя: home_teacher → выбрать ученика (в Network один
   `student_picking_snapshot_v1`) → фильтр → подбор/предпросмотр: в Network нет
   `teacher_picking_resolve_batch_v1`; повторные подборы мгновенны.
6. Fallback-smoke: заблокировать URL снимка → перезагрузка → подбор и бейджи
   работают прежними RPC.

## 6. Затронутые файлы

`docs/supabase/student_picking_snapshot_v1.sql`, `reports/wps_1/sql/01_apply_*.sql`,
`reports/wps_1/sql/02_verify_*.sql`, `tasks/picker.js` (WPS-блок, гейт, прогрев
учителя), `docs/supabase/runtime_rpc_registry.md`, спека §10, build `?v=`.
Движок `app/core/pick_filtered.js` и провайдер НЕ менялись. Вне плана — ничего.
