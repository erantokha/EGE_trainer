# WAND_1_PLAN — волна 1: дизайн-система, Auth, каркас приложения

Дата: 2026-06-12. Трек: WAND (`WAND_PLAN.md`). Базис: WAND.0 закрыта
(коммит `f67bb904`, П-Т1…П-Т8 PASS).
Статус: утверждён оператором («приступай к волне один, всё по нашему плану»).

Процесс волны (требование оператора): по каждой задаче чек-листа §5 —
**аудит → план → реализация → независимая проверка отдельным агентом
строго по §9** (план проверки спроектирован ДО реализации). Задача
закрывается только после PASS. После закрытия волны — коммит без пуша.

---

## 1. Цель

Построить видимый фундамент приложения: дизайн-систему 1-в-1 с токенами
сайта (light/dark), рендер формул (MathJax), каркас навигации с
персистентной сессией и полный auth-контур (вход / регистрация / сброс /
Google OAuth / completion-шаг / профиль с consent-блоками). По завершении
волны: вход обеих ролей живьём на эмуляторе, сессия переживает перезапуск,
формулы рендерятся, все экраны волны визуально соответствуют мобильному
вебу в обеих темах.

## 2. Контекст и мотивация

WAND.0 дала готовое ядро (:core, 54/0 против прода) и каркас :app.
Эталоны волны: iOS `DesignSystem/{Theme,Components,MathTextView,MetricHelp,
RutubePlayerView}.swift`, `App/{AppState,RootView,DevSupport}.swift`,
`Screens/Auth/*`, `Screens/Shared/ProfileView.swift`; веб
`tasks/trainer/tokens.css` (источник палитры), `tasks/auth.js` (валидация
и тексты), `app/ui/metric_help.js` (тексты тултипов), vendored
`mathjax-tex-svg.js` (копируется as-is). Уроки iOS обязательны:
`<meta charset="utf-8">` в WebView-HTML; замер высоты по контейнеру `#c`
с ResizeObserver (анти-«растянутые карточки»); deep-link scheme
`egetrainer://auth-callback` уже заложен в манифест в WAND.0.

## 3. Out of scope

- Продуктовые экраны ученика/учителя (WAND.2/WAND.3) — главные, подбор,
  тренировка, ДЗ, статистика.
- PDF, рисовалка (WAND.4).
- Live-тест Google OAuth и писем (регистрация/сброс) — post-wave, как в
  WIOS.1: требуют redirect-URL в Supabase и доступ к почте (оператор).
  Код — в скоупе; приёмка — статическая + негативные сценарии + открытие
  OAuth-флоу до экрана Google.
- **Live-удаление аккаунта ЗАПРЕЩЕНО** (QA-аккаунты ограничены —
  signup требует email-confirm): проверка только UI до диалога
  подтверждения + кодовая сверка.
- Правки веб-кода, SQL, контрактов, iOS-кода, настроек Supabase.

## 4. Затрагиваемые файлы

Только `android/EGETrainerApp/**`, `reports/**`, этот план (+ sync
`GLOBAL_PLAN.md` после приёмки). Создаётся в `:app`:

- `designsystem/`: Theme.kt, Components.kt, MathTextView.kt, FigureView.kt,
  RutubePlayerView.kt, MetricHelp.kt
- `assets/mathjax-tex-svg.js` (копия из iOS Resources, 2 МБ)
- `storage/`: EncryptedSessionStore.kt, PrefsTrainingDraftStore.kt
- `app/`: AppState.kt (ViewModel), RootNavigation.kt, DevSupport.kt,
  правки MainActivity.kt (deep link onNewIntent, E2E-хуки)
- `screens/auth/`: AuthScreen.kt, GoogleSignIn.kt, CompleteProfileScreen.kt
- `screens/shared/`: ProfileScreen.kt
- `app/build.gradle.kts` (зависимости: androidx.browser, security-crypto,
  navigation-compose или ручной роутинг, coil при надобности — решение
  исполнителя)
