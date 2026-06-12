# Вердикты независимых проверок П-Т1…П-Т3 (дословно от verifier-агентов)

## П-Т1 (среда) — PASS 5/5

| Пункт | Вердикт | Доказательство (фактический вывод) |
|---|---|---|
| 1. `java -version` → major 17 | **PASS** | `openjdk version "17.0.19" 2026-04-21` / `OpenJDK Runtime Environment Temurin-17.0.19+10` |
| 2. `sdkmanager --list_installed` содержит требуемые пакеты | **PASS** | Установлены все 5: `platform-tools 37.0.0`, `build-tools;35.0.0`, `platforms;android-35 (v2)`, `emulator 36.6.11`, `system-images;android-35;google_apis;x86_64 (v9)` |
| 3. `adb version` работает; `avdmanager list avd` ≥1 AVD | **PASS** | `Android Debug Bridge version 1.0.41 (37.0.0)`; AVD: `wand_pixel` (pixel_6, Android API 35, google_apis/x86_64) |
| 4. Эмулятор бутится: `sys.boot_completed` → `1` | **PASS** | Эмулятор уже был запущен (`emulator-5554  device`); `adb shell getprop sys.boot_completed` → `1` |
| 5. Скриншот: файл >10 КБ и валидный PNG | **PASS** | `/tmp/pt1_verify.png` — 1 371 161 байт; `file`: `PNG image data, 1080 x 2400, 8-bit/color RGBA` |

**Итог: PASS** — среда полностью работоспособна; в ходе проверки ничего не чинилось.

## П-Т2 (Gradle-скелет) — PASS 4/4

| Пункт | Вердикт | Доказательство |
|---|---|---|
| 1. `:app:assembleDebug` + APK | **PASS** | EXIT_CODE=0; APK `app/build/outputs/apk/debug/app-debug.apk` (9 626 015 байт) |
| 2. `:harness:run --args="--selftest"` | **PASS** | Вывод — ровно `HARNESS_SELFTEST_OK`, exit 0 |
| 3. Чистота `:core` (JVM-only) | **PASS** | grep `com.android` / `android {` / `import android.` по :core — пусто; только kotlin("jvm") + serialization; deps: kotlinx-serialization, coroutines, okhttp |
| 4. Установка и запуск на эмуляторе | **PASS** | `adb install -r` → Success; `am start` OK; через 5 с `pidof ru.egetrainer.app` → 4325 (жив, без краша) |

**Итог: PASS (4/4).**

## П-Т3 (порт моделей) — PASS 3/3

| Пункт | Вердикт | Доказательство |
|---|---|---|
| 1. Тесты `*Model*` | **PASS** | `tests="22" failures="0" errors="0"`; покрыты все требуемые группы, включая frozen_questions как массив И строка, приоритет frozen>fixed |
| 2. Полевая сверка Swift ↔ Kotlin | **PASS** | Проверены все 56 структур: у каждой есть Kotlin-аналог, JSON-ключи 1:1, потерянных полей нет; спецлогика воспроизведена (expires_at\|expires_in через normalized() — все 5 decode-точек вызывают; answer_spec\|answerSpec; text строка-или-число; фоллбэки ключей архива; Counter.pct). Расхождения — только минорные, не строже эталона (зафиксированы в вердикте verifier-агента) |
| 3. Негативный кейс unknown keys | **PASS** | 2 теста на незнакомые поля (верхний уровень + вложенные) зелёные; `AppJson { ignoreUnknownKeys = true }` |

**Итог: PASS.** 22/22 теста, 56/56 структур.
