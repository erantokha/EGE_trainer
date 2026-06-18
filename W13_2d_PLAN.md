# W13.2d — ДЗ part-2 SOLVE UX (ученик решает №13 внутри ДЗ)

Завершающая под-волна W13.2: довести часть 2 в **активном решении ДЗ**. Скорее всего **frontend-only**
(вся инфра баллов готова и залита в W13.2b/c); узкая правка submit-пути — только если покажет recon §5.1
(тогда red-zone). Контекст/решения — `docs/navigation/part2_integration_contract.md`; W13.2 —
`reports/w13_2/W13_2c_REPORT.md`; модель баллов — `docs/supabase/part2_attempt_reviews.sql`.

## §1. Цель
Ученик решает №13 **внутри ДЗ** с тем же опытом, что в тренажёре: условие а/б, кнопка «показать эталон»,
самооценка 0/1/2 (source='hw'), — а не базовое текстовое поле. Часть 2 при этом **не искажает «X/Y верных»**
ДЗ. Замыкает петлю «ученик решил №13 в ДЗ → самооценка → учитель подтвердил» (teacher-review уже готов в
W13.2c).

## §2. Контекст
- **Solve-вид `hw.js`** (активное решение, ~`hw.js:1676` `setStem(stem, q.stem)` + текстовый input
  `#taskList input[type=text][data-idx]`) — **НЕ part-2-aware**: №13 показывается базово (литеральный `<br>`)
  + поле для текстового ответа, которого у части 2 нет.
- **Разбор/teacher-review** (`renderReviewCards`, ~`hw.js:2088–2208`) — **уже part-2-aware** (W13.2c):
  условие а/б + эталон + контрол баллов. **Логику не трогаем**, только не конфликтуем.
- **Tally при сдаче** (~`hw.js:1648–1649`): `total = SESSION.questions.length`, «пусто» = вопросы без
  `chosen_text` → part-2 (без текста) сейчас попал бы в «пустые» и в знаменатель X/Y.
- Инфра баллов **готова и залита**: таблица `part2_attempt_reviews` + RPC `submit_part2_self_score_v1`
  (`source`/`hw_attempt_id` уже в сигнатуре) + teacher-confirm. Хелперы — `tasks/part2_render.js`.
  `q.part=2` уже маркируется при сборке (~`hw.js:1519`); `isPart2Question` импортирован. `attempt_id`
  доступен после `start_homework_attempt`.

## §3. Out of scope
- НЕ teacher-review (готово, W13.2c) — только не сломать.
- НЕ модель баллов/таблицы/scoring-RPC (есть и залиты, W13.2b/c).
- НЕ менять solve/scoring/разбор части 1 (№1..12) — без регресса.
- **Фото-прикрепление решения** (PRODUCT_VISION §4) — future, отдельная волна (Storage + RLS).
- Глубокая аналитика teacher_score (там §5.0) — future.

## §4. Затрагиваемые файлы (точно — после recon §5.1)
- `tasks/hw.js` — solve-рендер (ветка part-2), tally при сдаче, result-summary.
- `app/providers/part2.js` — `submitPart2SelfScore` (есть; подключить в `hw.js`, если ещё не импортирован).
- `tasks/hw.html` / `tasks/trainer/part2.css` — если нужны mount/стили (part2.css уже подключён к hw.html).
- (Только если recon §5.1 потребует) `docs/supabase/submit_homework_attempt_v2.sql` /
  `trg_homework_attempts_to_answer_events.sql` — обработка part-2 в payload. **red-zone, stop-ask.**

## §5. Пошаговый план
> **Task-tracking (обязательно, `CURATOR.md §6.1`):** TaskList по §5.1–§5.7, обновлять статусы.