- Отчёт: `reports/wand_1_report.md` + `reports/wand_1/*` (скриншоты,
  вердикты П-У1…П-У7).

В `:core` — только при находке дефекта ядра (фикс с юнитом, отметить в
отчёте). `:harness` — можно расширять проверками.

## 5. Пошаговый план (чек-лист волны)

> **Task-tracking (обязательно):** TaskCreate с задачами У1–У7;
> TaskUpdate по ходу; задача закрывается только после PASS по §9.

- **У1. Тема и компоненты.** Theme.kt: полная палитра из
  `tasks/trainer/tokens.css` — light = `:root`, dark = `[data-theme="dark"]`,
  значения hex 1-в-1 (цвета, радиусы sm/md/lg/pill, размеры шрифтов
  fs-2xs…fs-2xl, отступы, тени); системная тема (`isSystemInDarkTheme`).
  Components.kt: Primary/Secondary кнопки, карточка, бейдж (цвета порогов
  badgeClassByPct ≥90/≥70/≥50/<50 и давности), поле ввода, error-state,
  empty-state — по метрикам iOS Components.swift. Стоковый Material-вид
  не допускается.
- **У2. Рендер-компоненты.** MathTextView.kt: AndroidView+WebView,
  vendored MathJax из assets, `<meta charset="utf-8">`, разделители
  `\(..\)`/`$..$`, SVG-вывод, self-sizing через JS-bridge с замером `#c`
  + ResizeObserver (пересообщение при изменении ширины), текст без TeX —
  нативный Text (containsTeX). FigureView.kt (картинки/SVG условий с
  contentBaseURL). RutubePlayerView.kt (WebView-шит, RutubeUtil.embedURL
  из :core). MetricHelp.kt: словарь METRIC_HELP 1-в-1 с
  `app/ui/metric_help.js` + поповер «?». Demo-маршрут E2E_DEMO=math
  (DEBUG) для приёмки.
- **У3. Сессия и каркас.** EncryptedSessionStore (EncryptedSharedPreferences
  или Keystore-шифрование; формат SessionCodec из :core).
  PrefsTrainingDraftStore (SharedPreferences поверх KeyValueStore).
  AppState (ViewModel): phase = launching/signedOut/needsCompletion/
  signedIn(student|teacher), bootstrap (restore→refresh→профиль→роутинг),
  signIn/signOut, pendingHomeworksCount (заготовка под бейдж WAND.2).
  RootNavigation: phase-роутер + табы-заглушки обеих ролей (4+4, контент
  «WAND.2/3»), Профиль — рабочий.
- **У4. AuthScreen (red-zone).** Вкладки «Вход / Регистрация / Сброс
  пароля» — поля, валидация и тексты ошибок 1-в-1 с `tasks/auth.js` (как
  AuthView.swift): роль ученик/учитель, ФИ, класс 5–11 / тип
  школьный-репетитор, пароль ≥6, «Забыли пароль?», resend-письмо,
  показ/скрытие пароля, блокировка submit на время запроса, ошибки
  человекочитаемые (SupabaseError). Использует только :core AuthService.
- **У5. Google OAuth + completion (red-zone).** GoogleSignIn: PKCEPair из
  :core, Custom Tabs (androidx.browser) на oauthAuthorizeURL, перехват
  deep link `egetrainer://auth-callback` (singleTask/onNewIntent), обмен
  кода (exchangeOAuthCode), обработка отмены/ошибки. CompleteProfileScreen
  (порт google_complete: роль/ФИ/класс при needsCompletion →
  update_my_profile). Live-тест — post-wave.
- **У6. ProfileScreen.** Данные профиля, редактирование (имя/фамилия/
  класс|тип → update_my_profile), выход, удаление аккаунта (двойное
  подтверждение, БЕЗ live-вызова в приёмке). Consent-блоки: у ученика —
  входящие запросы учителей (принять/отклонить) и «Мои учителя»
  (отвязка с подтверждением); у учителя — исходящие приглашения
  (отмена). Зеркало ProfileView.swift.
