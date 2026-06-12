# WAND.0 — отчёт исполнителя: среда, ядро (:core), harness-гейт

Дата: 2026-06-12 (автономный прогон в одной сессии). План — `WAND_0_PLAN.md`.
Процесс (требование оператора): каждая задача чек-листа = аудит → план →
реализация → **независимая проверка отдельным агентом строго по заранее
спроектированному §9**. Задача закрывалась только после PASS.

## 1. Итог

| Задача | Реализация | Независимая проверка | Вердикт |
|---|---|---|---|
| Т1 Среда (JDK 17, SDK 35, эмулятор) | ✅ | П-Т1, 5 пунктов | **PASS 5/5** |
| Т2 Gradle-скелет :core/:harness/:app | ✅ | П-Т2, 4 пункта | **PASS 4/4** |
| Т3 Модели (6 файлов) + тесты | ✅ | П-Т3, 3 пункта (56 структур, 22 теста) | **PASS** |
| Т4 Сетевое ядро | ✅ | П-Т4, 11 подпунктов + живой auth-блок | **PASS 11/11** |
| Т5 Контент + проверка ответов + прогноз | ✅ | П-Т5 + 2 пост-вердиктных фикса паритета | **PASS** |
| Т6 Движок подбора + кеши | ✅ | П-Т6, 10 подпунктов + живой pick-блок | **PASS** |
| Т7 RPC-сервисы + полный harness | ✅ | П-Т7: полный прогон, iOS-паритет 38+5, write | **PASS 5/5** |
| Т8 Каркас :app + отчёт | ✅ | П-Т8, 8 пунктов (свежая установка, скриншот глазами, полнота отчёта) | **PASS 8/8** |

Полные тексты вердиктов verifier-агентов — `reports/wand_0/verdicts_pt1_pt3.md`
и `reports/wand_0/verdicts_pt4_pt8.md` (дословно).

## 2. Что построено

### Среда (с нуля, машина Intel i7-9750H, без Homebrew/sudo)
- JDK 17.0.19 Temurin (`~/tools/jdk-17.0.19+10`), Gradle 8.9 + wrapper.
- Android SDK (`~/Library/Android/sdk`): platform-tools 37.0.0,
  build-tools 35.0.0, platforms;android-35, emulator 36.6.11,
  system-images;android-35;google_apis;x86_64. Список — `reports/wand_0/sdk_installed.txt`.
- AVD `wand_pixel` (Pixel 6, API 35); эмулятор бутится headless,
  скриншоты через `adb exec-out screencap`.
- env в `~/.zprofile` (JAVA_HOME/ANDROID_HOME/PATH).

### Проект `android/EGETrainerApp` (Kotlin 2.0.20, AGP 8.6.1, Compose BOM 2024.09)
- **:core** (чистый JVM, без Android-зависимостей — инвариант подтверждён
  grep'ом в П-Т2): 6 файлов моделей (56 структур, kotlinx-serialization,
  паритет ключей/спецлогики с iOS подтверждён П-Т3 пофайльно) + 14 файлов
  сервисов — порт всех 16 iOS-сервисов: SupabaseClient (GoTrue+PostgREST,
  авто-refresh <60 с, один 401-ретрай, backoff 350/800/1500, таймаут 20 с,
  rpcSingleRow), SupabaseAuthFlows (signup/resend/recover/PKCE S256,
  retries=0), SupabaseError (тексты побайтно = iOS), SessionStore
  (интерфейс + InMemory; шифрованная реализация — в :app на WAND.1),
  AuthService, HomeworkService, StudentService (вкл. consent ученика +
  write_answer_events_v1 c meta.client='android'), TeacherService
  (вкл. consent учителя, session-ссылки, создание/назначение ДЗ),
  ContentService (каталог/манифесты/сборка вопросов, ПАРАЛЛЕЛЬНЫЙ прогрев,
  protoCards, аналоги, видео-карта Rutube), AnswerChecker, ScoreForecast,
  StudentPickEngine (ОДИН resolve-батч, двухпроходная ротация, добор без
  фильтра), ProtoStatsCache (TTL 60 с, дедупликация прогревов),
  TrainingDraftStore (TTL 12 ч), RutubeUtil.
- **:harness** — порт DevHarness: блочная структура
  (`--selftest|--block unit|auth|content|pick|write|pickdiag`), полный
  read-only прогон. Креды: env `EGE_*` или фоллбэк `E2E_*` из `.env.local`.
- **:app** — каркас-заглушка (Compose, minSdk 26, deep-link intent-filter
  `egetrainer://auth-callback` заложен под WAND.1), устанавливается и
  работает на эмуляторе: `reports/wand_0/app_skeleton_emulator.png`.
- Юнит-тесты :core: 52 теста (22 модели + 11 сетевое ядро + 19 логика),
  все зелёные.

