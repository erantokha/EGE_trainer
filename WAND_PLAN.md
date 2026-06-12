# WAND_PLAN — мастер-план трека: Android-приложение с полным паритетом с сайтом

Дата: 2026-06-12. Подготовлен по запросу оператора (аудит + план переноса).
Статус: **утверждён оператором 2026-06-12**. Трек нарезан на 5 волн:
WAND.0 (среда+ядро+harness) → WAND.1 (дизайн-система+auth) → WAND.2
(ученик) → WAND.3 (учитель) → WAND.4 (общие модули+приёмка). Детальные
планы волн — `WAND_<N>_PLAN.md`; этот документ — общий референс трека
(карта переноса, контракты, готчи, итоговый DoD §8).
Прецедент-шаблон: `WIOS_1_PLAN.md` + `reports/wios_1_report.md` (iOS-волна,
выполнена 2026-06-11/12, включая 3 фикс-волны по ревью оператора).

---

## 1. Цель

Построить нативное Android-приложение `android/EGETrainerApp` (Kotlin +
Jetpack Compose) с полным функциональным и визуальным паритетом с
веб-версией тренажёра для обеих ролей (ученик/учитель). Эталон поведения —
**финальное состояние iOS-приложения** (`ios/EGETrainerApp` после порций
правок №1–3, принятых оператором), эталон логики — веб-код, эталон
внешнего вида — мобильный веб (`tasks/trainer/tokens.css` + скриншоты
`ios/EGETrainerApp/Screenshots/web-reference/`).

## 2. Контекст и мотивация (сводка аудита 2026-06-12)

### 2.1 Что переносим — три источника истины

1. **iOS-приложение** (`ios/EGETrainerApp`, 61 Swift-файл, ~22 000 строк) —
   готовый, принятый оператором образец того, как функционал сайта ложится
   на нативное мобильное приложение. Архитектура: чистый слой
   `Services` (16 файлов, без UI-зависимостей) + `Models` (typed Codable) +
   `Screens` (21 файл SwiftUI) + `DesignSystem` (6 файлов) + `DevHarness`
   (42 интеграционные проверки против прода). Все продуктовые решения
   (рисовалка-движок, отказ от пошагового режима, единый предпросмотр,
   «Начать» учителя без записи попытки и т.д.) уже отревьюваны оператором —
   Android **зеркалит их, не пересматривая**.
2. **Веб-код** — первоисточник бизнес-логики: `tasks/picker.js` (подбор,
   модалка прототипов, прогноз), `tasks/trainer.js`/`list.js`/`hw.js`/
   `analog.js`, `app/providers/*` (контракты RPC), `app/core/safe_expr.mjs`
   (проверка ответов), `app/ui/draw_overlay.js`, `app/ui/metric_help.js`.
3. **Backend-контракты** — `docs/supabase/runtime_rpc_registry.md` +
   `docs/supabase/*.sql`. Новых RPC не требуется: iOS доказал, что весь
   функционал покрывается существующими контрактами (DevHarness 42/42).

### 2.2 Ключевые факты аудита

- Бэкенд: `https://api.ege-trainer.ru` (nginx-прокси на VPS в РФ →
  Supabase Cloud), GoTrue (`/auth/v1/*`) + PostgREST (`/rest/v1/rpc/*`).
  Anon key и URL — в `app/config.js` и `SupabaseConfig.swift` (идентичны).
- Контент задач: статические JSON с `https://ege-trainer.ru/content/...`
  (index.json каталога, манифесты тем, картинки, `content/video/rutube_map.json`).
- Consent-модель учитель↔ученик (волна 2026-06-11) **уже есть в iOS**
  (8 RPC: invite/respond/list/revoke/cancel) — переносится как часть паритета.
- Формулы: контент содержит TeX (`\frac`, `\sqrt`); сайт и iOS рендерят
  vendored MathJax 3.2.2 (`mathjax-tex-svg.js`, 2 МБ, офлайн, SVG) —
  файл переиспользуется в Android as-is.
- **Среда:** на машине НЕТ Android-тулчейна (нет JDK, Android SDK,
  Android Studio, adb, эмуляторов) — нужна фаза подготовки среды (§5.0).
- Известный server-side риск F1 (самоэскалация роли через
  `update_my_profile`) — вне скоупа клиента, фиксится отдельной волной.
- На вебе после 2026-06-11 добавлены: единые error-states, подсказки
  метрик, мониторинг (Sentry-доработки). Подсказки метрик и
  человекочитаемые error-states в iOS есть; Sentry в iOS вне скоупа —
  для Android аналогично (§3).

### 2.3 Утверждённые оператором отклонения от веба (зеркалить в Android)

1. Тренировка **всегда списком** — пошаговый режим «Тестирование» убран
   (iOS P3-2; `StepTrainingView` остался в коде отключённым — в Android
   не переносить вовсе).
2. Рисовалка — **собственный движок** (порт `DrawOverlay.swift`: перо,
   линия, прямоугольник/эллипс контур+заливка, объектный ластик, толщины
   THICKS=[2,4,7,12,20], undo/redo/очистить/закрыть, системный выбор
   цвета). Фигуры select/drag и вставка картинок — вне скоупа.
