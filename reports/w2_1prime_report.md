# W2.1' Report — picker.js decomposition (Variant B after Variant A found infeasible)

## 1. Резюме

Clean role-split (Variant A, plan target) **оказался невыполним** и был остановлен (stop-ask, см. §2).
Вместо него по решению оператора выполнен **Вариант B — surgical extraction** самодостаточного
leaf-подмножества: **5 pure-функций** resolve/manifest/bucket-builders вынесены из `tasks/picker.js`
в новый `tasks/picker_added_tasks.js`. Conservation доказана (174 функции: 169 в picker.js + 5 в
модуле), e2e picker-flow зелёный, оба home-экрана инициализируются без import-ошибок, unit-smoke
извлечённых builders 10/10. Билд **2026-05-26-2**. Коммит не создавался (для приёмки куратором).

Verification по **варианту A2** (оператор): структурный teacher-smoke (нет данных у e2e-teacher-аккаунта
для интерактивного §17-сценария) + conservation + atomic extraction + green student e2e. Остаточный
риск минимален: извлечены 5 **чистых** функций (no state, no DOM), перенесены verbatim.

## 2. Почему Variant A отменён (ключевая находка)

Plan'овая цель — split по роли (core + student + teacher, ~1800/700/2500) — **невыполнима mechanical
move + state-object**, потому что shared-функции вызывают role-specific логику (W2.0 section-level recon
это недооценил; call-graph при попытке split это вскрыл):

- `setTopicCount`/`refreshCountsUI` (shared) → `scheduleSyncAddedTasks` (teacher added-tasks engine);
- `openProtoPickerModal`/`renderProtoModalCard` (shared) → teacher modal-stats;
- `applyDashboardHomeStats` (shared) → student `updateScoreForecast`/`updateSmartHint`.

Под правилом «core не вызывает role-модули» call-closure core'а **поглощает все 174 функции (100%)** —
split с нулевой изоляцией. Чистый role-split потребовал бы callback/event-indirection (logic-changing
refactor, вне §3 scope) → re-plan. Оператор выбрал **Вариант B** (surgical leaf-extraction, lower risk).
Доказательство: `reports/w2_1prime_artifacts/{assign.cjs,split_log.md}`.

## 3. Что извлечено

`tasks/picker_added_tasks.js` (150 строк) — 5 pure builders + 2 imports (`withBuild`, `toAbsUrl`):
- `ensurePickerManifest(topic)` — fetch+memoize манифеста темы.
- `loadTopicPoolForPreview(topic)` — собрать пул прототипов из манифестов.
- `normalizeResolveReqArray(source)` — нормализовать resolve-запросы.
- `buildResolveBucketKey(kind,id)` / `getResolveRowBucketKey(row)` — построить bucket-ключи resolve.

Критерий выбора: downward-closed (callees ∈ set ∪ pure-imports), **no picker module-state, no DOM**,
не создаёт цикл. `getTeacherResolveManifestIndex` НЕ извлечён (использует manifest-cache state, который
также пишет `ensureMathJaxLoaded` в picker.js — не private). `picker.js` теперь импортирует эти 5.

## 4. DoD trace (адаптировано под Variant B)

| Критерий | Статус | Доказательство |
|---|---|---|
| Новый модуль создан, picker.js импортирует | ✅ | `tasks/picker_added_tasks.js` (5 exports); picker.js import line |
| 2 dead-функции удалены (§5.2) | ✅ | `collectManifestQuestionIds`, `openAddedTasksModal` (refs==1); 176→174 |
| Conservation | ✅ | 169 (picker.js) + 5 (module) = **174**, каждая ровно раз, 0 dupes |
| No cycle | ✅ | модуль не импортирует picker.js (grep: 0 import-from-picker) |
| Syntax | ✅ | `node --check` обоих OK |
| Extracted builders функционально верны | ✅ | unit-smoke `picker_added_tasks_smoke.html`: **10/10, fail=0** |
| Home-экраны init без import-ошибок | ✅ | headless student+teacher: accordion 108 nodes, **0 module/import errors** |
| e2e picker-flow без регрессий | ✅ | ws1 (bulk-pick→session→trainer): **4 passed**; teacher home.spec — pre-existing no-data WARN (= baseline) |
| Visual spot-check | ✅ | `reports/w2_1prime_smoke_post/{student,teacher}.png` — рендер корректен |
| home_teacher_combo smoke (OQ#8) | ✅ | picker.js остался side-effect script (0 exports наружу); teacher render чист → smoke не задет |
| bump_build, ?v= синхронны | ✅ | build 2026-05-26-2 во всех (module/picker import/home_*.html) |
| Governance 4/4 | ✅ | rpc_registry / catalog_reads / no_eval / trainer_css_layers OK |
| print-features sanity | ✅ | picker не задействован в print; 36/0 без изменений |

## 5. Diff stats

Логика: `tasks/picker.js` (−5 extracted +1 import, −2 dead → 4947 строк), `tasks/picker_added_tasks.js`
(new, 150), `tasks/picker_added_tasks_smoke.html` (new). Остальное в `git diff` — мехбамп `?v=` от
bump_build (recursive walk). Никаких правок `app/providers/*`, SQL, HTML-структуры home-страниц.

## 6. e2e / baseline

Baseline (с teacher-creds): 23 passed / 5 failed = teacher home.spec (no-data WARN) + 4 figure-теста на
`unique`/`list` (НЕ используют picker; catalog-flakiness/pre-existing mobile-full-width). Post-extraction:
тот же failed-set (picker-relevant ws1/student-home/visual-walkthrough green; teacher home.spec тот же
pre-existing WARN). **Никаких новых регрессий от extraction.** Артефакты: `e2e_before.txt`, `e2e_after*.txt`.

## 7. OQ-резолюции (W2.0 §10)

OQ#1/2/3/4/5 (boot/home-stats/state/exports для full split) — **не применялись** (Variant A отменён).
OQ#6 legacy auth header — не трогали. OQ#7 — 2 dead удалены. OQ#8 — combo-smoke не задет. OQ#9 — teacher
интерактивный smoke невозможен (no-data), заменён structural + unit-smoke (A2). OQ#10 — bump подхватил
новый модуль автоматически ✓. OQ#11 — n/a (не role-split).

## 8. Открытые follow-up

- **Full picker decomposition** — требует callback/event-indirection re-plan (W2.1'' или отложить).
  picker.js остаётся 4947-строчным монолитом (минус извлечённый leaf). Это главный незакрытый long-pole.
- **Hygiene:** general pure utils (`asset`/`compareId`/`escapeHtml`/`interpolate`) — кандидаты в
  `picker_utils.js` (downward-closed, тоже извлекаемы; не сделано в этой узкой волне).
- **Teacher e2e data:** e2e-teacher-аккаунт без assigned-students → интерактивные teacher-смоки
  (added-tasks resolve/preview) невозможны. Засеять студента+ДЗ для будущей teacher-verification.
- **Manual teacher review (A2):** оператору рекомендуется ручная проверка teacher added-tasks flow
  на аккаунте с данными post-merge.
- **W3** — декомпозиция `trainer.js`/`hw.js`/`hw_create.js` (критический путь, отдельный трек).