### Harness против прода (read-only)
Полный прогон исполнителя: **TOTAL ok=52 fail=0**
(`reports/wand_0/harness_readonly_full.txt`); финальный верифицированный
прогон П-Т7 (после добавления 2 проверок по чек-листу П-Т5):
**TOTAL ok=54 fail=0** (`reports/wand_0/harness_readonly_pt7_verify.txt`).
Покрытие шире iOS-набора (38 read-only): добавлены hw.archive,
picking.self_gate, proto_last3 self/teacher, content.manifest/video/figure_url,
pick.spread/resolve.batch/filtered, расширенный checker/forecast.

## 3. Находки и зафиксированные решения

1. **Kotlin-готча:** блочные комментарии в Kotlin ВЛОЖЕННЫЕ — `tasks/*.json`
   внутри KDoc открывает вложенный `/*` и «съедает» файл (поймано дважды,
   занесено в README проекта).
2. **kotlinx Mutex нереентерабелен** — в ProtoStatsCache владение прогревом
   решается внутри лока, сетевые вызовы строго вне (готча найдена и
   исправлена до ревью).
3. **`pick.filtered` и честный shortage:** на QA-ученике фильтр
   `unseen_low` по темам 1.1/1.2 пуст (всё решено), а тема 1.2 содержит
   один базовый прототип → сервер отдаёт максимум доступного. Первая
   редакция проверки требовала точного равенства и была СТРОЖЕ контракта
   §9; диагностика (`--block pickdiag`) показала, что движок корректен,
   проверка приведена к букве §9: итог >0, без дублей, не хуже
   фильтрованного батча, дефицит помечается как честный shortage —
   полный паритет с поведением веба/iOS.
4. **Сверка с эталоном поймала устаревший doc-comment в iOS:**
   `StudentPickEngine.swift` в комментарии описывает «последовательный
   обход бакетов», тогда как код (после фикс-волны №2) шлёт один батч —
   Kotlin следует фактическому коду; комментарий iOS можно поправить
   отдельной гигиеной (веб/iOS в этой волне не трогались).
5. **Идиоматические отклонения от iOS (зафиксированы, поведение
   эквивалентно):** actor → class+Mutex; ProtoStatsCache получает
   зависимости лямбдами (для юнит-теста дедупликации без сети);
   AuthSession.normalized() вместо нормализации в декодере (все 5
   decode-точек вызывают — проверено П-Т3); HomeworkArchivePage как
   parse(JsonElement).

## 4. Вердикты П-Т5/П-Т7 и write-следы на проде

- **П-Т5 — PASS** (unit 15/15, content live 6/6, кодовая сверка алгоритмов).
  Verifier перечислил 2 пограничных расхождения с эталоном; оба устранены
  сразу после вердикта: (1) округление подтема-% приведено к half-up
  (`floor(x+0.5)` = Math.round веба; было Math.rint = half-to-even,
  расходилось на ровно .5); (2) `parseNumber` отсекает Java-суффиксы
  `5d`/`5f` и hex-флоты (JS/Swift их не принимают). +2 юнит-теста,
  повторный прогон зелёный.
- **П-Т7 — PASS 5/5**: полный read-only `TOTAL ok=54 fail=0`
  (`reports/wand_0/harness_readonly_pt7_verify.txt`); поимённое
  сопоставление с iOS DevHarness — все 38 read-only + 5 write проверок
  имеют соответствие, Android-надмножество +16; write-прогон однократно
  `TOTAL ok=21 fail=0` (`reports/wand_0/harness_write_pt7_verify.txt`).

**Write-следы на проде (тестовые аккаунты, разрешено планом §6):**
1. Сдано несданное QA-ДЗ ученика (attempt `573fafbc-cecc-4052-bbae-33444ec30fbb`,
   верно 2 из 2; попытка уже существовала — `already=true`, идемпотентный start).
2. Создано и назначено тестовое ДЗ учителем:
   `https://ege-trainer.ru/tasks/hw.html?token=6a43189f388207c9d0b45152471b40d5`
   (2 задачи, видно ученику — проверено его токеном). Судьбу решает оператор.
3. Попытки `source='test'`, `meta.client='android'` в `answer_events`
   через write_answer_events_v1 в этой волне НЕ писались (тренировочный
   write-путь задействуется экранами WAND.2).

## 5. Версии тулчейна

JDK 17.0.19 Temurin · Gradle 8.9 · AGP 8.6.1 · Kotlin 2.0.20 ·
kotlinx-serialization 1.7.1 · kotlinx-coroutines 1.8.1 · OkHttp 4.12.0 ·
Compose BOM 2024.09.02 · SDK: platform 35, build-tools 35.0.0,
platform-tools 37.0.0, emulator 36.6.11 · AVD: Pixel 6 / API 35 / x86_64.

## 6. Скоуп

`git status`: изменения только в `android/**`, `reports/**`,
`WAND_PLAN.md`/`WAND_0_PLAN.md` и `GLOBAL_PLAN.md` (регистрация трека —
разрешено §4 плана). Веб-код, SQL, контракты, iOS-код не тронуты.

## 7. Остаток для оператора

1. Ревью волны и вердикт (ACCEPT/доработки).
2. Решить судьбу тестового ДЗ, созданного write-прогоном harness
   (токен — в §4 после П-Т7).
3. Коммит/пуш — по решению оператора (исполнитель не коммитит).