3. «Начать» у учителя — лист с открытыми ответами **без записи попытки**.
4. Черновик тренировки сохраняет введённые ответы (улучшение против веба).
5. Печать = PDF-экспорт + системный share (без отдельного print-флоу).
6. «Замена задачи» в создании ДЗ = удаление + добавление (как на вебе).
7. Фильтр подбора = «приоритет, а не сито»: дефицит после фильтрованного
   resolve добирается вторым батчем без фильтра.

## 3. Out of scope (предлагается, утверждает оператор)

- «Умное ДЗ» и «Вариант 12» — убраны и из веба, не переносить (решение
  оператора в WIOS.1).
- Планшетные раскладки (target — телефоны), landscape-оптимизация.
- Sentry / крэш-мониторинг (как в WIOS.1; отдельная волна при надобности).
- Публикация в Google Play / подпись release-ключом / распространение
  (отдельный трек; debug-APK ставится по кабелю/Wi-Fi бесплатно — в
  отличие от iOS, аккаунт разработчика не нужен).
- App Links (открытие веб-ссылок ege-trainer.ru В приложении); генерация
  и шеринг ссылок ИЗ приложения — в скоупе.
- Любые правки веб-кода, SQL, контрактов, iOS-кода — приложение
  подстраивается под существующее.
- Live-тест Google OAuth, регистрации и сброса пароля — после волны
  (как в WIOS.1: redirect-URL в Supabase, письма/коды — действия
  оператора). Код фич — в скоупе, приёмка кода — статическая +
  негативные сценарии.
- Kotlin Multiplatform / переиспользование Swift-кода — нет, чистый
  Kotlin-порт (КМП — отдельное архитектурное решение, не побочный эффект).
- Offline-режим сверх того, что есть в iOS (кеш манифестов в памяти,
  черновик тренировки).

## 4. Затрагиваемые файлы

Все изменения — строго внутри `android/**`, `reports/**` и этого плана.

Целевая структура (зеркало iOS):

```
android/EGETrainerApp/
  settings.gradle.kts, build.gradle.kts, gradle/  # Gradle 8.x, AGP, Kotlin 2.x
  core/                          # :core — ЧИСТЫЙ Kotlin/JVM модуль (без Android)
    src/main/kotlin/.../
      models/    AuthModels.kt, ContentModels.kt, HomeworkModels.kt,
                 TeacherModels.kt, AnalyticsModels.kt, JsonValue.kt
      services/  SupabaseConfig.kt, SupabaseClient.kt, SupabaseError.kt,
                 SupabaseAuthFlows.kt, SessionStore.kt (интерфейс +
                 InMemory), AuthService.kt, HomeworkService.kt,
                 StudentService.kt, TeacherService.kt, ContentService.kt,
                 AnswerChecker.kt, ScoreForecast.kt, StudentPickEngine.kt,
                 ProtoStatsCache.kt, TrainingDraftStore.kt (интерфейс)
  harness/                       # :harness — JVM application, порт DevHarness
    src/main/kotlin/.../Main.kt  # те же 42+ проверок против прода
  app/                           # :app — Android (Compose)
    src/main/
      AndroidManifest.xml        # intent-filter egetrainer://auth-callback,
                                 # INTERNET, FileProvider для share PDF
      assets/mathjax-tex-svg.js  # копия из ios/.../Resources (1-в-1)
      kotlin/.../
        app/        MainActivity.kt, AppState.kt (ViewModel),
                    RootNavigation.kt, DevSupport.kt (DEBUG/E2E-хуки)
        designsystem/ Theme.kt (токены из tokens.css, light/dark),
                    Components.kt, MathTextView.kt (WebView, self-sizing),
                    DrawOverlay.kt (Compose Canvas), RutubePlayerView.kt,
                    MetricHelp.kt, FigureView.kt
        storage/    EncryptedSessionStore.kt (EncryptedSharedPreferences),
                    PrefsTrainingDraftStore.kt
        screens/
          auth/     AuthScreen.kt, GoogleSignIn.kt (Custom Tabs + PKCE),
                    CompleteProfileScreen.kt
          student/  StudentTabScaffold.kt, StudentHomeScreen.kt,
                    TrainingRunScreen.kt, TrainingReviewScreen.kt,
                    AnalogRunScreen.kt, StudentPreviewSheet.kt
          homework/ MyHomeworksScreen.kt, HomeworkRunScreen.kt,
                    HomeworkArchiveScreen.kt
          teacher/  TeacherTabScaffold.kt, TeacherHomeScreen.kt,
                    MyStudentsScreen.kt, StudentCardScreen.kt,
                    CreateHomeworkScreen.kt, AddTasksSheet.kt,
                    AddedTasksPreviewSheet.kt, AttemptReviewScreen.kt
          stats/    StatsScreen.kt
          shared/   ProfileScreen.kt, ProtoPickerSheet.kt,
                    PreviewQuestionCard.kt, QuestionRunViews.kt
        pdf/        PdfExporter.kt (WebView → PrintDocumentAdapter → файл → share)
  README.md                      # сборка, запуск, harness, E2E-хуки
reports/wand_1_report.md + reports/wand_1/*.png
```

