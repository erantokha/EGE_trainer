# WAND_0_PLAN — волна 0: среда, ядро (:core), harness-гейт

Дата: 2026-06-12. Трек: WAND (`WAND_PLAN.md`, утверждён оператором).
Статус: утверждён оператором («Приступаем к волне ноль»), исполнение —
автономное в этой же сессии.

Процесс волны (требование оператора): по каждой задаче чек-листа §5 —
**аудит → план → реализация → независимая проверка отдельным агентом
строго по §9** (план проверки спроектирован ДО реализации; verifier
не принимает «проверь то, что я сделал», только пункты §9).

---

## 1. Цель

Поднять Android-тулчейн с нуля на машине оператора и построить фундамент
приложения: Gradle-проект `:core`/`:harness`/`:app`, полный порт слоя
логики iOS (`Services` + `Models`) на чистый Kotlin/JVM и порт DevHarness
с зелёным прогоном против прода. UI в этой волне — только пустой каркас
:app, стартующий на эмуляторе.

## 2. Контекст и мотивация

iOS-прецедент показал: слой Services/Models — самая стабильная часть
(DevHarness 42/42, фикс-волны его почти не трогали). Перенос этого слоя
первым + интеграционный гейт против прода ловит самые дорогие ошибки
(контракты, сигнатуры, алгоритмы) до того, как написан хоть один экран.
Аудит машины (2026-06-12): Intel i7-9750H, 16 ГБ RAM, 331 ГБ свободно,
`kern.hv_support=1`, НЕТ JDK/SDK/Homebrew — среда ставится с нуля прямыми
загрузками без sudo.

## 3. Out of scope

- Любой продуктовый UI (экраны — WAND.1+). В :app — только пустой
  Compose-каркас «приложение запускается».
- Android Studio (не нужна для CLI-разработки).
- Подпись release, Google Play, реальное устройство.
- Правки веб-кода, SQL, контрактов, iOS-кода (read-only источники).
- Write-проверки harness сверх одного контролируемого прогона
  (`source='test'`, `meta.client='android'`, тестовые аккаунты —
  разрешено оператором в рамках трека).

## 4. Затрагиваемые файлы

- Создаётся: `android/EGETrainerApp/**` (структура — `WAND_PLAN.md §4`:
  Gradle-файлы, `core/src/main/kotlin/ru/egetrainer/core/{models,services}/`,
  `core/src/test/`, `harness/src/main/kotlin/`, `app/src/main/` минимальный),
  `android/EGETrainerApp/README.md`.
- Вне репозитория: `~/Library/Android/sdk/**`, `~/tools/jdk-17*`,
  `~/tools/gradle-*`, `~/.zprofile` (строки JAVA_HOME/ANDROID_HOME),
  AVD в `~/.android/avd/`.
- Отчёт: `reports/wand_0_report.md` + `reports/wand_0/*`.
- Read-only: `ios/EGETrainerApp/**`, `app/*`, `tasks/*`, `docs/supabase/*`,
  `.env.local` (креды тестовых аккаунтов для harness).

## 5. Пошаговый план (чек-лист волны)

> **Task-tracking (обязательно):** TaskCreate с задачами Т1–Т8 в начале
> работы; TaskUpdate `in_progress`/`completed` по ходу. Задача считается
> `completed` только после PASS независимой проверки по §9.

- **Т1. Среда.** Аудит выполнен (см. §2). Установить JDK 17 (Temurin x64
  tar.gz), Android cmdline-tools → sdkmanager → platform-tools,
  build-tools, platforms;android-35, emulator, system-image
  android-35 google_apis x86_64; принять лицензии; создать AVD
  (Pixel-класс); прописать env в `~/.zprofile`. Гейт: эмулятор бутится.
- **Т2. Gradle-скелет.** Gradle 8.9 (дистрибутив → wrapper в проекте),
  три модуля: `:core` (kotlin-jvm + kotlinx-serialization + okhttp +
  coroutines, БЕЗ Android), `:harness` (jvm application → :core),
  `:app` (AGP 8.5.x, Compose BOM, minSdk 26, targetSdk 35, пустой
  экран-заглушка «EGE Trainer»). Гейт: assembleDebug + harness run.
- **Т3. Модели.** Порт 6 файлов Models из Swift: AuthModels,
  ContentModels, HomeworkModels, TeacherModels, AnalyticsModels,
  JsonValue→JsonElement-хелперы. snake_case через @SerialName. Юнит-тесты
  декодирования на фикстурах реальных форм ответов (из iOS-кода/доков).