- **У7. E2E-хуки + приёмка волны.** DevSupport: DEBUG-only intent extras
  `E2E_EMAIL`/`E2E_PASSWORD` (автологин), `E2E_AUTH_TAB`, `E2E_DEMO`
  (math/auth); в release не попадают (BuildConfig.DEBUG). Тап-прогон
  auth-сценариев adb'ом, скриншоты light+dark всех экранов волны в
  `reports/wand_1/`, kill→relaunch (сессия живёт), отчёт
  `reports/wand_1_report.md`.

## 6. Данные / контракты / миграции

Новых RPC/SQL нет. Используются: GoTrue password/signup/resend/recover/
authorize+pkce; `update_my_profile`, `delete_my_account` (НЕ вызывать
live), consent-набор RPC, select profiles. Прод-записи в волне: только
обратимые правки профиля QA-аккаунтов при приёмке У6 (изменить → проверить
→ откатить), consent-ответы НЕ трогать сверх чтения списков (связку
QA-учитель↔QA-ученик не разрывать!). Redirect `egetrainer://auth-callback`
в Supabase — остаток оператора (общий с iOS).

## 7. Риски и stop-ask точки

- **Red-zone:** У4/У5 (auth-flow) — одобрено оператором при старте волны
  («всё по нашему плану»); скоуп узкий: только Android-UI поверх готового
  :core, без изменения серверных настроек.
- MathJax в эмуляторном WebView: если SVG-рендер деградирует — фиксировать
  минимальную версию WebView/решение внутри скоупа, отметить в отчёте.
- Удаление аккаунта / разрыв consent-связки QA-аккаунтов = потеря
  тестовых данных → ЗАПРЕЩЕНО (см. §3/§6); нарушение = stop-ask.
- Расхождение прод vs репо — stop-ask (триггер 3).

> **Режим работы: автономный** — формулировка и закрытый список stop-ask
> 1–10 наследуются из `WAND_PLAN.md §7` с заменой проектных триггеров:
> (а) изменить веб/SQL/контракты/iOS; (б) новый RPC; (в) live-вызов
> delete_my_account или разрыв consent-связки QA-аккаунтов; (г) фича веба
> не работает на проде. Задача закрывается только после PASS независимой
> проверки §9; два подряд FAIL по неясной причине → stop-ask.

## 8. Критерии приёмки (DoD)

1. У1–У7 выполнены, каждая с PASS независимой проверки по §9.
2. `./gradlew :app:assembleDebug :app:assembleRelease :core:test` без
   ошибок; harness read-only остаётся зелёным (регресс ядра отсутствует).
3. Вход ученика И учителя живьём на эмуляторе (тап-прогон), после
   force-stop + relaunch сессия жива (без повторного входа).
4. Формулы рендерятся SVG (demo-маршрут math), карточки не растянуты.
5. Палитра/радиусы/шрифты совпадают с tokens.css по значениям (сверка
   кода) и визуально соответствуют web-reference скриншотам; light и dark.
6. Негативные auth-сценарии дают человекочитаемые ошибки (неверный пароль,
   занятый email, слабый пароль, пустые поля).
7. Google-кнопка открывает OAuth-флоу (Custom Tab с authorize-URL +
   PKCE-параметрами); deep-link обрабатывается без краша на фейковом коде.