Read-only источники: `ios/EGETrainerApp/**` (главный шаблон), `tasks/*`,
`app/*`, `docs/supabase/*`, `content/*` (структура), `docs/navigation/*`.

## 5. Пошаговый план

> **Task-tracking (обязательно для исполнителя):** в начале работы создай
> TaskList через `TaskCreate` с пунктами §5.0–§5.9 этого плана. По мере
> выполнения обновляй статус через `TaskUpdate`: `in_progress` при старте
> шага, `completed` при завершении — чтобы оператор наблюдал прогресс в
> реальном времени через task-panel.

### §5.0 Среда (на машине нет Android-тулчейна)

a. Установить: JDK 17 (Temurin), Android cmdline-tools + SDK (platform 35,
   build-tools, platform-tools/adb, emulator + system image **x86_64**
   API 35 — машина Intel i7-9750H, `kern.hv_support=1` подтверждён),
   Gradle через wrapper. Homebrew на машине НЕТ и не требуется: прямые
   загрузки (curl) Temurin tar.gz и cmdline-tools zip в `~/Library/Android/sdk`
   и `~/`, без sudo; `ANDROID_HOME`/`JAVA_HOME` в `~/.zprofile`;
   лицензии — `yes | sdkmanager --licenses`. Объём загрузок ~5–8 ГБ
   (свободно 331 ГБ — достаточно).
b. Создать AVD (Pixel-класс, API 35, x86_64) и убедиться, что эмулятор
   стартует headless (`emulator -avd ... -no-window` для скриптовых
   прогонов и обычный — для скриншотов через `adb exec-out screencap`).
   Тап-автоматизация — через `adb shell input tap/swipe/text` +
   `uiautomator dump` (доступна без OS-разрешений, в отличие от iOS).
c. Android Studio НЕ обязательна (сборка/прогоны — CLI: `./gradlew`,
   `adb`); поставить можно позже для ручной работы оператора.

### §5.1 Скелет проекта

Gradle-проект из трёх модулей: `:core` (kotlin-jvm, зависимости только
OkHttp + kotlinx-serialization-json + kotlinx-coroutines), `:harness`
(jvm application, зависит от :core), `:app` (com.android.application,
Compose BOM, minSdk 26, targetSdk 35, `applicationId ru.egetrainer.app`).
Принцип тот же, что в iOS: **вся бизнес-логика и сеть — в :core без
Android-зависимостей**, чтобы harness гонялся на JVM без эмулятора
(аналог swiftc-сборки DevHarness на macOS).

### §5.2 Foundation — порт :core (зеркало iOS Services/Models)

Прямой порт Swift → Kotlin, файл-в-файл (см. карту в Приложении A):

a. `SupabaseConfig` — base URL `https://api.ege-trainer.ru`, anon key,
   `contentBaseURL`/`siteBaseURL` = `https://ege-trainer.ru` (значения
   взять из `SupabaseConfig.swift` / `app/config.js`).
b. `SupabaseClient` — GoTrue (signIn/refresh/logout), PostgREST
   (rpc/select/insert, `Prefer: return=representation`), авто-refresh при
   <60 с до истечения токена, 401-ретрай с forceRefresh, сетевые ретраи
   только на IOException с backoff 350/800/1500 мс, таймаут запроса 20 с,
   `rpcSingleRow`-хелпер (RPC может вернуть объект или массив из 1 строки).
c. `SupabaseAuthFlows` — signup (user_metadata: role/first_name/last_name/
   student_grade|teacher_type), resend, recover, PKCE-авторизация Google
   (code_verifier S256, redirect `egetrainer://auth-callback`), обмен
   `grant_type=pkce`.
d. `SupabaseError` — sealed class: Network/Timeout/AuthRequired/
   InvalidCredentials/AccessDenied/Http/Decoding + человекочитаемые
   русские сообщения (тексты — из `SupabaseError.swift`).
e. `Models` — kotlinx-serialization data-классы 1-в-1 с iOS
   (snake_case через `@SerialName`), `JsonValue` → `JsonElement`.
f. `ContentService` — синглтон с mutex (аналог actor): index.json,
   манифесты тем, **параллельный прогрев** (coroutines `async` — урок iOS:
   последовательная загрузка 3,6 с → параллельная 0,4 с), buildQuestions
   (refs → RunQuestion: stem/figure/resolved answer_spec c подстановкой
   params), randomQuestions со спредом по базовым прототипам,
   protoCards (группировка по baseId), analogQuestion, videoURL
   (rutube_map + фоллбэк по baseId).
g. `AnswerChecker` — порт checkFree: нормализация (strip_spaces,
   unicode_minus→ascii, comma→dot), типы number (дроби a/b,
   abs/rel tolerance, default 1e-12) / text (exact/regex + флаги) /
   ege_decimal.
h. `ScoreForecast` — подтема% → секция% → первичный (0…12) → тестовый
   балл по таблице с линейной интерполяцией; паритет с вебом до сотых.
i. `StudentPickEngine` — без фильтра: клиентский random с двухпроходной
   ротацией по базам; с фильтром: self-гейт
   `teacher_picking_resolve_batch_v1` **одним батчем со всеми бакетами**
   (урок iOS фикс-волны №2: 12 последовательных RPC = 11,3 с, один батч =
   0,9 с), over-fetch want+6 cap 40, scope-приоритет proto > topic >
   section, дефицит добирается вторым батчем без фильтра.
