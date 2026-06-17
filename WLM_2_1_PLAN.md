# WLM.2.1 — Полировка флагов занятия + «Очистить конспект»

Follow-up к WLM.2 по комментариям оператора (2026-06-17). Трек WLM (Режим занятия).
Пункты 1–3 — чистый фронт (не red-zone). Пункт 4 — RED-ZONE (новый destructive RPC; SQL применяет оператор).

## §1. Цель
1. Заменить эмодзи-флаги на современные line-иконки (Lucide-стиль).
2. Мгновенная подсказка при наведении через `data-tip` (как на главной), вместо нативного `title`.
3. Тот же ряд флаг-иконок — внутри карточки-рисовалки, в панели сверху справа от масштаба (150%).
4. Кнопка «Очистить конспект» в полосе Режима занятия — удаляет **черновик** (confirm-подтверждение).

## §2. Решения оператора
- Кнопка называется «**Очистить конспект**», удаляет именно **черновик** (не опубликованный).
- Подтверждение через `confirm()` — ок.
- Дефолты исполнителя (можно скорректировать по скриншоту): иконки line-стиль + цветовая семантика
  (clean=зелёный, hint=янтарный, arith=оранжевый, lost=красный) в активном состоянии; в панель-рисовалку
  кладём только 4 флага (дропдаун «Навык» остаётся на карточке списка).

## §3. Затрагиваемые файлы
**Фронт (пп.1–3):**
- `tasks/list.js` — `LESSON_FLAGS` (SVG-иконки), `data-tip` вместо `title`; шов с рисовалкой (инжект тулбара).
- `tasks/trainer/pages/list.css` — стили `.lf-btn` под SVG + активные цвета; тулбар в фокус-баре.
- `app/ui/card_focus.js` — нейтральный шов: слот + события входа/выхода фокуса (без lesson-логики в общем модуле).

**Фронт + backend (п.4):**
- `tasks/list.js` — кнопка «Очистить конспект» + confirm + сброс состояния/флагов.
- `tasks/trainer/pages/list.css` — стиль кнопки.
- `app/providers/konspekts.js` — обёртка `deleteKonspekt` + локальная очистка IndexedDB.
- `docs/supabase/konspekts.sql` — **новый RPC** `konspekt_delete_v1(p_konspekt_id)` (draft-only, owner+consent).
- `docs/supabase/runtime_rpc_registry.md` — регистрация RPC (51→52).
- `app/config.js` + `?v=` — `node tools/bump_build.mjs`.

**Не трогаем:** `base.css` (`data-tip` уже там), ученическую `konspekts.html`, picker-движок, auth, общий print.css.

## §4. Пошаговый план
- **§4.1** Иконки: SVG-набор в `LESSON_FLAGS`, рендер через innerHTML; CSS `.lf-btn svg` + активные цвета per-flag.
- **§4.2** Тултип: `data-tip` на каждую флаг-иконку (и в рисовалке), убрать `title`. Проверить, что не вылезает за край.
- **§4.3** Рисовалка: `card_focus.js` отдаёт слот `.dro-focus-extra` в `.dro-focus-bar` + события `card-focus-enter/exit` ({card, qid}); `list.js` (gate: lesson-active) инжектит ряд флагов, синхронит с `flagState` по qid.
- **§4.4** Backend: `konspekt_delete_v1` (security definer, owner+consent, status='draft' иначе ошибка; cascade убирает снимки и `lesson_items`). Реестр + governance зелёный. **SQL на прод не применяю.**
- **§4.5** Очистка: провайдер `deleteKonspekt` (RPC + `idbClear`); кнопка в полосе + `confirm()`; по успеху — сброс `LESSON` (konspekt=null, count=0, flagState.clear), перерисовка пустых флагов, статус.
- **§4.6** Bump + governance (§9 WLM.2) + скриншоты + отчёт `reports/wlm_2_1_report.md`.

## §5. Проверки
```
node tools/check_runtime_rpc_registry.mjs
node tools/check_runtime_catalog_reads.mjs
node tools/check_no_eval.mjs
node tools/check_trainer_css_layers.mjs
cd tests && node print-features.js
node tools/bump_build.mjs
```
Скриншоты: (1) новые иконки на карточке + тултип; (2) тулбар флагов в панели-рисовалке справа от масштаба;
(3) кнопка «Очистить конспект» + диалог confirm.

## §6. Риски / stop-ask
- П.4 — RED-ZONE (destructive RPC над `konspekts`). SQL применяет оператор; двухуровневый DoD (фронт + бэкенд).
- `card_focus.js` — общий модуль: добавляем только нейтральный слот/события, без lesson-специфики (иначе stop-ask).
- `?v=` обязателен (`bump_build`). data-tip — только десктоп (на мобиле выключен), следим за overflow у крайних иконок.

## §7. DoD
**Уровень A (исполнитель сейчас):** пп.1–3 реализованы; SVG-иконки + data-tip + тулбар в рисовалке;
кнопка «Очистить конспект» с фронт-логикой против контракта RPC; SQL-исходник `konspekt_delete_v1` +
реестр; governance зелёные; bump; скриншоты; отчёт.
**Уровень B (после применения бэкенда оператором):** живая очистка черновика убирает конспект и флаги;
повторный вход — конспект пуст.
