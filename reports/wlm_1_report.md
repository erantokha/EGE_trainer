# WLM.1 — отчёт исполнителя (Режим занятия + Конспект-PDF v1)

Дата: 2026-06-17 · Build после волны: `2026-06-17-1-050747` · Режим: автономный, red-zone.
План: `WLM_1_PLAN.md`. Артефакты: `reports/wlm_1/`.

> **Статус:** Уровень A (код + SQL-исходники, локальная верификация) — **закрыт**.
> Уровень B (живая приёмка) — **ждёт применения бэкенда оператором** (SQL + Storage-bucket + proxy `/storage/v1`).
> Коммит/пуш — по решению оператора (не делал).

---

## 0. Главное отклонение от плана (согласовано через stop-ask)

§6 плана предполагал RPC `konspekt_signed_url_v1(...) → text`, который SQL-функция якобы выдаёт
подписанный Storage-URL, и «storage-RLS не усложняем». **Это нереализуемо:** подписанный
Storage-URL — JWT storage-api сервиса; чистая SQL-функция его не выпускает, а в проекте нет
`supabase-js` SDK (только raw-PostgREST `supabase-rest.js`). Сработал stop-ask §7/10(б).

**Оператор выбрал вариант A** (рекомендованный): доступ к файлам гейтят `storage.objects`
RLS-политики; подписанный URL клиент мьютит сам через Storage REST. Хост Storage — прокси
`api.ege-trainer.ru` (оператор добавит форвард `/storage/v1/*`), чтобы PDF открывался у РФ-учеников.

Итог: RPC стало **5** (без `konspekt_signed_url_v1`); list-RPC возвращают `path`, клиент подписывает.
Остальной scope плана — без изменений.

---

## 1. Сделано пофайлово

**Backend (исходник, применяет оператор):**
- `docs/supabase/konspekts.sql` — **новый**. Таблицы `konspekts` + `konspekt_snapshots` (+ индексы,
  partial-unique `uq_konspekts_draft_per_day`), RLS на обе таблицы, 5 RPC (security definer,
  `search_path=public`, revoke anon / grant authenticated), bucket `konspekts` (приватный, PNG/PDF,
  20MB), 2 политики `storage.objects`. Идемпотентно (`create … if not exists`, `drop … if exists`,
  `on conflict`). SQL разбит на 2 транзакции (таблицы/RPC; затем Storage), чтобы падение на политике
  не откатывало таблицы.
- `docs/supabase/runtime_rpc_registry.md` — секция «Konspekts (Lesson mode / WLM.1)» с 5 строками
  (owner `homework-domain` — нет owner-зоны «konspekt» в `VALID_OWNERS` валидатора; ближайшая).
  Счётчики итога 42→47. `check_runtime_rpc_registry.mjs` зелёный (`rows=47 standalone_sql=47`).

**Frontend:**
- `app/ui/draw_overlay.js` — добавлен экспорт `captureCardBlob(cardEl)` → PNG-blob карточки
  (dom-to-image-more + наложение слоя штрихов `cMain`, если рисовалка активна). Хелперы
  `loadDTI`/`__loadImg` вынесены на module-level (clipboard-захват `copyWindow` **не изменён** —
  работает через те же хелперы). Узлы `data-capture-hide` исключаются из снимка.
- `app/providers/konspekts.js` — **новый** провайдер: 5 RPC-обёрток (`konspektStart`,
  `addCardSnapshot`, `publishKonspekt`, `studentKonspektsList`, `teacherKonspektsForStudent`),
  Storage REST `uploadObject`/`signedUrl`/`fetchObjectBlob` (raw fetch, токен из `getSession()`,
  хост из `CONFIG.supabase.url` — `supabase-rest.js` НЕ трогался), `listSnapshots` (fallback-чтение),
  `buildKonspektPdfBlob` (jsPDF CDN-ESM, A4, хедер кириллицей через canvas → корректный текст).
- `tasks/list.html` — добавлены `data-capture-hide` на print-строку; кнопка `+ В конспект` и
  панель монтируются из `list.js` (HTML-каркас не раздут).
- `tasks/list.js` — Режим занятия: тумблер сверху, student-контекст (`TEACHER_STUDENT_ID` из
  подбора ИЛИ дропдаун `list_my_students`), кнопки `+ В конспект` на карточках (`captureCardBlob` →
  upload → `konspekt_add_snapshot_v1`), индикатор «N в конспекте», «Собрать конспект»
  (PDF → publish → ссылка «Открыть PDF»). Только для учителя (`readCachedRole`/`TEACHER_STUDENT_ID`).
- `tasks/trainer/pages/list.css` — стили `.lesson-bar`/тумблер/`.konspekt-add-btn` (новые токены,
  без `@media print`, import-discipline не тронут). `check_trainer_css_layers.mjs` зелёный.
- `tasks/konspekts.html` + `tasks/konspekts.js` — **новые**. Ученическая страница «Конспекты»:
  `student_konspekts_list_v1` по датам, «Открыть PDF» через подписанный URL (попап открывается
  синхронно до await — не режется блокировщиком). Сайдбар/хедер 1-в-1 с `list.html`.
- `app/ui/header.js` — пункт `Конспекты` в `#userMenu` (зеркало `menuMyHw`: только для ученика,
  навигация на `tasks/konspekts.html`). **Только добавление пункта** (scope-lock соблюдён).
- `tasks/student.html` + `tasks/student.js` — раздел «Конспекты занятий» в карточке ученика
  (сворачиваемый, ленивый, `teacher_konspekts_for_student_v1`), «Открыть PDF» для published.
- `app/config.js` + весь `?v=` — `node tools/bump_build.mjs` → build `2026-06-17-1-050747`.

---