j. `ProtoStatsCache` — TTL 60 с, дедупликация параллельных прогревов;
   teacher: `proto_last3_for_teacher_v1` + `question_stats_for_teacher_v2`
   (сигнатура: ТОЛЬКО p_student_id + p_question_ids — реальные question_id
   прототипов, не unic_id; фоллбэк на v1); self: всё из
   `proto_last3_for_self_v1`.
k. `AuthService`, `HomeworkService`, `StudentService`, `TeacherService` —
   обёртки RPC по списку §6 (имена параметров строго `p_*` — урок iOS:
   `update_my_profile` молча не работал с неверными именами).
l. `SessionStore` (интерфейс + InMemory в :core) и `TrainingDraftStore`
   (интерфейс; TTL 12 ч, хранит refs + answers + shuffle).

### §5.3 Harness-гейт (до начала UI)

Порт `DevHarness/main.swift` → `:harness` (JVM): юнит-проверки
AnswerChecker/ScoreForecast, вход обеих ролей, refresh, профиль, контент
(текст/рисунок/ответ), каталог, аналитика self/teacher, picking screen +
resolve-батч, прото-статистика, consent-цикл, список/архив ДЗ, работы
ученика, отчёт учителя, отказ доступа; write-проверки за флагами
`EGE_WRITE_SUBMIT`/`EGE_WRITE_CREATE` (тестовые аккаунты, `source='test'`,
`meta.client='android'`). Креды — из env (как у iOS: `EGE_STUDENT_EMAIL`/
`EGE_STUDENT_PASSWORD`/`EGE_TEACHER_EMAIL`/`EGE_TEACHER_PASSWORD`).
**Гейт: harness зелёный (read-only набор) до перехода к §5.4.**

### §5.4 Дизайн-система (внешний вид = мобильный веб)

a. `Theme.kt` — токены из `tasks/trainer/tokens.css` 1-в-1: light = :root,
   dark = `[data-theme="dark"]`; палитра (bg/panel/panel-2/border/text/
   text-dim/accent #2563eb/accent-2/success #059669/danger #dc2626/
   surface/surface2/accent-light), радиусы (sm 10/md 12/lg 16/pill),
   тени, размеры шрифтов (--fs-2xs 11 … --fs-2xl 20). Тема — системная
   (`isSystemInDarkTheme()`), эквивалент ручного переключателя сайта.
   **НЕ стоковый Material 3 look**: компоненты стилизуются под веб
   (как Theme.swift/Components.swift в iOS).
b. `Components.kt` — Primary/Secondary кнопки (метрики высоты/ширины как
   SecondaryButtonStyle iOS — урок P3-3: ряд [фильтр][Выбрать все]
   [Сбросить] равной высоты, без переноса на 2 строки), карточки, бейджи
   (цвета badgeClassByPct: ≥90/≥70/≥50/<50 и пороги давности
   badgeClassByLastAttemptAt), поля ввода, error-state и empty-state.
c. `MathTextView.kt` — AndroidView + WebView: HTML с
   `<meta charset="utf-8">` (готча iOS: без него — моджибейк), vendored
   `assets/mathjax-tex-svg.js`, разделители `\(..\)`/`$..$`, SVG-вывод;
   текст без TeX — нативный Text (containsTeX-проверка). Self-sizing:
   замер **внутреннего контейнера `#c` + ResizeObserver** с пересообщением
   высоты через JS-bridge (`addJavascriptInterface`) — урок iOS
   фикс-волны №2 (LazyColumn создаёт ячейку до назначения полной ширины,
   одноразовый замер по viewport даёт растянутые карточки).
d. `FigureView.kt` — картинки/SVG условий с `contentBaseURL` (Coil для
   растровых, WebView для SVG — по фактическим форматам контента,
   сверить с `FigureView.swift`).
e. `DrawOverlay.kt` — порт собственного движка iOS на Compose Canvas:
   инструменты перо/линия/прямоугольник/эллипс (контур+заливка),
   объектный ластик (hit-test по фигуре целиком с tolerance), THICKS=
   [2,4,7,12,20], undo/redo/очистить/закрыть, тулбар-порт `.dro-bar`,
   цвет — системный пикер/палитра. Эфемерно, закрытие обнуляет состояние.
f. `RutubePlayerView.kt` — WebView-шит с embed-URL (порт toRutubeEmbedUrl:
   `rutube.ru/video/<id>` → `rutube.ru/play/embed/<id>`).
g. `MetricHelp.kt` — словарь METRIC_HELP из `app/ui/metric_help.js`
   (10 ключей, тексты 1-в-1) + поповеры «?» у прогноза/первичных.

### §5.5 Auth + профиль (red-zone — требует явного одобрения оператора)

a. `AuthScreen` — вкладки «Вход / Регистрация / Сброс пароля», поля и
   валидация 1-в-1 с `tasks/auth.js` (роль, ФИ, класс 5–11 /
   школьный-репетитор, пароль ≥6, тексты ошибок, resend-письмо,
   «Забыли пароль?»); блокировка submit до готовности (урок WHF2-fix-1).
