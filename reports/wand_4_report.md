# WAND.4 — отчёт исполнителя: общие модули (PDF, рисовалка) + финал трека

Дата: 2026-06-12. План — `WAND_4_PLAN.md`. Базис: WAND.3 (`15788808`).
Эконом-режим: смоуки делает исполнитель сам; один батч-verifier на Sonnet
(П-А кодовая сверка + П-Б живая приёмка). Это ФИНАЛЬНАЯ волна трека —
добавляет PDF и рисовалку на готовые экраны и проводит итоговую приёмку.

## 1. Что построено (Ч1–Ч4)

- **Ч1 PDF-экспорт** (`pdf/PdfExporter.kt`, `pdf/PdfExportButton.kt`): порт
  PDFExporter.swift. HTML-лист (charset utf-8, MathJax из assets — не CDN,
  A4 + `page-break-inside:avoid`, рисунки с `CONTENT_BASE_URL`, опц. ответы)
  → offscreen WebView → `createPrintDocumentAdapter` → системный
  `PrintManager.print()` (диалог Android «Сохранить как PDF»/«Отправить» —
  ближе к browser-print веба, чем самописный экспорт). Кнопка `PdfExportButton`
  с диалогом «заголовок / С ответами / Создать PDF». FileProvider в манифесте
  + `res/xml/file_paths.xml`.
- **Ч2 Рисовалка** (`designsystem/DrawOverlay.kt`): порт DrawOverlay.swift на
  Compose Canvas. `DrawKind` (Pen/Line/Rect±fill/Ellipse±fill), объектный
  ластик (`hitTest` по фигуре целиком, tolerance), undo/redo/очистить/закрыть
  со snapshot-стеком, толщины `DRAW_THICKS=[2,4,7,12,20]`, цвет по умолчанию
  синий `0xFF2563EB` + палитра, перемещаемый тулбар, поповер инструмента/
  толщины, при закрытии reset (на экране пусто). `DrawOverlayHost(content)` —
  обёртка с кнопкой-карандашом.
