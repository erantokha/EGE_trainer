# WAND_4_PLAN — волна 4: общие модули (PDF, рисовалка) + финальная приёмка трека

Дата: 2026-06-12. Трек: WAND (`WAND_PLAN.md`). Базис: WAND.3 (`15788808`).
Статус: утверждён оператором («волна четыре в эконом-режиме»).

**Эконом-режим** (как WAND.2/3): смоуки делает исполнитель сам; один
батч-verifier на Sonnet (П-А кодовая сверка + П-Б живая приёмка + сквозной
прогон). Это ФИНАЛЬНАЯ волна трека — добавляет PDF и рисовалку на готовые
экраны и проводит итоговую приёмку паритета.

## 1. Цель

Два кросс-режущих модуля + финал: (1) PDF-экспорт листа задач (HTML →
offscreen WebView → PrintDocumentAdapter → файл → share) с диалогом
«заголовок / с ответами»; (2) рисовалка-оверлей (Compose Canvas: перо/
линия/прямоугольник/эллипс контур+заливка/объектный ластик, толщины
THICKS=[2,4,7,12,20], undo/redo/очистить/закрыть, перемещаемый тулбар,
системный ColorPicker). Точки входа на готовых экранах тренировки/ДЗ/
листа/предпросмотра. Затем — финальная приёмка трека: сквозной прогон
обеих ролей, скриншот-сверка с web-reference/iOS, итог.

## 2–4. Контекст / Out of scope / Файлы

