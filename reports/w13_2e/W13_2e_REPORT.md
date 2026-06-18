# W13.2e — Часть 2 в конструкторе ДЗ. Отчёт

Дата 2026-06-18. build `2026-06-18-8-182354`. **Frontend-only, без SQL.** Не закоммичено. План `W13_2d_PLAN.md`→`W13_2e_PLAN.md`.

## §5.1 RECON — ключевая находка (уточняет диагноз плана)
Эмпирический тест (`reports/w13_2e/resolve_harness.html`, реальный `pickQuestionsScopedForList` + мок
`loadTopicPool`) показал: **движок резолва УЖЕ корректно собирает №13** —
`choiceProtos{13.trig.factor.46:1}`→1 пик, `choiceTopics{13.trig.factor:2}`→2, часть 1 — ок.
- `pickQuestionsScopedForList` использует `resolveTopicIdFromTypeId` (longest-prefix, из прошлой стерео-волны)
  + `buildCandidatesForType` матчит по `baseIdFromProtoId` → №13 (3-сег подтемы + unic) резолвится.
- **Исходная «пустая подборка» — симптом ДО заливки каталога:** тогда `topicById` не имел `13.trig.factor`,
  `resolveTopicIdFromTypeId` падал в 2-seg fallback `13.trig` (не подтема) → пусто. После W13.1-деплоя
  (каталог с №13) движок работает. → **§5.2 (правка pick_engine) НЕ нужна** (уже корректно).
- **Реальный остаток:** `inferTopicIdFromQuestionId` (hw_create.js:396, 2-seg) — на direct-add/freeze-пути
  давал `13.trig` → неверный `topic_id` в `frozen_questions` (ломает teacher-review/question_bank-слотирование).

## §5.3 Fix (единственная правка, `tasks/hw_create.js`)
`inferTopicIdFromQuestionId` → **longest-prefix-match по `TOPIC_BY_ID`** (как resolve в pick_engine/prefill):
- часть 1 2-сег темы (9.9, 4.1, …) → **идентично** прежнему;
- 3-сег подтемы: стерео `3.1.1` и часть 2 `13.trig.factor` → корректная подтема (раньше 2-seg давал неверное
  `3.1`/`13.trig` — латентный баг direct-add стерео заодно исправлен);
- fallback на 2 сегмента, если каталог не загружен.
Все выводы `topic_id` в hw_create теперь через исправленный хелпер или явные `r.topic_id`/`manifest.topic`/
`lookup.subtopic_id`.

## §5.4 Оба пути
- **Prefill** («Создать ДЗ» с главной): `pickQuestionsScopedForList` резолвит (доказано) → `loadPrefill`
  longest-prefix (hw_create.js:~1109) → `topic_id`=subtopic_id. ✓
- **Direct-add** (на hw_create): `pushRef` → `inferTopicIdFromQuestionId` (теперь longest-prefix) →
  `topic_id`=subtopic_id. ✓
- `frozen_questions` для №13 = `13.trig.factor` (subtopic_id) — teacher-review (W13.2c)/question_bank сойдутся.

## §5.5/§5.6/§5.7 Регрессия + verify
- Часть 1 resolve движка — **не тронут** (pick_engine без изменений; harness подтвердил part-1). `inferTopicId`
  для 2-сег part-1 тем идентичен.
- `node --check` (hw_create, pick_engine) — OK; governance (rpc 54/54, catalog, no_eval) — ok; print 36/0.
- Resolve-harness (`reports/w13_2e/resolve_harness.html`) — №13 + часть 1 резолвятся.

## Не верифицировано вживую
Полный UI-loop (выбрать №13 → создать ДЗ → frozen_questions → teacher-review) — live-тест оператора после
push фронта + поднятия сайта (VPS). Код-фикс готов; harness подтверждает движок.

## Накопленный незакоммиченный фронт
W13.1-fix + W13.2a/b/c/d/e — всё не запушено; для live-теста нужен commit+push (оператор). SQL W13.2b/c — на проде.