## 2. Финальные контракты

### Таблицы
- `public.konspekts(id, teacher_id, student_id, title, lesson_date, status['draft'|'published'],
  pdf_path, created_at, published_at)` — RLS: teacher видит своё под consent; student видит свои
  published.
- `public.konspekt_snapshots(id, konspekt_id, storage_path, ordinal, question_id, created_at)` —
  RLS: наследует владение konspekt_id.

### RPC (security definer, revoke anon / grant authenticated)
1. `konspekt_start_v1(p_student_id uuid) → table(<konspekt> + snapshot_count int)` — создать/вернуть
   сегодняшний черновик под consent.
2. `konspekt_add_snapshot_v1(p_konspekt_id uuid, p_storage_path text, p_ordinal int, p_question_id text)
   → konspekt_snapshots` — гейт: owner + consent + draft + path-префикс `{tid}/{sid}/{kid}/`.
3. `konspekt_publish_v1(p_konspekt_id uuid, p_pdf_path text) → konspekts` — published + pdf_path +
   published_at (валидация префикса + непустой конспект).
4. `student_konspekts_list_v1() → table(id, lesson_date, title, pdf_path, published_at, teacher_name,
   snapshot_count)` — published конспекты `auth.uid()`-ученика.
5. `teacher_konspekts_for_student_v1(p_student_id uuid) → table(id, lesson_date, title, status,
   pdf_path, published_at, snapshot_count)` — конспекты учителя для ученика под consent.

### Storage (bucket `konspekts`, приватный)
- Path: `{teacher_id}/{student_id}/{konspekt_id}/snap_<n>.png` и `…/konspekt.pdf`.
- `storage.objects` RLS: учитель — RW по своему префиксу `[1]=auth.uid()`; ученик — read, если
  `[2]=auth.uid()` И объект принадлежит published-конспекту, где он student (`exists` по `konspekts`).

---

## 3. Доказательства уровня A

**Governance (все зелёные, post-bump):**
```
check_runtime_rpc_registry  → rows=47 standalone_sql=47 snapshot_only=0 missing_in_repo=0
check_runtime_catalog_reads → ok (task_js_files=45)
check_no_eval               → ok
check_trainer_css_layers    → ok (base !important=33, pages !important=88)
tests/print-features.js     → Прошло: 36, Упало: 0
```

**Браузер-smoke (Level A, без бэкенда) — `reports/wlm_1/smoke.html` + `drive_smoke.cjs`:**
Реальные стили + реальные `captureCardBlob` и `buildKonspektPdfBlob` на sample-данных.
```
RESULT {"captureOk":true,"captureBytes":48655,"pdfOk":true,"pdfBytes":83154,"error":null}  → SMOKE PASS
```
Скриншоты:
- `reports/wlm_1/shot_lesson_bar.png` — тумблер «Режим занятия» + панель + кнопка «✓ В конспекте».
- `reports/wlm_1/shot_student_konspekts.png` — карточки «Конспекты» у ученика (дата/учитель/N карточек).
- `reports/wlm_1/shot_pdf_harness.png` — PASS-статус + видимый PDF (хедер кириллицей + захваченная карточка).

**Реальный `tasks/list.html` (headless, `reports/wlm_1/_listcheck.cjs`):** 0 ошибок резолва
модулей (новые импорты резолвятся); единственная ошибка — ожидаемый `AUTH_REQUIRED` каталога
(нет сессии offline). Полная отрисовка панели на реальной странице требует auth+каталог (Level B).

---

## 4. Что ждёт оператора (Уровень B)

### 4.1 Применить SQL
```
docs/supabase/konspekts.sql   (идемпотентно; создаёт таблицы, RLS, 5 RPC, bucket konspekts, storage-политики)
```
Bucket и `storage.objects`-политики создаются **этим же SQL** (`insert into storage.buckets … on conflict`
+ `create policy … on storage.objects`). Отдельно руками bucket создавать не нужно — достаточно прогнать SQL
из SQL-editor под admin-ролью.

### 4.2 Прокси `/storage/v1/*`
Настроить nginx на `api.ege-trainer.ru`, чтобы он форвардил `/storage/v1/*` на
`https://knhozdhvjhcovyjbjfji.supabase.co/storage/v1/*` (как уже форвардит `/rest/v1`, `/auth/v1`).
Без этого Storage (заливка/подпись/скачивание PDF) у РФ-учеников за блокировкой `*.supabase.co` не работает.
CSP уже разрешает оба хоста.

### 4.3 Живая приёмка (B1–B5 плана)
1. Учитель в Режиме занятия добавляет 2–3 карточки → «Собрать конспект» → PDF появляется у **этого**
   ученика в «Конспекты», открывается.
2. Другой ученик/аноним не видит конспект и не открывает его Storage-URL.
3. Черновик до публикации ученику не виден.
4. Учитель видит конспект в карточке ученика.
5. e2e teacher+student (новые `e2e/*/wlm1-konspekt.spec.js`) — после применения бэкенда.

---

## 5. Замечания / границы
- `konspekt_signed_url_v1` из §6 НЕ создан (см. §0) — это согласованное отклонение.
- jsPDF/dom-to-image — CDN-ESM dynamic import (паттерн `draw_overlay.js`), отдельный vendor-файл
  не вводился (§4 это разрешал).
- После публикации добавление в тот же конспект закрыто (status=published → `add_snapshot` требует
  draft); новый конспект за тот же день — повторным включением тумблера (partial-unique исключает
  published). Редактирование снимков — out of scope v1 (как и в плане).
- `bump_build` затронул также `android/**/build/**` (артефакты тестов Android) — стандартное
  поведение скрипта, не относится к WLM.1.
- Коммит/пуш не делал (по границе деплоя плана).
