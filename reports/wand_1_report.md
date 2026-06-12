# WAND.1 — отчёт исполнителя: дизайн-система, Auth, каркас приложения

Дата: 2026-06-12 (автономный прогон). План — `WAND_1_PLAN.md`.
Процесс: каждая задача чек-листа = аудит → план → реализация →
независимая проверка отдельным агентом строго по заранее
спроектированному §9. Задача закрывалась только после PASS.

## 1. Итог

| Задача | Реализация | Независимая проверка | Вердикт |
|---|---|---|---|
| У1 Тема из tokens.css + компоненты | ✅ | П-У1 (полная сверка токенов) + 2 пост-вердиктных фикса | **PASS 4/4** |
| У2 MathTextView/Figure/Rutube/MetricHelp | ✅ | П-У2 (живой рендер глазами + cmp ассета) | **PASS 7/7** |
| У3 Сессия + каркас | ✅ | П-У3 (живой kill→relaunch, pm clear) | **PASS 4/4** |
| У4 AuthScreen (red-zone) | ✅ | П-У4 (живые негативы + честный UI-вход) | **PASS (4/5 + оговорка не-дефект)** |
| У5 Google OAuth + completion | ✅ | П-У5 (живой Custom Tab до экрана Google + фейковый код) | **PASS 7/7** |
| У6 Профиль + consent | ✅ | П-У6 (живые обе роли, правка имени с откатом) | **PASS 5/5** |
| У7 E2E-хуки + скриншоты + отчёт | ✅ | П-У7 (release, регресс, осмотр скриншотов) | **PASS 5/5** |

Полные вердикты — `reports/wand_1/verdicts.md`.

## 2. Что построено

- **Дизайн-система** (`app/.../designsystem/`): Theme.kt — все токены
  `tasks/trainer/tokens.css` 1-в-1 (light=:root, dark=[data-theme=dark],
  61 значение сверено verifier'ом), EgeDims (радиусы/шрифты/отступы/
  длительности), MaterialTheme перекрашен в наши токены (без стокового
  фиолетового); Components.kt — карточки/кнопки/бейджи (пороги
  badgeClassByPct и давности строго по picker_common.js, фоны бейджей по
  base.css)/прогресс-полоска/error/empty/loading states/Fmt-хелперы.
- **MathTextView** — WebView + vendored MathJax (байт-в-байт = iOS),
  charset utf-8, self-sizing по контейнеру #c + ResizeObserver
  (анти-«растянутые карточки»), текст без TeX — нативный Text.
- **FigureView** — рисунки задач; RutubePlayerView (embed через
  RutubeUtil); MetricHelpIcon — поповеры «?» (10 текстов 1-в-1).
- **Каркас**: EncryptedSessionStore (EncryptedSharedPreferences/Keystore,
  формат SessionCodec = iOS Keychain), AppState (bootstrap restore→
  refresh→профиль→роутинг, бейдж несданных ДЗ), RootNavigation
  (launching/auth/completion/табы ролей 4+4; контент-табы — заглушки до
  WAND.2/3, Профиль рабочий).
- **Auth-контур** (red-zone, по плану): AuthScreen — 3 вкладки, поля/
  валидация/тексты 1-в-1 с tasks/auth.js; GoogleSignIn — Custom Tabs +
  PKCE S256, deep link `egetrainer://auth-callback` (onNewIntent),
  обработка ошибки обмена; CompleteProfileScreen (порт google_complete);
  ProfileScreen — просмотр/редактирование, удаление за двойным
  подтверждением, consent-блоки ученика (входящие запросы, «Мои
  преподаватели» с отвязкой) и учителя (исходящие приглашения с отменой —
  временно в профиле до кабинета WAND.3, зафиксировано).
- **E2E-хуки** (DEBUG-only): intent extras E2E_DEMO/E2E_EMAIL/
  E2E_PASSWORD/E2E_AUTH_TAB; demo-галерея «math».

