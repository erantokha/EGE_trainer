# EGETrainerApp (Android)

Нативное Android-приложение EGE-тренажёра (Kotlin + Jetpack Compose).
Трек WAND (`WAND_PLAN.md` в корне репо), эталон — iOS-приложение
`ios/EGETrainerApp` + веб-код. Текущее состояние: WAND.0 (среда, ядро,
harness); экраны — WAND.1+.

## Модули

- `:core` — ЧИСТЫЙ Kotlin/JVM: модели (kotlinx-serialization) + сервисы
  (OkHttp): SupabaseClient (GoTrue/PostgREST, авто-refresh, 401-ретрай,
  backoff 350/800/1500 мс), AuthFlows (signup/resend/recover/PKCE),
  ContentService (каталог/манифесты/сборка вопросов, параллельный прогрев),
  AnswerChecker, ScoreForecast, StudentPickEngine (один resolve-батч,
  ротация по базам), ProtoStatsCache (TTL 60 с), TrainingDraftStore (TTL 12 ч),
  HomeworkService, StudentService, TeacherService. БЕЗ Android-зависимостей.
- `:harness` — JVM-порт iOS DevHarness: интеграционные проверки против
  прода (read-only по умолчанию; write — за флагами).
- `:app` — Android-приложение (Compose, minSdk 26, targetSdk 35).

## Среда (поднята волной WAND.0, машина Intel x64)

JDK 17 Temurin в `~/tools/jdk-17*`, Android SDK в `~/Library/Android/sdk`
(platform-tools, build-tools 35, platform android-35, emulator + образ
google_apis/x86_64), AVD `wand_pixel`. Переменные — в `~/.zprofile`
(JAVA_HOME/ANDROID_HOME/PATH).

## Команды

```bash
# сборка APK
./gradlew :app:assembleDebug

# юнит-тесты ядра (без сети)
./gradlew :core:test

# harness против прода (креды: env EGE_* или E2E_* из .env.local корня репо)
./gradlew -q :harness:run                       # полный read-only прогон
./gradlew -q :harness:run --args="--selftest"   # самопроверка без сети
./gradlew -q :harness:run --args="--block unit" # unit|auth|content|pick|write
EGE_WRITE_SUBMIT=1 EGE_WRITE_CREATE=1 ./gradlew -q :harness:run --args="--block write"  # ЗАПИСЬ на прод!

# эмулятор
emulator -avd wand_pixel -no-window -gpu swiftshader_indirect -no-audio &
adb wait-for-device; adb shell getprop sys.boot_completed   # ждать "1"
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n ru.egetrainer.app/.MainActivity
adb exec-out screencap -p > /tmp/shot.png
```

## Готчи (унаследованы из iOS-волны, см. WAND_PLAN.md Приложение B)

- Kotlin: блочные комментарии ВЛОЖЕННЫЕ — `tasks/*.json` внутри KDoc
  открывает вложенный `/*` и съедает файл (дважды поймано в WAND.0).
- Имена параметров RPC строго `p_*`; `question_stats_for_teacher_v2` —
  ТОЛЬКО p_student_id + p_question_ids.
- Подбор с фильтром — ОДИН resolve-батч со всеми бакетами; фильтр =
  приоритет, не сито (добор без фильтра); дефицит при исчерпании
  кандидатов сервера — честный shortage, не ошибка.
- kotlinx Mutex НЕреентерабелен — сетевые вызовы вне `withLock`.
- baseId: отбрасывать последний сегмент только если сегментов ≥4 и хвост
  числовой (темы 2/3-сегментные).