- **Ч3 Точки входа**: PDF-кнопка + рисовалка на тренировке (`TrainingRunScreen`),
  ДЗ run-фазе (`HomeworkScreens`), листе учителя (`TeacherListScreen`),
  предпросмотре учителя (`TeacherPreviewScreen` — PDF «с ответами» по умолчанию
  через `FlowHeaderWithPdf`). Открытие рисовалки — тапом кнопки-карандаша
  (надёжнее E2E_DRAW-хука; testTag'и для adb-приёмки).
- **Ч4 Финальная приёмка**: сквозной прогон, PDF/рисовалка вживую,
  скриншот-сверка с web-reference, этот отчёт + сводка трека, батч-verifier.

## 2. Зафиксированные решения / находки

1. **PDF через системный PrintManager**, а не самописный PdfDocument:
   `PrintDocumentAdapter.LayoutResultCallback`/`WriteResultCallback` имеют
   package-private конструкторы → из Kotlin не наследуются. Системный диалог
   печати даёт «Сохранить как PDF» и «Отправить» — функционально ближе к
   печати в браузере. Разрешено планом §9 П-А.1.
2. **Готча offscreen WebView (дефект D1):** `WebView.post`/`postDelayed` на
   View, НЕ присоединённой к окну, кладут Runnable в `HandlerActionQueue`,
   который исполняется только при attach → НИКОГДА. Фикс: диспетчеризация
   ready/onPageFinished/таймаута через `Handler(Looper.getMainLooper())`.
3. **Готча edge-to-edge Android 15 (дефект D2):** оверлей-экраны (тренировка,
   лист/предпросмотр учителя) рендерятся ВНЕ `Scaffold`, поэтому не получали
   status-bar inset (tab-экраны получают его через `Scaffold.contentWindowInsets`).
   Фикс — обёртка точек запуска оверлеев в `RootNavigation` в
   `windowInsetsPadding(WindowInsets.systemBars)` (один корневой фикс, не в
   каждой шапке).
4. **Готча Popup над жестовым Canvas (дефект D3):** `Popup`-окно селектора
   инструмента над активным `detectDragGestures`-Canvas не открывалось
   (закрывалось в кадре), тогда как идентичный `Popup` палитры цвета работал.
   Корень не локализован полностью; принято робастное решение — селектор
   инструмента переведён на INLINE-рендер над тулбаром (обычный layout + слой-
   перехватчик тапа «мимо»), без зависимости от оконного `Popup`. Палитра
   цвета оставлена на `Popup` (работает). Бонус: inline testTag'и
   `drawTool_*` стали обычными resource-id (видны adb-приёмке).

## 3. Write-следы на проде

PDF и рисовалка — клиентские, без сети (кроме загрузки картинок задач с
`CONTENT_BASE_URL` в PDF-HTML). Сквозной прогон — read-only. Деструктива нет.

## 4. Проверки

- `:app:assembleDebug`, `:app:assembleRelease` — зелёные (release APK 9.1 МБ).
- `:core:test` — 52 tests, 0 failures, 0 errors (ядро не трогали).
- Живые смоуки на эмуляторе (`emulator-5554`, Android 15): PDF-диалог →
  системная печать → превью с рисунками и ответами; рисовалка (штрих, выбор
  инструмента, прямоугольник, ластик, undo, очистка, закрытие+reset);
  insets шапки. Скриншоты в `reports/wand_4/`.
- Батч-verifier (Sonnet) — П-А + П-Б, затем независимая ре-верификация
  фиксов — вердикты ниже.

## 5. Вердикт батч-verifier'а (Sonnet)

### 5.1 Первичная приёмка — П-А PASS, П-Б FAIL (3 дефекта)

**П-А кодовая сверка — PASS:** PdfExporter (utf-8, MathJax из assets, A4 +
page-break, рисунки `CONTENT_BASE_URL`, ответы при `withAnswers`, PrintManager,
FileProvider+file_paths); PdfExportButton (диалог, `answersDefault=true` в
предпросмотре учителя); DrawOverlay (kinds, hitTest ластика, undo/redo/clear/
reset, THICKS, синий по умолчанию, перемещаемый тулбар, reset при закрытии —
расхождение с iOS: палитра 8 цветов вместо системного ColorPicker, допустимо
Compose-ограничением); точки входа во всех 4 экранах; assembleDebug/Release
exit 0; core:test 52/0.

**П-Б живая приёмка — FAIL (DoD §4 заблокирован):**
- **D1 (major)** — PDF висит «Готовим PDF…», `PrintManager.print()` не
  вызывается (offscreen WebView callbacks не срабатывают).
- **D2 (major)** — шапки экранов не учитывают status-bar inset (edge-to-edge
  Android 15) → `pdfButton` под статус-баром, недостижима.
- **D3 (minor)** — поповер `drawToolBtn` мгновенно закрывается (Canvas
  поглощает dismiss) → инструмент нельзя переключить через UI.
- Сквозные прогоны (ученик/учитель), скриншот-сверка с web-reference,
  git-скоуп — PASS; FATAL = 0.

### 5.2 Фиксы исполнителя (по корню)

- D1 → `Handler(Looper.getMainLooper())` вместо `WebView.post/postDelayed`.
- D2 → `windowInsetsPadding(WindowInsets.systemBars)` на оверлеях в
  `RootNavigation`.
- D3 → селектор инструмента на inline-рендер над тулбаром (вместо `Popup`).

### 5.3 Независимая ре-верификация фиксов — PASS (Sonnet)

- **D1 PASS** — тап «Создать PDF» → фокус `printspooler/PrintActivity`,
  logcat: `PdfManipulationService` + `print_job_*.pdf` (PDF реально
  отрендерен), превью показало «Подборка задач» с задачей и ответом (1/1).
  Скриншоты `reverify_pdf_dialog.png`, `reverify_pdf_print.png`,
  `fix_03_pdf_preview.png` (рисунки + ответы 11/109 зелёным).
- **D2 PASS** — `pdfButton` topY=129px, ниже статус-бара, кликабельна.
  `reverify_header.png`.
- **D3 PASS** — inline-поповер над тулбаром («инстр.:»/«толщина:»,
  `drawTool_*` как resource-id), выбор прямоугольника + рисование, reset
  после закрытия. `reverify_tool_popover.png`, `reverify_rect.png`,
  `reverify_closed.png`.
- **Сборки PASS**; регрессий нет.

**Итог WAND.4: PASS** — оба major-дефекта и minor закрыты, проверены
независимо.

## 6. Скоуп / остаток

Изменения только в `android/EGETrainerApp/app/**`, `reports/wand_4*`,
`WAND_4_PLAN.md`, `GLOBAL_PLAN.md`. Остаток оператора — см. сводку трека §7.

---

## 7. Итоговая сводка трека WAND (4 волны) — Android-приложение

**Цель достигнута:** нативное Android-приложение (`android/EGETrainerApp`,
Kotlin + Jetpack Compose) с полным функциональным и визуальным паритетом
сайту и iOS-приложению EGE-тренажёра. Поведенческий эталон — iOS, источник
логики — веб, визуальный референс — мобильный веб.

### Волны (все ✅, эконом-режим с WAND.2)

| Волна | Содержание | Коммит | Verifier |
|-------|-----------|--------|----------|
| WAND.0 | Среда + ядро (`:core` чистый Kotlin/JVM) + harness | (см. GLOBAL_PLAN §6.6) | П-Т1…П-Т8 PASS, harness 54/0 |
| WAND.1 | Дизайн-система + Auth (Google PKCE, EncryptedPrefs) + каркас | `6e851315` | П-У1…П-У7 PASS |
| WAND.2 | Ученик целиком (главная, подбор, тренировка, отчёт, ДЗ, статистика) | `e8fd08ac` | батч PASS |
| WAND.3 | Учитель целиком (главная, модалка, предпросмотр, ДЗ, ученики, карточка) | `15788808` | 16/16 PASS |
| WAND.4 | PDF-экспорт + рисовалка + точки входа + финал | (этот коммит) | П-А PASS, П-Б→3 фикса→ре-верифай PASS |

### Достигнутый паритет

- **Архитектура:** 3-модульный Gradle (`:core` pure-JVM, `:harness`, `:app`
  Compose). Все RPC/модели сверены с продом (harness 54/0).
- **Контент/формулы:** vendored MathJax (байт-в-байт с iOS) в WebView, SVG/
  растровые рисунки задач.
- **Ученик:** подбор (StudentPickEngine, фильтры через teacher-RPC self-гейт,
  «Выбрать всё» per-section), тренировка с черновиком и локальной проверкой,
  отчёт «только неверные» + «решить аналог», ДЗ, статистика, прогноз ЕГЭ.
- **Учитель:** выбор ученика с ранжированием, аккордеон teacher-scope,
  модалка прототипов с last-3+дата, предпросмотр «Показано X из Y», создание/
  назначение ДЗ, session-ссылки, мои ученики (invite/«Проблемные»), карточка
  + просмотр попытки.
- **Общее:** PDF-экспорт листа (формулы+рисунки+опц.ответы) через системную
  печать, рисовалка-оверлей (перо/фигуры/ластик/undo/толщины/цвет).
- **Платформенное:** Auth lifecycle + EncryptedSharedPreferences (аналог
  Keychain), deep link `egetrainer://auth-callback`, edge-to-edge insets,
  testTagsAsResourceId для скриптовой adb-приёмки.

### Остаток оператора

1. **Ревью + коммит/решение о пуше** (исполнитель не пушит).
2. **Google OAuth redirect** — добавить `egetrainer://auth-callback` в
   разрешённые redirect (Supabase + Google console), как и для iOS.
3. **Live-тесты** на физическом устройстве (печать на реальный принтер/
   «Сохранить в Документы», письма-приглашения, OAuth-полный цикл).
4. **Подписание + публикация** в Google Play (release APK сейчас unsigned) —
   отдельный трек, вне WAND.
5. **Иконка/брендинг** приложения (сейчас системная заглушка).