b. `GoogleSignIn` — Custom Tabs (androidx.browser) + PKCE S256, deep link
   `egetrainer://auth-callback` через intent-filter MainActivity
   (singleTask, onNewIntent) — тот же scheme, что iOS: один redirect-URL
   в Supabase покрывает обе платформы.
c. `CompleteProfileScreen` — порт google_complete (роль/ФИ/класс при
   `needsCompletion`).
d. `ProfileScreen` — просмотр/редактирование (`update_my_profile`),
   удаление аккаунта (`delete_my_account`, двойное подтверждение),
   consent-блоки: у ученика — входящие запросы учителей
   (принять/отклонить) и «Мои учителя» (отвязка); у учителя — исходящие
   приглашения с отменой (зеркало `ProfileView.swift`/`MyStudentsView.swift`).
e. Хранение сессии — `EncryptedSessionStore` (EncryptedSharedPreferences /
   Keystore; аналог Keychain), bootstrap при старте: restore → refresh →
   роутинг по роли (`AppState` + `RootNavigation`: launching / signedOut /
   signedIn(student|teacher) / needsCompletion).

### §5.6 Ученик

a. `StudentHomeScreen` — порт `StudentHomeView.swift` + web-reference:
   карточка прогноза («термометр», цель 70, дельта «+N до цели»,
   первичные, поповеры «?»), карточка незавершённой тренировки
   («Продолжить»/×), ряд контролов [фильтр-дропдаун][Выбрать все]
   [Сбросить] (фильтры: без фильтра/нерешённое/давно/нестабильно/слабые
   места; при фильтре — бейджи состояний тем из self-гейта
   `teacher_picking_screen_v2`), переключатель «Перемешать», аккордеон
   12 секций × подтем (счётчики-степперы −/N/+ на подтему и секцию,
   «Выбрать все» = +1 в каждую СЕКЦИЮ — порт bulkPickAll), тап по строке
   подтемы открывает модалку прототипов, чип «+N» выбранных прототипов,
   прогрев ProtoStatsCache при раскрытии секции (порт WFX1 — модалка
   открывается с готовыми бейджами, без мигания), нижний бар
   [Предпросмотр | Начать (N)].
b. `ProtoPickerSheet` (общая для ролей) — группировка по baseId, превью
   условий с формулами и картинками, степперы с капом, бейджи «X/3» +
   дата последней попытки, тултипы; **готча:** иерархия id нерегулярная
   (темы 2/3-сегментные) — матч по базе + резолв темы по длиннейшему
   префиксу, не хардкодить число сегментов.
c. `StudentPreviewSheet` — единый предпросмотр (PreviewQuestionCard):
   карточки условий без ответов, удаление, перемешивание; «Начать» из
   предпросмотра учитывает удаления.
d. `TrainingRunScreen` — тренировка списком: ввод ответов, «Проверить»
   (мгновенная проверка, блокировка ответа), таймер, «Прервать» с
   черновиком, рисовалка, PDF-экспорт; запись `write_answer_events_v1`
   (`source='test'`, `meta.client='android'`).
e. `TrainingReviewScreen` — итоги, фильтр «Только неверные (N)», «Новая
   сессия», карточки с видео-разбором (RutubePlayerView) и «Решить аналог».
f. `AnalogRunScreen` — порт analog.js: другой вариант той же базы,
   исключение исходного и решённых, цепочка «Решить ещё аналог», запись
   с `meta.kind='hw_analog'` + base/analog id.
g. `StatsScreen` — порт StatsView: период 7/14/30/90, источник
   (всё/ДЗ/тренировка), метрики last3/last10/период, покрытие, слабые
   подтемы (из `student_analytics_screen_v1` self-scope).
h. ДЗ: `MyHomeworksScreen` (список со статусами и счётчиками, бейдж
   несданных на табе — `pendingHomeworksCount`, обновление при
   входе/загрузке/после сдачи), `HomeworkRunScreen` (полный цикл по
   токену: get → start → ввод → подтверждение → submit_v2 → результат
   с фильтром «только неверные», аналогами, PDF, рисовалкой),
   `HomeworkArchiveScreen` (`student_my_homeworks_archive`, offset от 10,
   страница 50, «Загрузить ещё»).
i. Черновик: `PrefsTrainingDraftStore` — запись при вводе ответов и
   «Прервать», TTL 12 ч, восстановление с ответами.

### §5.7 Учитель

a. `TeacherHomeScreen` — порт TeacherHomeView: выбор ученика
   (поиск-комбобокс с ранжированием: префикс первого слова > других слов >
   вхождение > email), карточка прогноза ученика, фильтры + «Перемешать
   задачи», аккордеон с бейджами состояний и счётчиками, модалка
   прототипов (teacher-scope: бейджи X/3 + даты), нижний бар
   [предпросмотр-глаз с бейджем | Начать | Создать ДЗ].
b. `AddedTasksPreviewSheet` — «Показано: X из Y», **честный shortage** из
   `shortages[]` ответа RPC (текст «Не хватило N задач: по фильтру „…"
   подходящих кандидатов больше нет (K тем). Снимите фильтр…»), чип
   активного фильтра в шапке, карточки PreviewQuestionCard с ответами,
   удаление, PDF с ответами, session-ссылка, «Создать ДЗ из этой
   подборки» (refs передаются без пере-resolve).