- **Т4. Сетевое ядро.** Порт SupabaseConfig, SupabaseClient (GoTrue
  signIn/refresh/logout; PostgREST rpc/select/insert; авто-refresh <60 с;
  401-ретрай once + forceRefresh; сетевые ретраи только IOException,
  backoff 350/800/1500 мс; таймаут 20 с; rpcSingleRow), SupabaseError
  (sealed, русские тексты 1-в-1 с iOS), SupabaseAuthFlows (signup/resend/
  recover/PKCE), SessionStore (интерфейс + InMemory).
- **Т5. Контент и чистая логика.** Порт ContentService (index.json,
  манифесты, ПАРАЛЛЕЛЬНЫЙ прогрев, buildQuestions с резолвом answer_spec
  + params, randomQuestions со спредом, protoCards по baseId,
  analogQuestion, videoURL c фоллбэком по baseId), AnswerChecker
  (нормализация + number/text/ege_decimal), ScoreForecast (таблица +
  интерполяция).
- **Т6. Подбор и кеши.** Порт StudentPickEngine (двухпроходная ротация;
  фильтр = ОДИН resolve-батч со всеми бакетами, over-fetch want+6 cap 40,
  exclude, добор без фильтра), ProtoStatsCache (TTL 60 с, дедупликация,
  teacher: proto_last3 + question_stats_v2 по реальным question_ids;
  self: всё из proto_last3_for_self_v1), TrainingDraftStore (интерфейс +
  InMemory, TTL 12 ч).
- **Т7. RPC-сервисы + полный harness.** Порт AuthService, HomeworkService,
  StudentService (вкл. consent self-часть), TeacherService (вкл. consent
  teacher-часть, session links, assign). Порт DevHarness/main.swift →
  :harness целиком: все проверки iOS-набора, применимые к :core
  (юниты + интеграционные против прода; write — за флагами
  EGE_WRITE_SUBMIT/EGE_WRITE_CREATE). Гейт: read-only прогон зелёный.
- **Т8. Каркас :app + отчёт.** Заглушка-экран Compose, установка на
  эмулятор, скриншот; `reports/wand_0_report.md` + артефакты
  `reports/wand_0/` (скриншот, вывод harness, версии тулчейна).

## 6. Данные / контракты / миграции

Как в `WAND_PLAN.md §6`: новых RPC/SQL нет; используются существующие
контракты; harness ходит на прод тестовыми аккаунтами из `.env.local`
(`E2E_STUDENT_EMAIL/PASSWORD`, `E2E_TEACHER_EMAIL/PASSWORD`); write-следы
только `source='test'`, `meta.client='android'`.

## 7. Риски и stop-ask точки

- Загрузки ~5–8 ГБ: сеть/зеркала могут падать — ретраить; если URL
  недоступны системно, stop-ask (вариант: ручная установка оператором).
- Intel-эмулятор: первый бут до 2–5 мин — использовать snapshot после
  первого бута; headless для скриптов.
- Версии AGP/Kotlin/Compose: фиксируются в Т2; несовместимость — решать
  внутри скоупа (даунгрейд/апгрейд пары версий), отмечать в отчёте.
- `.env.local` отсутствует или креды невалидны → stop-ask (harness без
  кредов = только юнит-часть, DoD не закрыт).
- Любое расхождение фактической сигнатуры RPC с реестром/iOS — stop-ask
  (триггер 3 autonomy policy).

> **Режим работы: автономный** — формулировка и закрытый список stop-ask
> 1–10 наследуются из `WAND_PLAN.md §7` дословно, с заменой «§5.5 auth»
> на «Т4/Т7 GoTrue-порт» (red-zone-аспект: код auth-флоу портируется
> 1-в-1 без изменения серверных настроек; одобрено оператором при
> утверждении трека и старте волны).
>
> **Дополнительный процессный инвариант волны (требование оператора):**
> задача чек-листа закрывается ТОЛЬКО после PASS независимого
> агента-проверяющего по соответствующему пункту §9. FAIL → фикс →
> повторная независимая проверка. Два подряд FAIL одной задачи по
> неясной причине → stop-ask (триггер 8).

## 8. Критерии приёмки (DoD)

1. Т1–Т8 выполнены, каждая — с PASS независимой проверки по §9.
2. `./gradlew :app:assembleDebug :core:test :harness:installDist` —
   без ошибок на чистом окружении (env из `~/.zprofile`).
3. Harness против прода: все read-only проверки зелёные; покрытие
   проверок — не уже iOS DevHarness (поимённое сопоставление в отчёте);
   write-проверки зелёные (один прогон, следы зафиксированы в отчёте).
