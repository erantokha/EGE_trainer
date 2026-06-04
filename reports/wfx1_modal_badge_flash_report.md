# WFX1 — отчёт исполнителя: устранение мигания бейджей в модалке прототипов

Дата: 2026-06-05
Трек: WFX (стабилизация отрисовки модальных бейджей), волна WFX1
Зона: чистый фронт (`tasks/picker.js`), без SQL/RPC/auth/CSS. Не red-zone, значимый рефактор shared-модуля.
План: `WFX1_modal_badge_flash_PLAN.md`
Build id: **`2026-06-05-1`** (`version.json`)

> ⛔️ **НЕ ЗАКОММИЧЕНО, НЕ ЗАПУШЕНО — ЖДЁТ ОПЕРАТОРА.** Вся работа оставлена в
> рабочем дереве (uncommitted). Деплой в Supabase **не нужен** (волна чисто
> отрисовочная, §6). Коммит/пуш — только по явной команде оператора.

---

## 1. Итог

Реализована вся кодовая часть WFX1 (§5.1–§5.7). Мигание бейджей прототипов в модалке
(`#protoPickerModal`) устранено комбинацией **3a** (рендер карточек только с готовой
статистикой) + **3b** (фоновый прогрев кеша) для **обеих ролей**. Промежуточный
ложный «Не решал»/«0/0» больше не показывается ни в одном пути; на холодном кеше —
честная «Загрузка…», затем сразу верные карточки. Governance зелёные, charnet
(student+teacher) зелёный. Изменён только `tasks/picker.js`.

## 2. Изменения в `tasks/picker.js` (numstat +198 −109)

**§5.1 — Разделение `refreshProtoModalBadges` на load + apply:**
- **`loadProtoModalStatsMap(cards, opts)`** — чистая роле-зависимая ЗАГРУЗКА (без DOM)
  → `{ ok, map: Map<unicKey, badgeStat>, mode }`. Ветки: `self` (`loadProtoLast3ForSelf`),
  `teacher` (`loadTeacherStatsForModal` + `loadProtoLast3ForModal` + `aggregateStatsForQuestionIds`),
  `teacher-no-student` (пустая карта), `empty`. badgeStat присутствует для каждой
  карточки с ключом (нули, если попыток нет) — чтобы отличать «подтверждённый ноль»
  от «данных ещё нет».
- **`applyProtoCardBadgeEls(statsEl, dateEl, badgeStat, {ok})`** — единая установка
  плашек (stats + date) из badgeStat; общая для первичного рендера и повторного применения.