Контекст: все экраны WAND.1–3 готовы; PDF/рисовалка навешиваются сверху.
Out of scope: select/drag фигур и вставка картинок в рисовалке (нет и в
iOS — решение оператора); правки веб/SQL/iOS/:core; публикация в Play.
Файлы: только `android/EGETrainerApp/app/**` (designsystem/DrawOverlay.kt,
pdf/PdfExporter.kt, точки входа в screens/*, AndroidManifest FileProvider
+ res/xml/file_paths.xml), `reports/wand_4*`, этот план. `:core` — только
при дефекте.

## 5. Чек-лист (TaskCreate Ч1–Ч4)

- **Ч1. PDF-экспорт** (`pdf/PdfExporter.kt` + кнопка): порт PDFExporter.swift —
  HTML-лист (заголовок, нумерованные условия с MathJax из assets, рисунки,
  опц. ответы, A4 page-break-inside:avoid) → offscreen WebView →
  `createPrintDocumentAdapter` → PDF-файл в cacheDir → share через
  FileProvider. Кнопка-диалог «заголовок / с ответами / Создать PDF /
  Поделиться» (PDFExportButton). FileProvider в манифесте + file_paths.xml.
- **Ч2. Рисовалка** (`designsystem/DrawOverlay.kt`): порт DrawOverlay.swift
  на Compose Canvas — DrawShape (pen/line/rect±fill/ellipse±fill) + hitTest
  объектного ластика, DrawBoard (tool/color/width, undo/redo/clear/reset,
  snapshot-стек), оверлей с кнопкой-карандашом, перемещаемый тулбар,
  поповер инструмент+толщина, системный ColorPicker. Модификатор
  `Modifier`-обёртка или Box-overlay `DrawOverlayHost`.
- **Ч3. Точки входа**: PDF-кнопка и рисовалка на экранах — тренировка
  (TrainingRunScreen), ДЗ (HomeworkRunScreen run-фаза), лист учителя
  (TeacherListScreen), предпросмотр учителя (TeacherPreviewScreen — PDF
  «с ответами» по умолчанию). E2E_DRAW хук (DEBUG) для приёмки рисовалки.
- **Ч4. Финальная приёмка трека + отчёт**: сквозной прогон обеих ролей,
  PDF сгенерирован и расшарен (скриншот диалога + факт файла), рисовалка
  поверх задачи (скриншот со штрихами), скриншот-сверка ключевых экранов
  с `ios/EGETrainerApp/Screenshots/web-reference/`, `reports/wand_4_report.md`
  + итоговая сводка трека WAND (что достигнуто, паритет, остаток оператора),
  батч-verifier на Sonnet.

## 6. Контракты

Без новых RPC/контрактов. PDF/рисовалка — клиентские, без сети (кроме
загрузки картинок задач с contentBaseURL в PDF-HTML). Vendored MathJax —
уже в assets (WAND.1). Write на прод в этой волне НЕ требуется (PDF/draw
локальны); сквозной прогон — read-only.

## 7. Stop-ask

Наследуется из `WAND_PLAN.md §7`. Если PrintDocumentAdapter/PDF на
эмуляторном WebView рендерит пусто/без формул — диагностировать (как SVG-
готча WAND.1), решение внутри скоупа, отметить. Два подряд FAIL verifier'а
по неясной причине → stop-ask.

## 8. DoD

1. Ч1–Ч3 реализованы; Ч4 пройдена.
2. Батч-verifier (Sonnet, §9) — PASS.
3. assembleDebug + assembleRelease зелёные; :core/harness без регресса.
4. PDF: файл создаётся, содержит условия (и ответы при опции), share
   работает. Рисовалка: штрихи/фигуры/ластик/undo/очистить/закрыть.
5. Скриншот-сверка: ключевые экраны Android визуально соответствуют
   web-reference/iOS (light).
6. Скоуп: android/** + reports/wand_4* + план.

## 9. План батч-проверки (Sonnet)

### П-А: кодовая сверка (эталоны PDFExporter.swift, DrawOverlay.swift)
1. PdfExporter: HTML с charset utf-8, MathJax из assets (не CDN), A4 +
   page-break-inside:avoid, рисунки с contentBaseURL, ответы при withAnswers;
   рендер через PrintManager/createPrintDocumentAdapter ИЛИ
   PdfDocument+WebView; файл в cacheDir; share через FileProvider (манифест
   + file_paths.xml присутствуют).
2. PDFExportButton-аналог: диалог заголовок + «с ответами» + создать + share;
   answersDefault=true в предпросмотре учителя.
3. DrawOverlay: DrawShape kinds (pen/line/rect±fill/ellipse±fill), hitTest
   ластика (по фигуре целиком, tolerance), DrawBoard undo/redo/clear/reset
   со snapshot-стеком, THICKS=[2,4,7,12,20], цвет по умолчанию синий,
   тулбар (инструмент-поповер, ластик, ColorPicker, undo/redo/trash/close),
   перемещаемый тулбар, при закрытии reset (на экране пусто).
4. Точки входа: PDF-кнопка + рисовалка на тренировке/ДЗ/листе учителя/
   предпросмотре — цитаты подключения.
5. `./gradlew -q :app:assembleDebug` и `:app:assembleRelease` exit 0;
   `./gradlew -q :core:test` зелёный (регресс ядра).

### П-Б: живая приёмка + сквозной прогон (Sonnet)
1. Рисовалка: на экране тренировки (E2E_DRAW=1 или тап кнопки-карандаша)
   — нарисовать штрих свайпом, сменить инструмент на прямоугольник,
   нарисовать, ластиком стереть, undo, очистить, закрыть → скриншоты
   /tmp/w4_draw1.png (со штрихами), /tmp/w4_draw2.png (после закрытия —
   пусто). Осмотр глазами.
2. PDF: на предпросмотре учителя ИЛИ тренировке тап PDF-кнопки → диалог
   (скриншот /tmp/w4_pdf_dialog.png) → «Создать PDF» → появляется «Поделиться»
   (скриншот /tmp/w4_pdf_ready.png); по возможности подтвердить, что файл
   создан (adb shell ls cacheDir или share-лист открылся). НЕ отправлять.
3. Сквозной ученик: вход → главная → тренировка 1 задача → проверка →
   отчёт (скриншот). Сквозной учитель: вход → выбор ученика → модалка →
   предпросмотр (скриншот). Подтвердить отсутствие крэшей (logcat FATAL=0).
4. Скриншот-сверка: сравни 2-3 Android-экрана (главная ученика, главная
   учителя) с соответствующими в
   /Users/anton/Projects/EGE_trainer/ios/EGETrainerApp/EGETrainerApp/Screenshots/web-reference/
   — структурное соответствие (шапка/карточки/нижний бар/палитра), не пиксели.
5. git status: дельта только android/**, reports/wand_4*, WAND_4_PLAN.md.

## 10. Отчёт

`reports/wand_4_report.md` + `reports/wand_4/` (вердикт П-А/П-Б, скриншоты
рисовалки/PDF/сквозного прогона/сверки) + **итоговая сводка трека WAND**
(4 волны, достигнутый паритет, остаток оператора: установка на устройство,
redirect URL, live-тесты, публикация).