c. «Начать» — лист с открытыми ответами, без записи попытки.
d. Session-ссылки — `create_session_link` (p_mode/p_shuffle/p_spec_json/
   p_frozen_questions, **без ретраев** — write) → URL
   `tasks/list.html?session=…` + системный share (Intent.ACTION_SEND).
e. `CreateHomeworkScreen` — название (дефолт «ДЗ DD.MM»), «Описание»
   (колонка description), переключатель «Назначить этому ученику»
   (выкл = «Не назначать»), «Перемешать» (spec_json.shuffle), prePicked
   refs из предпросмотра, `AddTasksSheet` (каталог со степперами,
   исключение уже добавленных), бакеты proto+topic+section через
   resolve-батч; создание: insert `homeworks`+`homework_links` →
   `assign_homework_to_student`; success-блок со ссылкой (копия/share).
f. `MyStudentsScreen` — приглашение по email (consent: pending-заявки с
   отменой), поиск по ФИО/email, фильтр «Проблемные» (сортировка: форма →
   активность → имя, как my_students.js), селекты периода/источника
   (`teacher_students_summary` p_days/p_source), отвязка.
g. `StudentCardScreen` — метрики за период (последние 10 / период / всё
   время; селект 7/14/30/90) из `student_analytics_screen_v1`
   teacher-scope, список выполненных работ (`list_student_attempts`) с
   переходом в `AttemptReviewScreen` (`get_homework_attempt_for_teacher` +
   условия из контента), отвязка с подтверждением.

### §5.8 Общие модули

a. `PdfExporter` — HTML-лист (заголовок, нумерованные условия с MathJax,
   рисунки, опционально ответы; A4, `page-break-inside: avoid`) →
   offscreen WebView → `createPrintDocumentAdapter` → PDF-файл →
   share sheet через FileProvider. Точки входа: тренировка, ДЗ,
   предпросмотр учителя (по умолчанию «с ответами»), «Начать».
b. Рисовалка — точки входа: экраны прохождения тренировки и ДЗ, лист
   «Начать», просмотр аналога (как в iOS).
c. `DevSupport` — DEBUG-only E2E-хуки (аналог iOS): автологин
   `E2E_EMAIL`/`E2E_PASSWORD`, demo-маршруты `E2E_DEMO` (math, proto,
   preview_all, preview_stale, proto_teacher и т.д.), авторазворот
   `E2E_EXPAND` — через intent extras (`adb shell am start --es ...`),
   в release-сборку не попадают (`BuildConfig.DEBUG`).

### §5.9 Приёмка

Полная сборка `./gradlew :app:assembleDebug` без error-диагностик;
`:harness` против прода (read-only всё зелёное; write — по флагам);
эмулятор-прогон обеих ролей по чек-листу §9 со скриншотами
(`adb exec-out screencap`) в `reports/wand_1/`; визуальная сверка со
скриншотами `web-reference/` и iOS; отчёт `reports/wand_1_report.md`.

Ориентир объёма: сопоставим с P0+WIOS.1 вместе (iOS-прецедент: ночной
автономный прогон P0 + ночной прогон WIOS.1 + 3 фикс-волны). Реалистично —
2–3 длинных автономных прогона с ревью оператора между ними:
(1) §5.0–§5.4 + harness-гейт, (2) §5.5–§5.7, (3) §5.8–§5.9 + фиксы.

## 6. Данные / контракты / миграции

- **Новых RPC и SQL нет. Миграций нет. Бэкап не нужен.**
- Используются только существующие контракты (все уже проверены iOS
  DevHarness 42/42): GoTrue `/auth/v1/{token,signup,resend,recover,logout,
  authorize+pkce}`; RPC `student_analytics_screen_v1`,
  `teacher_picking_screen_v2`, `teacher_picking_resolve_batch_v1`,
  `question_stats_for_teacher_v2` (+v1 фоллбэк), `proto_last3_for_teacher_v1`,
  `proto_last3_for_self_v1`, `write_answer_events_v1`,
  `get_homework_by_token`, `start_homework_attempt`,
  `submit_homework_attempt_v2`, `get_homework_attempt_by_token`,
  `get_homework_attempt_for_teacher`, `assign_homework_to_student`,
  `student_my_homeworks_summary`, `student_my_homeworks_archive`,
  `list_my_students`, `teacher_students_summary`, `list_student_attempts`,
  `remove_student`, `create_session_link`, `update_my_profile`,
  `delete_my_account`, consent-набор (`teacher_invite_student`,
  `list_my_student_requests`, `cancel_student_request`,
  `list_incoming_teacher_requests`, `respond_teacher_request`,
  `list_my_teachers`, `revoke_my_teacher`); insert `homeworks`/
  `homework_links`; статика `content/**` + `content/video/rutube_map.json`.
- Мёртвый `auth_email_exists` НЕ использовать (401 всем, снесён с веба в
  WHF2-fix-1).
- Прод-записи только тестовыми аккаунтами (`source='test'`,
  `meta.client='android'`) — по аналогии с WIOS.1, требует подтверждения
  оператора.