8. `git status`: изменения только в android/**, reports/**, планах.
9. Отчёт `reports/wand_1_report.md` со скриншотами и вердиктами.

## 9. План проверки (спроектирован ДО реализации; инструкции verifier-агентам)

Преамбула для каждого verifier'а — как в `WAND_0_PLAN.md §9` (env +
`cd android/EGETrainerApp`; эмулятор `wand_pixel`; приложение
переустанавливать `adb install -r`; E2E-хуки передаются как intent extras:
`adb shell am start -n ru.egetrainer.app/.MainActivity --es E2E_EMAIL ... --es E2E_PASSWORD ...`;
скриншот `adb exec-out screencap -p`; смена темы:
`adb shell "cmd uimode night yes|no"`). Креды QA — `.env.local` корня репо.

### П-У1 (тема и компоненты)
1. Кодовая сверка значений: построчно сравни палитру в
   `app/src/main/kotlin/ru/egetrainer/app/designsystem/Theme.kt` с
   `/Users/anton/Projects/EGE_trainer/tasks/trainer/tokens.css`:
   каждый hex light-цвета = значению из `:root`, dark = из
   `[data-theme="dark"]`; радиусы/шрифтовые размеры совпадают числом.
   Перечисли ВСЕ токены tokens.css, отсутствующие в Theme.kt, — каждый
   должен иметь комментарий-обоснование (например, «не нужен до WAND.2»)
   или это FAIL.
2. В Components.kt есть Primary/Secondary кнопки, карточка, бейдж с
   порогами ≥90/≥70/≥50/<50 (сверь цвета порогов с badgeClassByPct в
   `tasks/picker.js` или iOS Components.swift), поле ввода, error/empty
   states. Стоковые MaterialTheme-цвета не используются в компонентах
   (grep по `MaterialTheme.colorScheme` вне Theme-обвязки).
3. `./gradlew -q :app:assembleDebug` зелёный.

### П-У2 (рендер-компоненты)
1. Код MathTextView.kt: (а) `<meta charset="utf-8">` в HTML; (б) замер
   ВНУТРЕННЕГО контейнера (id="c" или эквивалент) + ResizeObserver с
   повторным постом высоты; (в) containsTeX-ветка на нативный Text;
   (г) MathJax грузится из assets (не CDN). Цитаты.
2. `app/src/main/assets/mathjax-tex-svg.js` существует и БАЙТ-В-БАЙТ
   равен `ios/EGETrainerApp/EGETrainerApp/Resources/mathjax-tex-svg.js`
   (`cmp` или md5).
3. Живой рендер: запусти на эмуляторе с `--es E2E_DEMO math`, подожди
   ≤20 с, скриншот → посмотри глазами (Read): видны отрендеренные формулы
   (дроби/корни как графика, НЕ сырой `\frac`), несколько карточек разной
   высоты без гигантских пустых зон.
4. MetricHelp.kt: тексты словаря 1-в-1 с `app/ui/metric_help.js`
   (10 ключей) — diff по строкам, любые расхождения перечисли.
5. RutubePlayerView использует RutubeUtil.embedURL (цитата) — embed-форма
   уже проверена живым content.video в WAND.0.

### П-У3 (сессия и каркас)
1. Код: EncryptedSessionStore использует EncryptedSharedPreferences ИЛИ
   Keystore-шифрование (НЕ plain SharedPreferences для токенов) — цитата;
   реализует SessionStore из :core через SessionCodec.
2. AppState.bootstrap: restore → (при близком истечении) refresh →
   fetchMyProfile → роутинг по роли/needsCompletion — цитата; signOut
   чистит store.
3. Живой тест персистентности: `adb install -r`; старт с E2E_EMAIL/
   E2E_PASSWORD (ученик из .env.local) → подожди → скриншот: видны табы
   ученика (не auth-экран). Затем `adb shell am force-stop ru.egetrainer.app`,
   старт БЕЗ extras → скриншот: снова табы ученика БЕЗ экрана входа =
   сессия пережила перезапуск. Повтори force-stop → старт для учителя не
   нужно (достаточно одной роли).
4. Negative: после `adb shell pm clear ru.egetrainer.app` старт без extras
   → экран входа (чистое состояние).

### П-У4 (auth-экран)
1. Сверка полей/валидации/текстов с `tasks/auth.js` (и AuthView.swift):
   вкладки 3; роль; класс 5–11; тип учителя; пароль ≥6; тексты ошибок
   («Неверный email или пароль.», «Пользователь уже зарегистрирован…»,
   «Email не подтверждён…») — перечисли расхождения.
2. Живой негатив (тапами adb или E2E_AUTH_TAB + input): (а) вход с
   неверным паролем → на экране человекочитаемая ошибка (скриншот);
   (б) регистрация на занятый email QA-ученика → ошибка «уже
   зарегистрирован…» (скриншот; письмо НЕ уйдёт — email занят);
   (в) пустые обязательные поля → submit заблокирован или валидационное
   сообщение (скриншот).
3. Живой позитив: вход QA-ученика через UI-форму (input text adb) →
   главная ученика; выход через профиль → снова auth-экран (скриншоты).
4. Кнопка submit блокируется на время запроса (код или скриншот
   состояния «Загрузка…»).

### П-У5 (Google OAuth + completion)
1. Код: authorize-URL строится oauthAuthorizeURL с code_challenge +
   redirect egetrainer://auth-callback; verifier хранится до обмена;
   exchangeOAuthCode вызывается с code из deep link — цитаты.
2. Живой: тап «Войти через Google» → открывается Custom Tab/браузер с
   URL `api.ege-trainer.ru/auth/v1/authorize?provider=google&...
   code_challenge_method=s256` (проверь через `adb shell dumpsys activity
   activities | grep -i -E "chrome|browser|custom"` и/или logcat URL).
   Дальше экрана Google НЕ идти (live — post-wave).
3. Deep link без краша: `adb shell am start -a android.intent.action.VIEW
   -d "egetrainer://auth-callback?code=fake_code_123"` → приложение
   открывается, показывает человекочитаемую ошибку обмена (не crash;
   `pidof` жив, logcat без FATAL).
4. CompleteProfileScreen существует и дёргает update_my_profile с
   p_*-параметрами (цитата); открывается при needsCompletion (цитата
   роутинга).

### П-У6 (профиль + consent)
1. Живой (QA-ученик через E2E-автологин): открой Профиль тапами →
   скриншот: данные профиля, блоки «Мои учителя» (≥1 — QA-учитель) и
   входящие запросы; кнопка удаления аккаунта ведёт на подтверждение —
   ОСТАНОВИСЬ на диалоге, скриншот, отмена. ЗАПРЕЩЕНО: подтверждать
   удаление, отвязывать учителя, отвечать на запросы.
2. Живой (QA-учитель): Профиль → исходящие приглашения видны (или
   пустой блок с корректным empty-state), скриншот.
3. Редактирование: смени имя QA-ученика через UI на «Тест-WAND1» →
   проверь через RPC (`./gradlew -q :harness:run --args="--block auth"`
   покажет displayName в OK auth.profile) → верни исходное имя через UI →
   повторный прогон подтверждает откат. Оба прогона процитируй.
4. Код: delete_my_account за двойным подтверждением (цитата).

### П-У7 (E2E-хуки + приёмка волны)
1. Код: все E2E-обработки под `BuildConfig.DEBUG` (цитаты);
   `./gradlew -q :app:assembleRelease` собирается (unsigned), и в
   release-манифесте/коде хуки недоступны.
2. `./gradlew -q :core:test` зелёный и `./gradlew -q :harness:run`
   (read-only) → TOTAL fail=0 — регресса ядра нет.
3. Скриншоты волны в `reports/wand_1/`: auth (3 вкладки), главные-заглушки
   обеих ролей, профиль, demo math — каждый в light И dark (uimode night).
   Посмотри 4+ ключевых глазами: палитра тёмной темы — тёмные панели,
   не «белые карточки на чёрном» и не стоковый фиолетовый Material.
4. `reports/wand_1_report.md`: версии, таблица У1–У7 с PASS, отклонения,
   write-следы (правки профиля + откат), остаток оператора;
   `git status --porcelain` — дельта волны в маске.

## 10. Отчётный артефакт

`reports/wand_1_report.md` + `reports/wand_1/` (скриншоты light/dark,
вердикты П-У1…П-У7 дословно, выводы harness-прогонов).