## 3. Находки и зафиксированные решения

1. **Kotlin raw-string и MathJax-разделители:** `\\\\(` в raw-строке —
   четыре символа (JS видел `\\(`), формулы в `\(..\)` не рендерились;
   исправлено на `\\(` (в Swift тот же литерал требовал четырёх `\` —
   готча порта, задокументирована в коде).
2. **DNS эмулятора (macOS):** дефолтный резолвер эмулятора не работал —
   все сетевые вызовы из приложения висли; эмулятор перезапущен с
   `-dns-server 8.8.8.8,1.1.1.1` (зафиксировано в README как обязательный
   флаг запуска).
3. **SVG-рисунки и Chromium-WebView:** SVG контента (dvisvgm: pt-размеры,
   сдвинутый viewBox) НЕ растеризуется через `<img>`-тег (onload приходит,
   пиксели не рисуются — диагностика console-логами), но как
   самостоятельный документ рендерится. FigureView: .svg → прямой
   loadUrl + overview mode; растровые — `<img>`-обёртка.
4. **Паритет фона бейджей:** по находке П-У1 текст бейджа приведён к
   `var(--text)` как на вебе (base.css:914), самодельный lime-цвет удалён;
   cardShadow подключён к тени карточки.
5. Смоук У3 поймал живой бейдж «8» несданных ДЗ с прода на табе
   «Мои ДЗ» — совпадает с harness (`pending_count=8`).

## 4. Вердикты П-У3…П-У7 и живые проверки

Все вердикты дословно — `reports/wand_1/verdicts.md`. Ключевое:
- **П-У3**: персистентность сессии доказана через kill процесса (свежий PID
  подтверждён ps), pm clear → чистый экран входа.
- **П-У4**: оговорка п.3 — НЕ дефект: GoTrue с email-confirm на занятый
  email отвечает анти-enumeration успехом (без письма); веб ведёт себя
  идентично. Паритет полный. Зафиксированы 5 текстовых расхождений
  ВЕБ↔iOS (Android=iOS) — унаследованы от принятого оператором iOS.
- **П-У5**: живой OAuth дошёл до экрана Google Sign-In — GoTrue принял
  PKCE-запрос; остался только redirect URL в Supabase (оператор).
- **П-У6**: consent-блоки живьём на обеих ролях; деструктивных действий
  не было (диалоги отменялись).
- Регресс ядра: `:core:test` зелёный, полный harness read-only
  `TOTAL ok=54 fail=0` после всех правок волны.
- Скриншоты light/dark (14 шт.) + артефакты verifier'ов — `reports/wand_1/`.

## 5. Write-следы на проде

Один обратимый след (предусмотрен планом §6): имя QA-ученика
erantokha@mail.ru изменено через UI на «Test-WAND1» (проверка
update_my_profile), затем ОТКАЧЕНО исполнителем тем же RPC; оба состояния
подтверждены harness'ом («OK auth.profile — Test-WAND1 Ермолаев» →
«OK auth.profile — Антон Ермолаев»). Письма не отправлялись (негатив
«занятый email» сервером гасится без отправки), consent-связки не
менялись, удаление не подтверждалось.

## 6. Версии/скоуп

Зависимости добавлены: security-crypto 1.1.0-alpha06, browser 1.8.0,
material-icons-core, lifecycle-viewmodel-compose 2.8.6 (+ BOM прежний).
`assembleRelease` собирается (unsigned). Изменения — только
`android/**`, `reports/**`, `WAND_1_PLAN.md` (+ статусы в GLOBAL_PLAN.md).

## 7. Остаток для оператора

1. Ревью волны и вердикт.
2. Redirect URL `egetrainer://auth-callback` в Supabase (общий с iOS) —
   для live-теста Google-входа.
3. Live-тест писем (регистрация/сброс) — по готовности.
4. Коммит волны (по правилу «коммит после каждой волны, без пуша»).