- Redirect URL `egetrainer://auth-callback` в Supabase — тот же, что для
  iOS (из остатка WIOS.1); если оператор его уже добавил, Android Google
  OAuth заработает сразу.

## 7. Риски и stop-ask точки

- **Red-zone:** §5.5 (auth-flow) — требует явного одобрения оператора при
  утверждении плана (в WIOS.1 одобрялось так же). Скоуп узкий: только
  Android-код, GoTrue REST как у веба, без изменения настроек Supabase.
- **Среда (§5.0):** многогигабайтные загрузки SDK/эмулятора и лицензии
  `sdkmanager` — если установка падает по сети/правам, stop-ask с
  вариантами (ручная установка Android Studio оператором).
- WebView (MathJax/SVG): эмулятор использует системный WebView образа —
  если рендер формул на старом WebView отличается, фиксировать минимум
  (minSdk выше / requireWebView feature) — решение внутри скоупа, отметить
  в отчёте.
- EncryptedSharedPreferences deprecated-статус в новых версиях
  androidx.security — допустим осознанный выбор (или Keystore напрямую);
  решение внутри скоупа.
- Расхождение прод vs репо (фича есть в коде, но выключена на проде) —
  stop-ask (как в WIOS.1).
- Тап-приёмка на реальном устройстве — за оператором (устройство
  недоступно исполнителю); эмулятор-прогон обязателен.

> **Режим работы: автономный.** Не останавливайся за подтверждением на
> каждом шаге, не спрашивай «продолжать ли», не проси промежуточного
> ревью. Доведи работу до DoD и верни отчёт (`reports/wand_1_report.md`
> + completion summary). Куратор принимает работу целиком по факту.
>
> **Останавливайся (stop-ask) только в следующих случаях:**
> 1. Попытка изменить файл вне §4 «Затрагиваемые файлы».
> 2. Попытка зайти в зону из §3 «Out of scope».
> 3. План противоречит реальности кода (RPC/функции нет, сигнатура не та,
>    контракт разошёлся с реестром).
> 4. DoD объективно недостижим без выхода за scope.
> 5. Governance-скрипт упал и причина не из диффа волны (диффа веб-кода
>    быть не должно вовсе).
> 6. Уязвимость/утечка креденшлов в репозитории.
> 7. Задача распадается на независимые DoD.
> 8. Один сценарий падает 2+ раза подряд, причина неясна.
> 9. Нужно архитектурное решение с влиянием вне §4.
> 10. Проектные триггеры волны: (а) любая потребность изменить
>     веб-код/SQL/контракты/iOS-код; (б) потребность в новом RPC;
>     (в) фича веба не работает на проде (расхождение прод/репо);
>     (г) установка среды §5.0 требует действий, недоступных исполнителю
>     (пароль sudo, ручные клики в GUI-инсталлере, нехватка диска);
>     (д) необходимость платных аккаунтов/сервисов.
>
> **Не экстренное** (решать самому): имена/структура Kotlin-кода, порядок
> шагов §5, выбор между эквивалентными Android-API (Coil vs WebView для
> SVG, EncryptedSharedPreferences vs Keystore), детали UX-адаптации
> веб-паттернов под Android-конвенции (sheet → ModalBottomSheet,
> поповер → DropdownMenu/Tooltip), повторные прогоны сборки/тестов.

## 8. Критерии приёмки (DoD)

1. Все пункты §5.1–§5.8 реализованы; ни один не «оформлен как follow-up»
   без stop-ask.
2. `./gradlew :app:assembleDebug` и `:harness:run` собираются без ошибок;
   приложение запускается в эмуляторе (API 35).
3. Harness против прода: read-only набор (порт всех 42 проверок iOS,
   применимых к :core) зелёный; write-проверки зелёные при флагах.
4. Формулы контента рендерятся (скриншот темы с `\frac`, например
   производные 8.1) — не сырой TeX; карточки не растянуты (анти-регрессия
   замера высоты).
5. Для каждой фичи §5 — скриншот из эмулятора в `reports/wand_1/`;
   визуальный паритет с `web-reference/` и iOS-скриншотами (палитра,
   бейджи, нижние бары, ряды контролов) — light и dark.
6. Сценарии чек-листа §9 пройдены в эмуляторе вживую.
7. Подбор с фильтром у ученика — один resolve-батч (не последовательные
   RPC); время отклика на эмуляторе сопоставимо с iOS (~1–2 с).
8. `git status`: изменения только в `android/**` и `reports/**` (+ план).
9. Отчёт `reports/wand_1_report.md` с фактами, скриншотами, выводом
   harness, списком расхождений с вебом/iOS (если остались) с
   обоснованием, write-следами на проде, остатком для оператора.

## 9. План проверки