4. :core не содержит Android-зависимостей (компилируется как чистый JVM).
5. Пустой :app запускается на эмуляторе, скриншот в `reports/wand_0/`.
6. `git status`: изменения только в `android/**`, `reports/**` (+ планы).
7. Отчёт `reports/wand_0_report.md`.

## 9. План проверки (спроектирован ДО реализации; инструкции verifier-агентам)

Каждую проверку выполняет **независимый агент** (не автор кода), которому
передаётся ТОЛЬКО соответствующий блок §9 (без описания того, «как
делалось»). Вердикт: PASS / FAIL с доказательствами (вывод команд, цитаты
кода). Общая преамбула для каждого агента: рабочая директория
`/Users/anton/Projects/EGE_trainer`; env: `export JAVA_HOME=$(ls -d ~/tools/jdk-17* | head -1)/Contents/Home; export ANDROID_HOME=$HOME/Library/Android/sdk; export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"`.

### П-Т1 (среда)
1. `java -version` → major 17.
2. `sdkmanager --list_installed` содержит: platform-tools; build-tools;
   platforms;android-35; emulator; system-images;android-35;google_apis;x86_64.
3. `adb version` работает; `avdmanager list avd` содержит ≥1 AVD.
4. Эмулятор бутится: `adb shell getprop sys.boot_completed` → `1`
   (запустить, если не запущен: `emulator -avd <имя> -no-snapshot-save &`,
   ждать до 360 с).
5. `adb exec-out screencap -p > /tmp/p1.png` — файл >10 КБ, валидный PNG
   (`file /tmp/p1.png`).

### П-Т2 (скелет)
1. `cd android/EGETrainerApp && ./gradlew -q :app:assembleDebug` — BUILD
   SUCCESSFUL; APK существует в `app/build/outputs/apk/debug/`.
2. `./gradlew -q :harness:run --args="--selftest"` печатает строку
   `HARNESS_SELFTEST_OK` и выходит с кодом 0.
3. `core/build.gradle.kts` НЕ содержит `com.android` плагинов и
   `android {}` блока; grep по `core/src/main` на `import android.` →
   пусто.
4. Установка на эмулятор: `adb install -r app/build/outputs/apk/debug/app-debug.apk`,
   `adb shell am start -n ru.egetrainer.app/.MainActivity`, через 5 с
   `adb shell pidof ru.egetrainer.app` непуст.

### П-Т3 (модели)
1. `./gradlew -q :core:test --tests '*Model*'` — зелёные; в отчёте тестов
   есть кейсы декодирования для: AuthSession/Profile, TopicManifest/
   Prototype/AnswerSpec, Homework/HomeworkAttempt, PickingScreen/
   ResolveBatchResult/ProtoLast3Stat, AnalyticsScreen.
2. Полевая сверка с эталоном: открыть `ios/EGETrainerApp/EGETrainerApp/Models/*.swift`
   и соответствующие `android/.../core/.../models/*.kt`; для КАЖДОЙ
   структуры из Swift существует Kotlin-аналог, и набор полей/опциональность
   совпадают (допустимы идиоматические переименования при сохранении
   @SerialName). Перечислить расхождения; любое поле, потерянное без
   комментария-обоснования, = FAIL.
3. В тестах есть негативный кейс (лишнее/отсутствующее поле JSON не
   валит декодер там, где iOS терпим — ignoreUnknownKeys).

### П-Т4 (сетевое ядро)
1. Кодовая сверка с `SupabaseClient.swift`/`SupabaseAuthFlows.swift`/
   `SupabaseError.swift`/`SessionStore.swift`: (а) refresh при <60 с до
   истечения; (б) ровно один 401-ретрай с принудительным refresh;
   (в) ретраи только сетевых исключений с задержками 350/800/1500 мс;
   (г) таймаут 20 с; (д) rpcSingleRow разворачивает и объект, и массив;
   (е) PKCE: S256, verifier 43–128 симв., redirect `egetrainer://auth-callback`;
   (ж) русские сообщения ошибок присутствуют. Каждый пункт — цитатой кода.
2. `./gradlew -q :core:test --tests '*Client*' --tests '*Error*'` зелёные
   (юниты на маппинг ошибок и параметры ретраев — без сети).
3. Живой прогон: креды из `.env.local` → `./gradlew -q :harness:run
   --args="--block auth"` → строки `OK auth.student.signin`,
   `OK auth.teacher.signin`, `OK auth.refresh`, `OK auth.profile`,
   exit 0. (Имена блоков/проверок — контракт §9, реализация обязана им
   следовать.)

### П-Т5 (контент и чистая логика)
1. `./gradlew -q :harness:run --args="--block unit"` → `OK unit.checker.*`
   (минимум: целое, десятичная запятая→точка, унарный минус юникодом,
   дробь a/b, tolerance, text exact, text regex+flags, ege_decimal),
   `OK unit.forecast.*` (значения таблицы пересчёта — спот-чек ≥5 точек,
   включая границы 0 и 12 первичных), exit 0.
