# W13.2e — Часть 2 в конструкторе ДЗ (можно положить №13 в домашку)

Блокер-фикс трека W13.2: №13 нельзя собрать в ДЗ через UI. **Скорее всего frontend-only** (resolve-движок
конструктора), без SQL. Контекст — `docs/navigation/part2_integration_contract.md`; модель попытки/проверки —
`docs/supabase/part2_attempt_reviews.sql` + W13.2c/d (готовы и залиты).

## §1. Цель
Учитель может **выбрать №13 и собрать ДЗ** через нормальный UI (оба пути: с главной «Создать ДЗ» и прямое
добавление на `hw_create`). Собранный набор корректно фиксируется в `frozen_questions` с **правильным
`topic_id` (= subtopic_id, напр. `13.trig.factor`)**. Это разблокирует teacher-review/ДЗ-loop (W13.2c/d) —
сейчас они работают на бэкенде, но недостижимы нормальным путём, т.к. ДЗ с №13 не собрать.

## §2. Контекст (симптом + корень — диагностировано)
- **Симптом (оператор):** выбираю №13 → в превью видно → «создать ДЗ» → **подборка пуста** → ДЗ с №13 не
  создаётся («нет ни одного задания»).
- **Корень:** resolve-конвейер конструктора заточен под id-структуру части 1:
  - `inferTopicIdFromQuestionId` (`hw_create.js:396`) берёт **первые 2 сегмента** → `13.trig.factor.46.1`
    даёт `13.trig` (неверно; подтема — `13.trig.factor`, 3 сегмента).
  - `pickQuestionsScopedForList` (`tasks/pick_engine.js:693`) + id/typeId-парсинг (`pick_engine.js:34/43`,
    `split('.')`) — резолвят выбор (choiceProtos/choiceTopics/choiceSections → qids) с part-1-допущениями;
    №13 (3-сегментные подтемы + unic-кеинг через `baseIdFromProtoId`) не резолвится → `FIXED_REFS` пуст.
- **Это GAP, не регрессия:** W13 завёл №13 в показ/аккордеон/scoring/teacher-review, но в **resolve
  конструктора ДЗ** часть 2 не заводили (мой live-харнесс собирал `frozen_questions` сырым RPC, минуя
  конструктор — потому бэкенд прошёл, а этот путь не тестировался).
- **Готовый образец фикса уже в коде:** prefill-ветка `hw_create.js:~1105` для 3-сегментных подтем уже
  делает **longest-prefix-match** по каталогу (`TOPIC_BY_ID`) — ровно то, что нужно применить шире.

## §3. Out of scope
- НЕ scoring/teacher-review/ДЗ-solve (W13.2a–d, готовы; не ломать).
- НЕ менять resolve части 1 (№1..12) — `pickQuestionsScopedForList` общий для ВСЕХ ДЗ, без регресса.
- НЕ каталог-схема/RPC/SQL — фикс должен быть чисто во фронт-resolve (если recon покажет иное — stop-ask).
- НЕ полировка (бейдж №13=0%, печать ч.2) и не фото — отдельные пункты.

## §4. Затрагиваемые файлы (точно — после recon §5.1)
- `tasks/pick_engine.js` — `pickQuestionsScopedForList` + id/typeId-хелперы: резолв №13 (3-seg подтемы + unic).
- `tasks/hw_create.js` — `inferTopicIdFromQuestionId` (→ longest-prefix-match), `refKey` (207),
  `freezeHomeworkQuestions`/`pushRef` (1272-1279), prefill-ветка (≈1105).
- Возможно `tasks/picker.js` — как выбор №13 экспортируется в `choiceProtos`/`choiceTopics` при «Создать ДЗ».
- Возможно `app/core/pick.js` — id-хелперы (`baseIdFromProtoId` и пр.), если 2-сегментные допущения там.

## §5. Пошаговый план
> **Task-tracking (обязательно, `CURATOR.md §6.1`):** TaskList по §5.1–§5.7, обновлять статусы.