1. `./gradlew :app:assembleDebug` + `./gradlew :harness:run` (креды из env).
2. Эмулятор-чек-лист (скриншот на каждый пункт; DEBUG-хуки E2E_DEMO для
   скриптовых прогонов):
   - ученик: вход → главная (прогноз с поповером «?», фильтр «слабые
     места» → бейджи/счётчики меняются) → модалка прототипов (бейджи X/3,
     даты, без мигания) → «Выбрать все» (+1 на секцию) → предпросмотр
     (удаление, без ответов) → «Начать» → тренировка (проверка ответа,
     рисовалка, PDF) → «Прервать» → карточка «Продолжить» (ответы
     сохранены) → отчёт (только неверные, видео-плеер внутри, «Решить
     аналог» → цепочка) → Мои ДЗ (бейдж несданных) → выполнение ДЗ по
     токену → архив (пагинация) → статистика (периоды/источники) →
     профиль (редактирование; входящий запрос учителя — принять) →
     тёмная тема (системная);
   - учитель: вход → выбор ученика поиском → фильтр stale → модалка
     прототипов (даты!) → «Выбрать все» (12) → предпросмотр (честный
     shortage при фильтре, чип фильтра) → «Начать» (лист с ответами,
     без записи) → session-ссылка (share) → «Создать ДЗ» (описание,
     «не назначать», добавить задачи, перемешать) → ссылка → карточка
     ученика (метрики, работы, просмотр попытки) → «Мои ученики»
     (поиск, «Проблемные», приглашение по email → pending → отмена);
   - auth: вкладки регистрации/сброса, валидация, негативные сценарии
     (занятый email — человекочитаемо), Google-кнопка открывает OAuth до
     экрана Google (дальше — post-wave).
3. Кросс-проверка с вебом: созданное из Android ДЗ открывается на сайте
   по ссылке; попытка из Android видна в веб-статистике (и наоборот:
   ДЗ, созданное на сайте, выполняется в приложении).
4. Кросс-проверка с iOS: один и тот же тестовый ученик — прогноз балла
   совпадает до сотых на всех трёх клиентах.

## 10. Отчётный артефакт

`reports/wand_1_report.md`: что сделано по каждому пункту §5, скриншоты
(`reports/wand_1/*.png`), вывод harness, отклонения от веба/iOS с
обоснованием, write-следы на проде, остаток для оператора (установка на
устройство, live-тест писем/Google, вердикт по волне).

---

## Приложение A. Карта переноса iOS → Android

| iOS (Swift) | Android (Kotlin) | Замечания |
|---|---|---|
| SwiftUI | Jetpack Compose | экраны 1-в-1 по структуре |
| URLSession | OkHttp + coroutines | ретраи/таймауты те же |
| Codable | kotlinx-serialization | `@SerialName` для snake_case |
| actor (ContentService, ProtoStatsCache) | class + Mutex / ConcurrentHashMap | та же семантика |
| Keychain (KeychainSessionStore) | EncryptedSharedPreferences | интерфейс SessionStore в :core |
| UserDefaults (TrainingDraftStore) | SharedPreferences | TTL 12 ч |
| WKWebView (MathJax, Rutube, PDF, SVG) | android.webkit.WebView | charset utf-8, JS-bridge вместо postMessage |
| ASWebAuthenticationSession + PKCE | Custom Tabs + intent-filter | scheme `egetrainer://auth-callback` общий |
| SwiftUI Canvas (DrawOverlay) | Compose Canvas | движок портируется 1-в-1 |
| UIPrintPageRenderer (PDF) | createPrintDocumentAdapter | A4, page-break-inside: avoid |
| share sheet | Intent.ACTION_SEND + FileProvider | PDF и ссылки |
| TabView | Scaffold + NavigationBar | табы: ученик 4, учитель 4 |
| sheet | ModalBottomSheet | модалки прототипов/предпросмотра |
| popover (MetricHelp) | Tooltip/DropdownMenu | тексты те же |
| DevHarness (swiftc CLI на macOS) | :harness (JVM application) | :core без Android-зависимостей |
| E2E_* env у simctl | intent extras у adb am start | DEBUG-only |

## Приложение B. Чек-лист готч (уроки iOS — обязательны к переносу)

1. `<meta charset="utf-8">` в каждом HTML для WebView — иначе моджибейк.
2. Высота MathTextView: замер контейнера `#c` + ResizeObserver,
   пересообщать при каждом изменении размеров (LazyColumn-готча).
3. Подбор с фильтром — ОДИН resolve-батч со всеми бакетами (12
   последовательных RPC = 11,3 с).
4. `question_stats_for_teacher_v2`: только p_student_id + p_question_ids
   (лишний параметр → тихий 404 → нет дат в модалке).
5. Имена параметров RPC строго `p_*` (update_my_profile молча
   не работал с `first_name`).
6. Scope-приоритет выбора: proto > topic > section.
7. baseId = id без последнего числового сегмента; темы 2/3-сегментные —
   резолв по длиннейшему префиксу, не хардкодить.
8. «Выбрать все» = +1 на СЕКЦИЮ (12), не на подтему (84).
9. Shortage — честный, из `shortages[]` RPC, с указанием активного
   фильтра; не выдумывать «банк исчерпан».
10. Прогрев прото-статистики при раскрытии секции (WFX1) — модалка
    без мигания; TTL 60 с, дедупликация прогревов.
11. Фильтр = приоритет, не сито: дефицит добирать батчем без фильтра.
12. refs из предпросмотра в создание ДЗ — без пере-resolve.
13. `create_session_link` и прочие write — без сетевых ретраев.
14. Refresh токена за 60 с до истечения; 401-ретрай один, с forceRefresh.
15. Параллельный прогрев манифестов контента (0,4 с против 3,6 с).