2. `--block content` → `OK content.index` (≥10 секций), `OK content.manifest`
   (загрузка манифеста реальной темы с прототипами), `OK content.build`
   (RunQuestion с непустыми stem и эталонным ответом; для вопроса с
   картинкой — непустой figure-URL на contentBaseURL), `OK content.video`
   (видео-URL для известного прототипа ИЛИ фоллбэк по baseId — embed-форма
   rutube `play/embed`).
3. Кодовая сверка: прогрев манифестов параллельный (coroutines async/
   awaitAll, НЕ последовательный цикл) — цитата кода; baseId = id без
   последнего числового сегмента — цитата + юнит-тест.

### П-Т6 (подбор и кеши)
1. `--block pick` → `OK pick.spread` (юнит: при want≤числу баз пройд 1
   не дублирует базовые прототипы), `OK pick.resolve.batch` (живой:
   resolve-батч с ≥3 бакетами разных scope_kind за ОДИН RPC-вызов —
   verifier подтверждает по логу harness, что вызов один, и каждый бакет
   получил атрибуцию scope_kind/scope_id), `OK pick.filtered`
   (живой: фильтр stale/unseen_low возвращает задачи; при дефиците —
   добор без фильтра помечен в результате), exit 0.
2. Кодовая сверка со `StudentPickEngine.swift`/`ProtoStatsCache.swift`:
   over-fetch want+6 cap 40; scope-приоритет proto>topic>section;
   ProtoStatsCache TTL 60 с + дедупликация конкурентных прогревов
   (запуск двух параллельных load одного ключа → один сетевой вызов —
   юнит с фейковым клиентом); TrainingDraftStore TTL 12 ч — юнит.
3. `question_stats_for_teacher_v2` вызывается СТРОГО с p_student_id +
   p_question_ids (никаких других параметров) — цитата кода.

### П-Т7 (RPC-сервисы + полный harness)
1. Полный read-only прогон: `./gradlew -q :harness:run` (без флагов,
   креды из `.env.local`) → суммарная строка вида `TOTAL ok=<N> fail=0`,
   N ≥ 37, exit 0.
2. Поимённое покрытие: в выводе есть проверки доменов: auth (вход обеих
   ролей, refresh, профиль), unit (checker/forecast), content, каталог,
   analytics self+teacher, picking screen + resolve batch, proto stats
   (teacher + self), consent (списки обеих ролей), homework (список,
   summary, архив, attempt by token), teacher (ученики, summary, работы
   ученика, отчёт по попытке), негатив (доступ чужого студента →
   ACCESS_DENIED; protected RPC без токена → AUTH_REQUIRED/401).
3. Сопоставление с iOS: открыть `ios/EGETrainerApp/DevHarness/main.swift`,
   выписать список его проверок; каждая проверка iOS либо присутствует в
   :harness, либо в отчёте волны есть строка-обоснование, почему она
   неприменима (например, чисто-iOS механика). Молча отсутствующая = FAIL.
4. Write-прогон (однократно): `EGE_WRITE_SUBMIT=1 EGE_WRITE_CREATE=1
   ./gradlew -q :harness:run --args="--block write"` → `OK write.submit`,
   `OK write.create` (+ токен созданного ДЗ в выводе), exit 0; в
   `reports/wand_0_report.md` зафиксированы write-следы.
5. Грязных изменений вне `android/**`/`reports/**`/планов нет:
   `git status --porcelain` — verifier цитирует вывод.

### П-Т8 (каркас :app + отчёт)
1. `adb install -r` свежего APK; `am start`; `pidof` непуст; 10 с спустя
   `adb logcat -d --pid $(adb shell pidof ru.egetrainer.app) *:E` не
   содержит FATAL.
2. `adb exec-out screencap` → PNG >10 КБ; на скриншоте — заглушка
   приложения (не launcher, не крэш-диалог): verifier смотрит файл глазами
   (Read image).
3. `reports/wand_0_report.md` существует и содержит: версии тулчейна,
   таблицу Т1–Т8 со ссылками на PASS-вердикты, вывод harness (итоговые
   строки), write-следы, список отклонений от iOS-эталона (или «нет»),
   остаток для оператора.

## 10. Отчётный артефакт

`reports/wand_0_report.md` + `reports/wand_0/` (скриншоты эмулятора,
полный вывод harness-прогонов, `sdkmanager --list_installed`, вердикты
независимых проверок П-Т1…П-Т8 дословно).
