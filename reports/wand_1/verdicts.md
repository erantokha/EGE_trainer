# Вердикты независимых проверок WAND.1 (дословно)

## П-У1 (тема + компоненты) — PASS 4/4

Сверка токенов tokens.css ↔ Theme.kt: light 18/18 OK, dark 16/16 OK, размерные 27/27 OK, бейдж-фоны 5/5 = base.css; пороги badgeColorByPct/ByLastAttemptAt строго = picker_common.js (цитаты обеих сторон); MaterialTheme.colorScheme только в Theme-обвязке; assembleDebug OK. Примечания verifier'а: (1) --shadow свёрнут в cardShadow с комментарием (геометрия box-shadow непереносима в Compose) — поле подключено к тени EgeCard пост-вердиктным фиксом; (2) Android-only badgeLimeFg без источника — УДАЛЁН пост-вердиктным фиксом: fg бейджа приведён к var(--text) как на вебе (base.css:914).

## П-У2 (рендер-компоненты) — PASS 7/7

charset utf-8 ✓; замер #c + ResizeObserver + повторный пост высоты ✓; containsTeX→нативный Text ✓; MathJax из assets (байт-в-байт = iOS, cmp exit 0), не CDN ✓; живой рендер: дроби/корни/степени графикой (не сырой TeX), карточки без растяжек, геометрический рисунок (параллелограмм с высотами) и 4 бейджа с пиксельно подтверждёнными цветами ✓; MetricHelp 10/10 ключей посимвольно = metric_help.js ✓; RutubeUtil.embedURL из :core ✓.

## П-У3 (сессия и каркас) — PASS 4/4

EncryptedSharedPreferences (MasterKey AES256_GCM, схемы AES256_SIV/GCM) через SessionCodec :core; plain prefs — только для не-секретов (черновики). bootstrap: restore → профиль с ретраем → роутинг; signOut: цепочка до store.clear() процитирована. Живьём: автологин → табы ученика с живым бейджем «8»; force-stop → relaunch БЕЗ кредов → сессия жива (свежий процесс подтверждён ps uptime 32с); pm clear → экран входа. Скриншоты pu3_login/relaunch/clean.

## П-У4 (auth-экран) — PASS (4/5 чисто + 1 оговорка не-дефект)

Кодовая сверка: 3 вкладки, поля регистрации (роль/ФИ/класс 5–11/тип school|tutor/пароль ≥6), все 5 валидационных текстов дословно = tasks/auth.js, оба info-текста = iOS, submit блокируется во всех 3 формах. Живьём: неверный пароль → красная «Неверный email или пароль.»; пустые поля → «Укажите фамилию и имя.» + disabled-кнопки; честный UI-вход QA-ученика (input text, без E2E-фоллбэка) → табы; выход → чистый экран входа.

Оговорка п.3 (занятый email): вместо красной плашки — зелёное «Письмо отправлено…». Корень СЕРВЕРНЫЙ: GoTrue с email-confirm на занятый подтверждённый email отвечает 200 без session (анти-enumeration), письмо не шлёт; веб ведёт себя ИДЕНТИЧНО (auth.js success-ветка). Паритет полный; ожидание в плане проверки было неверным. Клиентский маппинг «уже зарегистрирован» в коде есть на случай выключенного confirm.

Зафиксированные текстовые расхождения ВЕБ↔iOS (Android=iOS во всех): «Неверный пароль (или email).», «Почта не подтверждена…», хвосты info-текстов, «ещё раз»/«повторно» — унаследованы от принятого оператором iOS; при желании выровнять с вебом — отдельная микро-постановка.

## П-У5 (Google OAuth + completion) — PASS 7/7

Код: authorize-URL с provider/redirect_to/code_challenge/s256 ✓; pendingPkce живёт до exchange, обмен auth_code+code_verifier ✓; deep link onCreate+onNewIntent через codeFromCallback ✓; intent-filter egetrainer://auth-callback + singleTask ✓. Живьём: тап «Продолжить с Google» → Chrome/Custom Tab → api.ege-trainer.ru/authorize → РЕДИРЕКТ НА ЭКРАН GOOGLE SIGN-IN (GoTrue принял PKCE-запрос; дальше не ходили — post-wave). Fake-код deep link: без краша (тот же PID, FATAL=0), человекочитаемая плашка (серверное «invalid flow state» через SupabaseError.userMessage). CompleteProfileScreen: update_my_profile со строгими p_*-параметрами, 3 валидационных текста дословно, роутинг по needsCompletion ✓.

## П-У6 (профиль + consent) — PASS 5/5

Живьём ученик: профиль (Антон Ермолаев, Роль Ученик, Класс 11), «Мои преподаватели» ≥1 с кнопкой отвязки; диалог удаления показан и ОТМЕНЁН (деструктива не было). Правка имени: UI-ввод Test-WAND1 (кириллица недоступна adb — плановое отклонение) → подтверждено harness'ом дословно «OK auth.profile — Test-WAND1 Ермолаев» → ОТКАТ выполнен исполнителем через update_my_profile (write-след, предусмотрен планом §6) → повторный harness: «OK auth.profile — Антон Ермолаев». Живьём учитель: Роль Учитель, исходящие приглашения — корректный empty-state. Код: delete/revoke за AlertDialog, все consent-вызовы только через :core (grep прямых rpc пуст).

## П-У7 (финальная приёмка волны) — PASS 5/5

DEBUG-гейт всех 3 E2E-хуков процитирован; assembleRelease собирается (app-release-unsigned.apk 8.8 МБ). Регресс ядра: :core:test exit 0, harness read-only TOTAL ok=54 fail=0 (дважды). Все 14 скриншотов light/dark на месте; 5 осмотрены глазами: тёмная тема = тёмные панели/светлый текст/синий акцент (не стоковый Material), формулы в dark читаемы, SVG-рисунок отображается, живой бейдж «8». Отчёт полный (5 находок, write-следы с обоими harness-подтверждениями). Скоуп: дельта волны строго в android/** + reports/wand_1* + WAND_1_PLAN.md + GLOBAL_PLAN.md.