- **§5.1 RECON (read-only).** Как `submit_homework_attempt_v2` + триггер обрабатывают payload, в котором
  part-2 вопросов нет (или они помечены не-gradeable); как строятся solve-tally (total/«пусто»/correct) и
  result-summary; точная точка врезки part-2 в solve-рендер. **Вывод: pure-FE или + узкая write-path
  правка.** `BAD_PAYLOAD` из live-харнесса (`reports/w13_2/_live_teacher_harness.cjs`) намекает на строгую
  валидацию payload — проверить. **stop-ask перед любой правкой submit/триггера (red-zone).**
- **§5.2 Solve-рендер part-2.** Ветка `isPart2Question(q)` в активном solve-вью: условие через
  `renderPart2Stem` (а/б); **вместо текстового поля** — «показать эталон» (`buildPart2EtalonBlock`) +
  контрол самооценки 0/1/2. Зеркалит тренажёр (эталон-во-время-решения для части 2 = by design: модель
  «решил на бумаге → сверил с эталоном → честная самооценка»). №1..12 — прежним путём (`setStem` + input).
- **§5.3 Самооценка (source='hw').** `submitPart2SelfScore(qid, score, hw_attempt_id, 'hw')` →
  `submit_part2_self_score_v1`; статус карточки «на проверке учителя» до подтверждения. Идемпотентно
  (переоценка = update self_score; не снимает teacher_confirmed — гарантируется самой RPC).
- **§5.4 Tally/сдача.** part-2 исключить из «пусто/total/correct» (X/Y части 1 не меняется); в payload
  `submit_homework_attempt_v2` part-2 НЕ как gradeable correct/incorrect (омит либо маркер — по recon §5.1).
- **§5.5 Result-summary.** Часть 2 — отдельным блоком («№13: самооценка N · на проверке учителя»), НЕ в
  «X/Y верных». Разбор после сдачи (`renderReviewCards`) уже part-2-aware — переиспользуется.
- **§5.6 Регрессия + governance.** Часть 1 solve/submit/X-Y/разбор — без изменений; teacher-review (W13.2c)
  не сломан; `check_runtime_rpc_registry`/`catalog_reads`/`no_eval` зелёные; `node --check`; print 36/0.
- **§5.7 Evidence.** Скриншоты: ДЗ-solve №13 (условие + эталон + самооценка), экран сдачи (X/Y части 1
  корректен, часть 2 отдельно), разбор. **Live-прогон**: расширить `_live_teacher_harness.cjs` —
  ученик ставит self_score в ДЗ (source='hw', hw_attempt_id) → учитель подтверждает → проверить строку
  `part2_attempt_reviews` (позитив + чистка).

## §6. Данные / контракты / миграции
По умолчанию **нет** (инфра баллов есть и залита). Если recon §5.1 покажет, что submit-путь надо тронуть —
**red-zone**: через `docs/supabase/*` + `runtime_rpc_registry`, approval оператора, идемпотентно, без
destructive. Тогда деплой SQL — оператор (SQL первым, FE вторым).

## §7. Риски и stop-ask
- **Главный риск — регрессия части 1** solve/submit/tally/разбор: §5.6 обязателен; ветки строго гейтить
  (`isPart2Question`/`part===2`).
- Эталон-во-время-решения **только для части 2** (by design); для части 1 эталон в solve НЕ показывать.
- `self_score` в ДЗ привязывать к `hw_attempt_id` (source='hw'), не путать со свободной попыткой (source='test').
- **stop-ask** перед любой правкой `submit_homework_attempt_v2`/триггера (red-zone write-path); перед файлами
  вне §4; при заходе в §3 (фото/аналитика/часть-1).
- Не сломать teacher-review (W13.2c) — он читает `frozen_questions`; solve-правки не должны менять их.

## §8. Autonomy policy (`CURATOR.md §6.3`)
Свободно без спроса: вёрстка part-2-карточки в solve-вью, имена внутренних функций, порядок §5, формат
строки статуса/result-блока в пределах per-page CSS. Stop-ask-confirm: любая правка write-path
(`submit_homework_attempt_v2`/триггер) и вообще SQL; изменение логики части 1; teacher-review; файлы вне §4;
фото/аналитика. Деплой SQL — только оператор (если §5.1 потребует).