- **§5.1 RECON (read-only) — пин точной точки обрыва.** Пройти путь «выбрал №13 → создать ДЗ» по коду:
  что picker кладёт в `choiceProtos`/`choiceTopics`/`choiceSections` для №13 (unic_id/base_id? subtopic_id?);
  как `pickQuestionsScopedForList` превращает это в qids и **где именно №13 выпадает** (резолв choiceTopics
  по 3-seg подтеме? choiceProtos по unic? typeId-парсинг 2-seg?). Проверить **оба пути добавления** (с главной
  через prefill + прямой add на `hw_create`). **Вывод — точный список правок; вероятно pure-FE; stop-ask,
  если всплывёт каталог-RPC/SQL.**
- **§5.2 Fix resolve в `pick_engine`.** Резолвить №13 choiceTopics/choiceProtos: 3-сегментные подтемы через
  **longest-prefix-match** по каталогу (как prefill-ветка), unic-кеинг как у части 1. Убрать жёсткие
  2-сегментные допущения в id/typeId-парсинге для части 2.
- **§5.3 `inferTopicIdFromQuestionId` → longest-prefix-match по каталогу** (переиспользовать паттерн
  `hw_create.js:~1105`); применить во всех точках (`refKey`, `freezeHomeworkQuestions.pushRef`), чтобы
  `topic_id` для №13 был **корректным subtopic_id**, а не `13.trig`.
- **§5.4 Оба пути добавления.** Убедиться, что №13 попадает в `FIXED_REFS` и далее в `frozen_questions` с
  верным `topic_id` (= subtopic_id) И при выборе с главной, И при прямом добавлении на `hw_create`.
  Критично: `topic_id` в `frozen_questions` = subtopic_id — иначе teacher-review (W13.2c) и слотирование в
  `question_bank` не сойдутся.
- **§5.5 Регрессия части 1.** Конструктор ДЗ (выбор/превью/создание/`frozen_questions`) для №1..12 —
  **без изменений** (longest-prefix-match для part-1 id `9.9.1.1` обязан давать `9.9`, как раньше).
- **§5.6 Verify.** Собрать ДЗ с №13 через UI **оба пути** → `frozen_questions` содержит №13 с верным
  `topic_id`; teacher-review открывает №13. Live через UI — когда поднимется VPS; до этого — на render/
  resolve-харнессе локально (или быстрый unit на функцию resolve/inferTopicId с part-1 и part-2 кейсами).
- **§5.7 governance/print/node-check.** `check_runtime_rpc_registry`/`catalog_reads`/`no_eval` зелёные;
  `node --check` правленых файлов; `print-features` 36/0. Build bump.

## §6. Данные / контракты / миграции
По умолчанию **нет SQL** (фикс во фронт-resolve; каталог/`frozen_questions`-контракт не меняются). Если
recon §5.1 покажет, что нужен каталог-RPC (напр. `catalog_question_lookup_v1` не отдаёт №13) — **red-zone,
stop-ask** перед любой SQL/RPC-правкой.

## §7. Риски и stop-ask
- **Главный риск — регрессия резолва части 1.** `pickQuestionsScopedForList` — **общий движок для всех ДЗ**;
  longest-prefix-match и снятие 2-сегментных допущений не должны изменить поведение для №1..12. §5.5
  обязателен (сверка до/после на part-1 кейсах).
- **`topic_id` №13 = subtopic_id** в `frozen_questions` — иначе ломается teacher-review/`question_bank`
  (то, что c/d ожидают). Проверить явно.
- **stop-ask:** любая каталог-схема/RPC/SQL (вне ожидаемого pure-FE); изменение resolve-логики части 1
  сверх необходимого; файлы вне §4.
- Live-тест полной петли — после поднятия VPS (сейчас сайт недоступен по оплате); это не блокирует код-фикс,
  но финальная приёмка ждёт live.

## §8. Autonomy policy (`CURATOR.md §6.3`)
Свободно без спроса: внутренняя реализация resolve/longest-prefix, имена функций, порядок §5. Stop-ask-confirm:
каталог-схема/RPC/любой SQL; изменение resolve-логики части 1 сверх минимально необходимого; файлы вне §4.
Приёмку (вкл. live-тест после VPS) ведёт куратор.