- **`applyProtoModalBadges(cards, loadResult)`** — применение карты к DOM (повторный путь).
- **`refreshProtoModalBadges`** — теперь тонкая обёртка `apply(cards, await load(...))`
  с seq-guard (`_PROTO_MODAL_BADGE_SEQ`). Вызывается только из `onTeacherContextChanged`
  (смена студента) — поведение повторного пути сохранено (DoD #4).

**§5.2 — Рендер-с-данными (3a) в `openProtoPickerModal`:** после `buildProtoModalCards`
— `const loadResult = await loadProtoModalStatsMap(cards, { topicId })` ДО вёрстки
формул; «Загрузка…» висит до готовности данных; карточки рендерятся сразу с `badgeStat`;
финальный `await refreshProtoModalBadges(...)` убран (карточки уже корректны). seq-guard
`_PROTO_MODAL_SEQ` сохранён.

**§5.3 — Нейтральный fallback вместо «Не решал»:** `renderProtoModalCard(manifest, card, opts)`
принимает `{ badgeStat, ok }` и строит бейдж через `applyProtoCardBadgeEls`. Инвариант
«не дезинформируем»: «Не решал» — ТОЛЬКО при подтверждённых данных (`ok && badgeStat`);
иначе нейтрально — «—» (+ тултип «Загрузка…»/«Статистика недоступна»), teacher-без-ученика
— «Ученик не выбран». Даже если 3a-путь где-то не сработает (вызов без opts) — fallback
нейтральный, никогда не «Не решал».

**§5.4 — Прогрев teacher proto_last3 (3b):** в worker `warmTeacherModalStatsForStudent`
рядом с `questionStatsForTeacherV1` добавлен прогрев per-unic last-3: `unic =
baseIdFromProtoId(question_id)` → `loadProtoLast3ForModal(sid, unicIds)` →
`_TEACHER_PROTO_LAST3_CACHE`. Тот же worker-pool / seq / TTL / sid-guard.

**§5.5 — Прогрев self по раскрытию раздела (3b):** новый
`warmSelfProtoLast3ForSection(section)` — манифесты подтем раздела →
`buildProtoModalCards` → unic-ключи → `loadProtoLast3ForSelf` → `_SELF_PROTO_LAST3_CACHE`.
По образцу teacher-прогрева: concurrency-лимит (`SELF_PROTO_PRELOAD_CONCURRENCY=4`),
TTL-дедуп (`SELF_PROTO_PRELOAD_TTL_MS=10мин`, по sectionId), отменяемость через
`_SELF_PROTO_PRELOAD_SEQ`. Триггер — в `renderSectionNode` titleBtn click: при раскрытии
(`!wasExpanded`) для `IS_STUDENT_PAGE` фоном `warmSelfProtoLast3ForSection(sec)` (без
блокировки клика); при сворачивании — seq-cancel in-flight. Прогрев **только по
раскрытию раздела**, не на весь каталог (§7 п.2).

**§5.6 — Bump build:** `node tools/bump_build.mjs` → `2026-06-05-1`.

## 3. Governance (§9) — все зелёные

```
node --check tasks/picker.js → OK
check_runtime_rpc_registry   → ok, rows=34 standalone_sql=34 (реестр не менялся — RPC те же)
check_runtime_catalog_reads  → ok (task_js_files=43, critical_files=7)
check_no_eval                → ok
check_trainer_css_layers     → ok
```

## 4. Нерегрессия charnet (§9 / DoD #5) — зелёные

```
npx playwright test e2e/teacher/picker-stats-charnet.spec.js
                    e2e/student/picker-stats-charnet.spec.js
→ 4 passed (16.4s)
```

Снимок charnet — home-stats DOM (аккордеон/forecast/thermo); модалку он не открывает и
секции не раскрывает, поэтому ни рефактор модалки, ни новый click-хендлер прогрева
поверхность снимка не задевают. Аккордеон не регрессировал.

## 5. Scope-lock (§7)

Контентно изменён **только `tasks/picker.js`**. Прочие `M`-файлы в `git status` —
исключительно вывод `bump_build` (проверено python-сканом: `?v=`, `<meta app-build>`,
и `app/config.js` version-константа — всё это build id). 6 защищённых SQL и любые
SQL/RPC/провайдеры не тронуты (волна их не касается). Новых untracked-файлов нет
(кроме этого отчёта).

## 6. Что осталось на оператора (визуальная приёмка, §9)

DoD #1–#2 требуют **визуального** подтверждения отсутствия мигания — это ручной
browser smoke (визуальная оценка тайминга вспышки), который не выражается в
автоматическом снимке и не входит в scope правок (`tasks/picker.js` only, нельзя
добавлять e2e-спеки). Деплой не нужен — гонять можно локально против рабочего дерева:

- **Ученик, холодное:** `python3 -m http.server 8000` → `home_student.html` → войти →
  `Cmd+Shift+R` → первый клик по подтеме с попытками → убедиться: **нет** вспышки
  «Не решал», после короткой «Загрузки…» бейджи сразу верные (X/3 + дата).
- **Ученик, тёплое:** раскрыть раздел → подождать → открыть подтему → мгновенно из кеша.
- **Учитель:** выбрать ученика (запускает прогрев) → открыть подтему (холодно и после
  прогрева) → то же; проверить повторное открытие после смены ученика (повторный refresh).

Код-уровневые гарантии для §6: 3a грузит до рендера; нейтральный fallback исключает
ложный «Не решал»; 3b греет оба кеша; повторный путь сохранён обёрткой.

## 7. Статус публикации (DoD #7)

**НЕ закоммичено, НЕ запушено.** Всё — в рабочем дереве (`HEAD` = `5eee384d`, WMB5).
Ждёт ревью оператора и явной команды на коммит/пуш. Новых untracked-файлов (кроме
отчёта) нет; deploy в Supabase не требуется.
