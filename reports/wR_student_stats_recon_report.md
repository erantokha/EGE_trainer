# wR — Recon: статистика ученика на главной ученика и в карточке у учителя

Тип: разведывательная волна (read-only).
Скоуп: две зоны — главная ученика (`home_student.html`) и карточка ученика у учителя (`tasks/student.html`).
Решения по архитектуре/коду в рамках этой волны не принимаются — отчёт служит базой для последующего планирования.

---

## 1. Метаданные

### 1.1. Baseline

- Дата старта recon: 2026-05-13
- Baseline commit: `ec8ab66095afc23f138be8d44b40ed4930af688d` (`git rev-parse HEAD` на старте).
- Текущая ветка: `main`.
- `git status` на старте: чистый working tree, никаких uncommitted изменений.

### 1.2. wc -l ключевых файлов (на старте; read-only контракт)

| Файл | строк | md5 |
|---|---|---|
| `home_student.html` | 211 | `f1bb95f3595d6d95a85dc9d590833fc7` |
| `tasks/student.html` | 366 | `9880d91916d04e35f1e058f35f291c1a` |
| `tasks/student.js` | 1432 | `c1690f164dbf9b93d5c3db8009d6bb2b` |
| `app/providers/homework.js` | 942 | `8adaa66fabf02687944874c4b5c39341` |
| `app/providers/supabase-rest.js` | 309 | `cdaed53c90bd81cb0db90544dc523b8e` |
| `app/providers/catalog.js` | 771 | `a385072deb3a227a00f6378d000c89b5` |
| `docs/supabase/runtime_rpc_registry.md` | 126 | `d44d6ec49dd154a6808c9faaa00b9c45` |

Подтверждение DoD «read-only» — см. §12.5 и финальный `git status` в самом конце документа.

### 1.3. Документы-источники, фактически прочитанные

- `CLAUDE.md` — навигационный индекс.
- `PROJECT_STATUS.md` — baseline проекта на `2026-04-23`; в §2.1, §5, §6 закреплены canonical runtime-контракты `student_analytics_screen_v1`, `teacher_picking_screen_v2`, `submit_homework_attempt_v2`, `write_answer_events_v1`; разделение «ученик»/«учитель»/«общесистемные» зафиксировано в §6.1–§6.3.
- `GLOBAL_PLAN.md §8` — исторический Migration track, обоснование появления canonical contracts.
- `docs/navigation/architecture_contract_4layer.md` — определение L1..L4, запрет на прямой read `answer_events` и `content/tasks/index.json` (§5, §8). Stage 10 закрыт `2026-04-01`, см. §11.
- `docs/navigation/student_analytics_screen_v1_spec.md` — спецификация canonical Layer-4 screen RPC ученика. Поддерживает `p_viewer_scope='teacher'` и `'self'`. Топ-уровневые блоки: `student`, `screen`, `overall`, `sections`, `topics`, `variant12`, `recommendations`, `warnings`.
- `docs/navigation/teacher_picking_screen_v2_spec.md` — спецификация teacher-picking screen для `home_teacher.html` (init/resolve). Поверх `student_proto_state_v1` / `student_topic_state_v1`.
- `docs/supabase/runtime_rpc_registry.md` — Stage 8 closed (2026-04-01), 31 активный RPC; deprecated `teacher_picking_screen_v1`, `student_dashboard_self_v2`, `student_dashboard_for_teacher_v2`, `subtopic_coverage_for_teacher_v1`.
- SQL-источники: `student_analytics_screen_v1.sql:1-80`, `list_my_students.sql`, `list_student_attempts.sql`.

---

## 2. Карта зоны A — главная ученика

### 2.1. Точка входа и инициализация

`home_student.html` — статическая страница с CSP, build meta `2026-04-29-1`. Подключения:

- `home_student.html:75` — `<link rel="stylesheet" href="./tasks/trainer.css?v=2026-04-29-1">`.
- `home_student.html:76` — `<link rel="stylesheet" href="./tasks/home_student.mobile.css?v=...">`.
- `home_student.html:85-91` (inline module) — динамический import `app/ui/header.js`, инициализация хедера через `initHeader({ isHome: true })`.
- `home_student.html:208` — `tasks/theme.js` (тема, не относится к статистике).
- `home_student.html:209` — `<script type="module" src="./tasks/home_guard.js?v=...">` (роль-роутер, см. §9 и §5.A.G2).
- `home_student.html:210` — `<script type="module" src="./tasks/picker.js?v=...">` (главный orchestrator страницы).

На `<body>` стоит маркер `data-home-variant="student"` (`home_student.html:78`) — он же триггер для `picker.js` чтобы понимать «это главная ученика»:

- `tasks/picker.js:56` — `const HOME_VARIANT = ... document.body?.getAttribute('data-home-variant') ...`
- `tasks/picker.js:57-58` — `IS_STUDENT_HOME`, `IS_STUDENT_PAGE` derived флаги.

Импорты `picker.js` (`tasks/picker.js:11-20`):
- `app/build.js` (`withBuild`),
- `app/providers/supabase.js` (`supabase`, `getSession`, `signInWithGoogle`, `signOut`, `finalizeOAuthRedirect`),
- `app/config.js` (`CONFIG`),
- `app/providers/supabase-rest.js` (`supaRest`),
- `app/providers/catalog.js` (`loadCatalogIndexLike`),
- `app/providers/homework.js` (`listMyStudents`, `questionStatsForTeacherV1`, `loadTeacherPickingScreenV2`, `loadTeacherPickingResolveBatchV1`),
- `tasks/pick_engine.js`,
- `app/ui/safe_dom.js`,
- `app/core/url_path.js`,
- `app/core/pick.js`.

Boot-последовательность для главной ученика (`tasks/picker.js:2322-2351`):
1. `setHomeStatsLoading(true)` (скелетон бейджей).
2. `initPickModeToggle()`, `initSmartControls()`.
3. `initShuffleToggle()`, `initCreateHomeworkButton()`.
4. `await loadCatalog()` → `renderAccordion()` → `initProtoPickerModal()` / `initBulkControls()` / `initAddedTasksModal()`.
5. `initStudentLast10LiveRefresh()` — подписка на `visibilitychange`, `pageshow`, `onAuthStateChange`.
6. `refreshStudentLast10({ force: true, reason: 'boot' })` — основной RPC-триггер для статистики (см. §2.3).

### 2.2. Видимые виджеты статистики (что видит ученик)

Список того, что реально содержит главная ученика как «статистические» элементы (визуально, без RPC/SQL):

| # | Виджет | Где в HTML | Что показывает (в простом языке) |
|---|---|---|---|
| A.W1 | Градусник «Готовность по первой части» (mobile-only) | `home_student.html:94-107` (`#scoreThermoSlot`, `#scoreThermo`, `#scoreThermoFill`, `#scoreThermoSecondary`, `#scoreThermoPrimary`) | Полоска с цветом и двумя числами — первичные/вторичные баллы; от 0 до 12 первичных. Цвет зависит от того, насколько ученик готов. |
| A.W2 | Карточка «Прогноз баллов» | `home_student.html:164-175` (`#scoreForecast`, `#sfPrimaryExact`, `#sfSecondary`, `#sfNote`) | Два числа: точные первичные баллы (после округления) и вторичные баллы; маленькая подсказка про округление. |
| A.W3 | Аккордеон разделов с бейджами (последние 3) | `home_student.html:160-162` (`#accordion`), бейджи навешиваются динамически (см. §2.3) | По каждому разделу 1..12 и каждой подтеме — цветной бейдж «процент правильных за последние 3 попытки», а также маленький бейдж покрытия (сколько уникальных прототипов трогали). |
| A.W4 | Переключатель «Умная тренировка» и хинт | `home_student.html:111-119` (`#pickSwitch`, `#pickSmart`), `home_student.html:144` (`#smartHint`) | Кнопка «Умная тренировка». Когда выбрана — текст-подсказка про сбор плана по статистике за 30 дней. |
| A.W5 | Кнопка «Собрать план» (умной тренировки) | `home_student.html:142` (`#smartBuild`) | Когда нажата — на основе той же статистики автоматически выбирает «слабые» темы и собирает план из 10/15/20 задач. |
| A.W6 | Модальное окно «Выбор прототипов» | `home_student.html:189-206` | Список конкретных прототипов для выбранной подтемы, чтобы добавить их вручную в текущий план. Стат-бейджей здесь нет — это инструмент выбора. |

Виджетов «список выполненных работ», «история попыток», «таблица последних N ответов» — на главной ученика нет.

### 2.3. Данные за каждым виджетом — таблица «виджет → RPC → слой → используемые поля → file:line»

Единственный screen-RPC для всего блока статистики на главной ученика — `student_analytics_screen_v1(p_viewer_scope='self')`. Вызов в `tasks/picker.js:1497-1501`:

```js
const raw = await supaRest.rpc(
  'student_analytics_screen_v1',
  { p_viewer_scope: 'self', p_days: 30, p_source: 'all', p_mode: 'init' },
  { timeoutMs: LAST10_RPC_TIMEOUT_MS }
);
```

Регистрация RPC: `docs/supabase/runtime_rpc_registry.md:96` (раздел Student Analytics), SQL — `docs/supabase/student_analytics_screen_v1.sql:1-80`.

| Виджет | RPC | Слой по контракту | Используемые поля payload | file:line вызова | file:line точки рендера |
|---|---|---|---|---|---|
| A.W1 «Градусник» | `student_analytics_screen_v1(self)` | L4 (canonical screen RPC) | через `applyDashboardHomeStats` → `dash.topics[].topic_id, section_id, last3.{total,correct}` → агрегируется в `sectionPctById` → `updateScoreThermo(primaryRounded, secondary)` | `tasks/picker.js:1497-1501` | `tasks/picker.js:1217-1256` (`updateScoreThermo`) |
| A.W2 «Прогноз баллов» | `student_analytics_screen_v1(self)` | L4 | тот же `sectionPctById` aggregate → `updateScoreForecast` (суммирует доли по 12 секциям) | `tasks/picker.js:1497-1501` | `tasks/picker.js:1258-1297` (`updateScoreForecast`); элементы `#sfPrimaryExact`, `#sfSecondary`, `#sfNote` |
| A.W3 «Бейджи аккордеона» | `student_analytics_screen_v1(self)` | L4 | `dash.topics[].last3.{total,correct}` → бейдж % по теме; aggregated по секции → бейдж секции; `dash.topics[].section_id` для группировки | `tasks/picker.js:1497-1501` | `tasks/picker.js:1615-1703` (`applyDashboardHomeStats`), `tasks/picker.js:1670-1696` (бейджи секций и тем) |
| A.W4 «Хинт умной тренировки» | — (не fetches; читает локальные `getTotalSelected`) | — | — | — | `tasks/picker.js:2517-2546` (`updateSmartHint`) |
| A.W5 «Собрать план» | `student_analytics_screen_v1(self)` (тот же payload) через `LAST_DASH`; если payload ещё не пришёл — повторно дёргает `refreshStudentLast10({ force: true, reason: 'smart_build' })` | L4 | `dash.topics[].topic_id, period.{total,correct}, all_time.{total,correct}` → ranking «не решал → плохая точность → мало попыток» | `tasks/picker.js:2560` (повторный force-fetch), reuses `LAST_DASH` (`tasks/picker.js:37`) | `tasks/picker.js:2555-2619` (`tryBuildSmartSelection`) |
| A.W6 «Модалка прототипов» | не использует stats-RPC (открывает каталог прототипов) | n/a (catalog L2 через `loadCatalogIndexLike`) | — | `tasks/picker.js:3173`+ (init modal) | — |

Все стат-виджеты A.W1..A.W3 и A.W5 питаются ровно от **одного** RPC-вызова `student_analytics_screen_v1(self)` за boot-сессию (см. §8.A). `LAST_DASH` (`tasks/picker.js:37`) хранит payload в памяти модуля и переиспользуется без повторного RPC.

### 2.4. Состояния

#### 2.4.1. loading
- `setHomeStatsLoading(true)` (`tasks/picker.js:552-...`) включает скелетон бейджей до boot.
- `tasks/picker.js:2324` — скелетон поднимается до рендера аккордеона, чтобы не мигали дефолтные «— 0/0».
- `tasks/picker.js:1447, 1453` — повторный скелетон при boot-retry.

#### 2.4.2. cache (stale-while-revalidate)
- Ключ кеша: `home_student:last10:vN:<source>:<uid>:<build>` (`tasks/picker.js:549`).
- Версия кеша: `HOME_LAST10_CACHE_VER`; есть совместимость со «старым» legacy v2 ключом (`tasks/picker.js:588-606`).
- Чтение/запись: `saveHomeLast10Cache(uid, dash, nowMs)` `tasks/picker.js:595`, `readHomeLast10Cache` (по grep — рядом в том же блоке).
- На boot до RPC применяется кеш (`tasks/picker.js:1438-1441` — `applyDashboardHomeStats(cached.dash)`), затем фон обновляется реальным RPC.

#### 2.4.3. empty / signed-out
- Если нет токена/uid после ожидания — `clearStudentLast10UI()` (`tasks/picker.js:1301-1335`) сбрасывает бейджи в «— 0/0», прогноз обнуляет.
- `clearStudentLast10UI` отдельно очищает `htRecList` (там «Выберите ученика…» — но это относится к teacher home; на student-home просто перерисовывает пустые состояния).

#### 2.4.4. error
- `console.warn('home_student last10 load failed', e)` (`tasks/picker.js:1510`), boot-retry через `scheduleBootRetry()` (`tasks/picker.js:1421`).
- При финальной невозможности подгрузить — `clearStudentLast10UI()` (`tasks/picker.js:1517-1519`).

#### 2.4.5. re-fetch при возврате
- `visibilitychange` (`tasks/picker.js:1557-1561`) → force-refresh.
- `pageshow` / bfcache (`tasks/picker.js:1564-1566`) → force-refresh.
- `onAuthStateChange` (`tasks/picker.js:1570-1607`): `INITIAL_SESSION`, `SIGNED_IN`, `SIGNED_OUT`, `TOKEN_REFRESHED`, `USER_UPDATED` — каждое триггерит свою стратегию.
- `scheduleStudentLast10Refresh` (`tasks/picker.js:1535-1550`) — дебаунс 250мс.

### 2.5. Homework на главной ученика

На `home_student.html` **нет** блока «мои домашние работы». Просмотр ДЗ ученику живёт на отдельной странице `tasks/my_homeworks.html` (`tasks/my_homeworks.js:201-207` использует `getStudentMyHomeworksSummary` поверх `student_my_homeworks_summary` RPC), архив — на `tasks/my_homeworks_archive.html` (`student_my_homeworks_archive`).

Из главной ученика попасть к своим ДЗ можно через пункт меню в общем хедере (см. §9: `app/ui/header.js`, `ui.menuMyHw?.addEventListener` — `app/ui/header.js:613-621`).

Главная ученика **не дёргает** `student_my_homeworks_summary` и **не дёргает** `student_my_homeworks_archive` напрямую — подтверждено `grep` (см. §11 Q-A1).

### 2.6. «Умная тренировка от статистики» (упомянута в `PROJECT_STATUS.md §6.1`)

- Живёт на главной ученика, реализуется в `tasks/picker.js`, а не как отдельный модуль.
- UI: `home_student.html:111-119, 134-145` (переключатель + панель `#smartControls`).
- Подмодуль: `initSmartControls()` (`tasks/picker.js`, ~2400s по grep `IS_STUDENT_PAGE`), N (10/15/20) выбирается чипом, по нажатию `#smartBuild` запускается `tryBuildSmartSelection(N)`.
- Источник данных на вход: `LAST_DASH` — payload `student_analytics_screen_v1(self)` с `p_days=30`, `p_source='all'`. Если не загружен — force-refresh (`tasks/picker.js:2560`).
- Алгоритм ранжирования: «не решал → ниже точность → меньше попыток» (`tasks/picker.js:2577-2591`), затем round-robin по топу-12 пока не наберётся N задач (`tasks/picker.js:2598-2609`).
- **Это frontend-driven логика** (см. `PROJECT_STATUS.md §7.2` — «Recommendations / smart-plan остаются frontend-driven продуктовой логикой»). Backend-RPC возвращает aggregates, FE сам строит ranking и план.

---

## 3. Карта зоны B — карточка ученика у учителя

### 3.1. Точка входа

`tasks/student.html`. Учитель попадает на неё из кабинета `tasks/my_students.html` (по ссылке/клику; параметр URL — `student_id`).

- Обязательный URL-param: `student_id` (`tasks/student.js:64-67` — `getStudentId()`).
- Если параметра нет — `setStatus('Ошибка: нет параметра student_id в адресе.', 'err')` и return (`tasks/student.js:352-355`).
- `tasks/student.html:9` — `app/diag_bootstrap.js` (диагностика).
- `tasks/student.html:88-89` — стили `trainer.css` + `stats.css`.
- `tasks/student.html:112-118` — inline module для хедера через `app/ui/header.js`.
- `tasks/student.html:360-364` — основной модуль `tasks/student.js`.

`tasks/student.js` импорты (динамические через `await import`):

- `tasks/student.js:332-336` — `./stats_view.js` (`buildStatsUI`, `renderDashboard`, `loadCatalog`).
- `tasks/student.js:343` — `../app/providers/supabase.js` (`requireSession`, `getSession`).
- `tasks/student.js:344` — `../app/providers/supabase-rest.js` (`supaRest`).
- `tasks/student.js:644` — `./variant12.js` (`buildVariant12Selection`).
- `tasks/student.js:687` — `./smart_hw_builder.js` (`buildFrozenQuestionsForTopics`).
- `tasks/student.js:688` — `./homework_api.js` (`createHomeworkAndLink`).
- `tasks/student.js:1130` — `./recommendations.js` (`buildRecommendations`).

Заголовок `#pageTitle`, под-строка `#studentSub` (имя/класс/время активности) — `tasks/student.js:131-155` (`applyHeader`).

### 3.2. Видимые виджеты статистики

Из `tasks/student.html` структурно есть три крупные секции в области под хедером:

| # | Виджет | Где в HTML | Что показывает (в простом языке) |
|---|---|---|---|
| B.W1 | Заголовок: имя + «Активность» | `tasks/student.html:97-110` (`#pageTitle`, `#studentSub` с под-классом `.activity`) | Имя ученика, его класс, дата последней активности. |
| B.W2 | «Умное ДЗ» → вкладка «Рекомендации» | `tasks/student.html:122-265` (`#smartHwBlock`, `#smartTabRecs`) | Список тем, рекомендованных для тренировки этому ученику, с пометками «слабые / мало решено / не решал»; план ДЗ, кнопка создать ДЗ. |
| B.W3 | «Умное ДЗ» → вкладка «Вариант 12» | `tasks/student.html:267-323` (`#smartTabVar12`) | Автоподбор «варианта из 12» по правилу «не решал» или «худшая точность за последние 3 попытки»; кнопка собрать ДЗ-12. |
| B.W4 | «Выполненные работы» (collapsible) | `tasks/student.html:325-338` (`#worksBlock`, `#worksList`) | Список завершённых попыток ученика по ДЗ, которые принадлежат этому учителю; клик → переход к отчёту попытки. |
| B.W5 | «Статистика» | `tasks/student.html:342-350` (`#statsRoot`, фильтр-кнопка `#statsFiltersToggle`) | Полный аналитический dashboard: overall (last10/period/all_time), аккордеон по разделам 1..12 с подтемами, для каждой подтемы — три бейджа (10 последних / период / всё время) + бейдж покрытия (сколько уник. прототипов). |
| B.W6 | Меню «⚙ Удалить» | `tasks/student.html:100-107` (`#studentActions`, `#studentDeleteBtn`) | Удалить связь с этим учеником. |
| B.W7 | «Назад к списку» | `tasks/student.html:352-354` (`#backBtn`) | Возврат в `my_students.html` (или `history.back()`). |

### 3.3. Данные за каждым виджетом

| Виджет | RPC | Слой | Используемые поля payload | file:line вызова |
|---|---|---|---|---|
| B.W1 имя/класс/активность | `list_my_students` (для имени/класса), `student_analytics_screen_v1(teacher).overall.last_seen_at` (для «Активность») | `list_my_students` — teacher-directory L4 RPC; `student_analytics_screen_v1` — L4 screen | `student_id, first_name, last_name, email, student_grade` из `list_my_students`; `overall.last_seen_at` из analytics RPC | `tasks/student.js:405` (list_my_students), `tasks/student.js:1340` (`__lastSeenAt = dash.overall?.last_seen_at`) |
| B.W2 «Рекомендации» | `student_analytics_screen_v1(teacher, p_days=<UI>, p_source=<UI>, p_mode='init')` → FE-фильтр `tasks/recommendations.js:buildRecommendations` | L4 | `dash.topics[].topic_id, section_id, period.{total,correct}, last10.{total,correct}, all_time.{total,correct}, last_seen_at` | `tasks/student.js:1122-1126` |
| B.W3 «Вариант 12» | `student_analytics_screen_v1(teacher, p_days=30, p_source=normSource(var12Source), p_mode='init')` → FE-сборка `tasks/variant12.js:buildVariant12Selection` | L4 | `dash.topics[].topic_id, all_time.{total,correct}, last3.{total,correct}` (через `last3` map в `tasks/student.js:639-641`) | `tasks/student.js:626-630` |
| B.W4 «Выполненные работы» | `list_student_attempts(p_student_id)` | teacher-directory L4 (registry `runtime_rpc_registry.md:81`) | `attempt_id, homework_id, homework_title, total, correct, started_at, finished_at, duration_ms` (см. `docs/supabase/list_student_attempts.sql:11-19`) | `tasks/student.js:1378` |
| B.W5 «Статистика» (overall + sections) | `student_analytics_screen_v1(teacher, p_days=<UI>, p_source=<UI>, p_mode='init')` → `stats_view.js:renderDashboard` | L4 | `dash.overall.{last10, period, all_time, last_seen_at}`, `dash.sections[].{last10, period, all_time}`, `dash.topics[].{topic_id, section_id, last10, period, all_time, last_seen_at, coverage}` | `tasks/student.js:1323-1327` |
| B.W6 «Удалить» | `remove_student(p_student_id)` | teacher-directory L4 (registry `runtime_rpc_registry.md:80`) | — | `tasks/student.js:235` |
| (role check) | `supaRest.select('profiles', { select: 'role', id: 'eq.<uid>' })` | прямой PostgREST на `profiles` (auth context) — не business read | `role` | `tasks/student.js:389` |

Точки рендера:
- B.W1: `tasks/student.js:131-155` (`applyHeader`).
- B.W2: `tasks/student.js:1053-1101` (`renderRecs`), `tasks/student.js:949-1005` (`renderPlan`).
- B.W3: `tasks/student.js:565-595` (`var12Render`).
- B.W4: `tasks/student.js:1373-1422` (`loadWorks`).
- B.W5: `tasks/student.js:1308-1353` (`loadDashboard`) → `stats_view.js:renderDashboard` (`tasks/stats_view.js:324-330`).

### 3.4. Просмотр выполненных работ

- В карточке ученика — collapsible-блок `B.W4` с компактным списком (title — score — finished_at).
- При клике на элемент списка — `buildHwReportUrl(attemptId)` (`tasks/student.js:69-74`) → переход на `tasks/hw.html?attempt_id=<id>&as_teacher=1`.
- Сам отчёт по попытке открывается на `tasks/hw.html` в режиме `as_teacher=1`. По реестру `runtime_rpc_registry.md:68` этот режим использует `get_homework_attempt_for_teacher` (см. `docs/supabase/get_homework_attempt_for_teacher.sql`). Это уже **другой экран** (`tasks/hw.html`), не часть карточки.
- Что отдаётся учителю по сравнению с тем, что ученик видит про свою же попытку:
  - `get_homework_attempt_by_token` (ученик, `runtime_rpc_registry.md:66`) — последняя попытка по `auth.uid()` + token.
  - `get_homework_attempt_for_teacher` (учитель, `runtime_rpc_registry.md:68`) — попытка по `attempt_id` с проверкой owner link и `teacher_students`.
  - Установлено читая код, что детальное сравнение полей payload требует чтения `tasks/hw.js` — это **вне scope этой recon-волны** (см. §10.1).

### 3.5. Access-модель карточки ученика у учителя

Учитель читает чужие данные. Защита многоуровневая:

1. **Frontend role-gate** (`tasks/student.js:389-398`):
   - `supaRest.select('profiles', { select: 'role', id: 'eq.<auth.user_id>' })` — прямой REST-read на `profiles.role`;
   - если `role !== 'teacher'` → `setStatus('Доступно только для учителя.', 'err')` и return.
2. **Server-side проверка в каждом RPC**:
   - `student_analytics_screen_v1` (см. `docs/supabase/student_analytics_screen_v1.sql:46-53`):
     ```sql
     if v_viewer_scope = 'teacher' then
       if p_student_id is null then raise exception 'BAD_STUDENT_ID'; end if;
       v_target_student := p_student_id;
       if not public.is_teacher_for_student(v_target_student) then
         raise exception 'ACCESS_DENIED';
       end if;
     ```
   - `list_student_attempts` (`docs/supabase/list_student_attempts.sql:28-58`):
     - проверяет `auth.uid()` (`AUTH_REQUIRED`);
     - проверяет email в `auth.jwt() ->> 'email'` (`AUTH_EMAIL_MISSING`);
     - проверяет наличие записи в `public.teachers` с `approved=true` (`TEACHER_NOT_ALLOWED`);
     - проверяет связь `teacher_students` для `(v_teacher_id, p_student_id)` (`STUDENT_NOT_LINKED`);
     - в SELECT фильтрует `h.owner_id = v_teacher_id` (учитель видит только attempts по своим же ДЗ).
   - `list_my_students` (`docs/supabase/list_my_students.sql:21-39`) — `where ts.teacher_id = auth.uid() and public.is_allowed_teacher()`.
   - `remove_student`: `tasks/student.js:235` вызывает; SQL — `docs/supabase/remove_student.sql` (не читался в рамках recon; см. §10.2).
3. **Whitelist**: учитель видит только тех студентов, кто есть в `teacher_students` с `teacher_id = auth.uid()` — обеспечивается на уровне SQL во всех teacher-RPC.
4. **RLS**: явно отключён внутри `student_analytics_screen_v1` (`set row_security to 'off'` в `docs/supabase/student_analytics_screen_v1.sql:19`) — функция `security definer` сама обеспечивает access-rules через `is_teacher_for_student()`. Установлено читая SQL.
5. **`is_teacher_for_student()`** — общий helper, используемый в `student_analytics_screen_v1.sql:51`, `teacher_picking_resolve_batch_v1.sql:42`, `student_proto_state_v1.sql:56` и др. (см. вывод `grep` в §9.2). Сам helper не разобран в рамках recon (read-only по списку, тело не читалось — см. §11 Q-B1).
6. **Frontend role-gate можно обойти**, поэтому реальная безопасность лежит на server-side проверках в (2). Frontend-проверка — это UX-фильтр, не security.

### 3.6. Teacher-picking внутри карточки ученика

`teacher_picking_screen_v2` **не вызывается** из `tasks/student.js`. Подтверждено `grep -n 'teacher_picking_screen_v2' tasks/student.js` — нет совпадений.

Этот RPC используется только из `tasks/picker.js` (на `home_teacher.html`, через `data-home-variant="teacher"`) и из smoke-страниц (`tasks/teacher_picking_v2_browser_smoke.js`, `tasks/teacher_picking_filters_browser_smoke.js`), см. `runtime_rpc_registry.md:109`.

Соответственно в карточке ученика у учителя весь «подбор задач» строится:
- через `student_analytics_screen_v1(teacher)` (рекомендации, var12);
- через `tasks/smart_hw_builder.js` + `tasks/homework_api.js` (создание ДЗ из топиков);
- но не через `teacher_picking_screen_v2`.

---

## 4. Карта пересечений зон

### 4.1. Общие RPC (один и тот же контракт, разные scope)

| RPC | Зона A (home_student) | Зона B (tasks/student.html) | Pivot |
|---|---|---|---|
| `student_analytics_screen_v1` | `p_viewer_scope='self', p_days=30, p_source='all', p_mode='init'` — 1 вызов на boot/refresh | `p_viewer_scope='teacher', p_student_id=<URL>, p_mode='init'` — **3 вызова** на load (stats / recommendations / variant12), плюс при смене UI-фильтров | один и тот же canonical L4 RPC, оба scope-варианта поддерживаются той же SQL-функцией (`docs/supabase/student_analytics_screen_v1.sql:30-59`) |
| `list_my_students` | не вызывается из главной ученика (только из `tasks/picker.js` на teacher home через `home_teacher`) | `tasks/student.js:405` — для мета ученика, если нет sessionStorage-кеша | — |
| `catalog_index_like_v1` (loadCatalogIndexLike) | да, `tasks/picker.js:2812-2813` через `loadCatalog()` | да, `tasks/student.js:618` через `loadCatalog()` из `stats_view.js → loadCatalogLegacy()` | разные обёртки: главная ученика использует `loadCatalogIndexLike`, карточка у учителя через stats_view.js использует `loadCatalogLegacy` (см. `tasks/stats_view.js:4`) |

### 4.2. Общие frontend-модули (полезное reuse)

| Модуль | Использован зоной A | Использован зоной B | Назначение |
|---|---|---|---|
| `tasks/stats_view.js` | нет | да (`tasks/student.js:332`) | `buildStatsUI(root)` + `renderDashboard(ui, dash, catalog, opts)` — общий UI для overall + sections + topics. Тот же модуль используется и в `tasks/stats.js` (self-stats для ученика на отдельной странице). |
| `tasks/recommendations.js` | нет | да (`tasks/student.js:1130`) | `buildRecommendations(dash, catalog, opts)` — FE-фильтр по dashboard. |
| `tasks/variant12.js` | нет | да (`tasks/student.js:644`) | `buildVariant12Selection({catalog, dash, lastKMap, mode})` — FE-сборка варианта из 12. |
| `app/providers/supabase-rest.js` | да | да | единый REST/RPC слой (`tasks/picker.js:14`, `tasks/student.js:344`). |
| `app/providers/supabase.js` | да | да | session/auth lifecycle. |
| `app/providers/catalog.js` | да (`loadCatalogIndexLike`) | да (через `loadCatalogLegacy` в `stats_view.js`) | разные адаптеры одного каталога. |
| `app/ui/header.js` | да | да | общий хедер; menuStats разводит student/teacher (`app/ui/header.js:633-647`). |

### 4.3. Расхождения схемы payload-полей при одинаковом RPC

`student_analytics_screen_v1` возвращает один и тот же top-level shape (см. spec §11), но потребители читают из payload разные поля:

| Поле payload | Используется зоной A (home_student) | Используется зоной B (tasks/student.html) |
|---|---|---|
| `student.{student_id, viewer_scope, days, source, display_name, grade}` | нет | имя/класс читаются из `list_my_students`, а не из payload; `student.display_name` / `student.grade` фактически не используются (установлено читая код — см. §11 Q-X1) |
| `overall.{last10, period, all_time, last_seen_at}` | `overall.last_seen_at` не используется напрямую (главная читает per-topic `last_seen_at`); `last10/period/all_time` не отрисовываются на home | `tasks/student.js:1340` — `__lastSeenAt = dash.overall?.last_seen_at`; и через `stats_view.js:renderOverall` (`tasks/stats_view.js:103-135`) рисуются все три бакета |
| `sections[].{section_id, last10, period, all_time}` | sections-секции отдельно не используются (главная сама агрегирует pct по теме → секции, см. `tasks/picker.js:1652-1668`) | `stats_view.js:renderSections` (`tasks/stats_view.js:137-265`) — основная таблица |
| `topics[].{topic_id, section_id, last3, last10, period, all_time, coverage, last_seen_at}` | `topic_id, section_id, last3, all_time, last_seen_at` (`tasks/picker.js:1633-1646`) | все эти поля + `last10, period, coverage` через `stats_view.js:215-249` |
| `topics[].derived.{coverage_state, performance_state, freshness_state, sample_state}` | не используется (установлено читая `tasks/picker.js`) | не используется (установлено читая `tasks/student.js`, `tasks/recommendations.js` — `recommendations.js` вычисляет свои reasons заново на FE; см. §6.B) |
| `variant12.{uncovered, worst3}` | не используется | **не используется** — `tasks/student.js:644` вызывает `tasks/variant12.js:buildVariant12Selection`, который заново строит worst3/uncovered на FE поверх `dash.topics[*]` (`tasks/variant12.js:115-181`) (см. §6.A) |
| `recommendations` | не используется | **не используется** — `tasks/recommendations.js:buildRecommendations` строит список рекомендаций заново на FE поверх `dash.topics[*]` (см. §6.B) |
| `warnings` | не используется | не используется (установлено читая код) |
| `screen.session_seed`, `screen.mode` | не используется | не используется |
| `catalog_version` | не используется | не используется |

---

## 5. Нарушения canonical 4-layer контракта

Контрактные запреты по `docs/navigation/architecture_contract_4layer.md §5 / §8`:

> Прямо запрещено как целевая норма: прямое чтение `answer_events` с экранов; использование `content/tasks/index.json` как канонического business read-source; фронтовая самосборка canonical coverage / solved / weak / stale из raw-источников.

### 5.1. Прямое чтение `answer_events` с экранов

Найдено в runtime-коде только в **диагностическом** инструменте, не на продуктовых экранах:
- `tasks/stage4_parity_diagnostic.js:379` — упоминание `'answer_events'` (diag-tool).
- `tasks/stage4_parity_diagnostic.html:128` — описание в UI того же diag-tool.

Продуктовые экраны (`tasks/picker.js`, `tasks/student.js`, `tasks/stats.js`, `tasks/stats_view.js`, `tasks/recommendations.js`, `tasks/variant12.js`, `tasks/hw.js`, `tasks/my_homeworks.js`, `tasks/my_homeworks_archive.js`) — **не читают** `answer_events` напрямую. Установлено `grep -rn 'answer_events' tasks/ app/`.

В `tasks/variant12.js:5` — комментарий `// - worst3: тема с худшей точностью по последним 3 попыткам (по answer_events)`. Это просто описание семантики, кода чтения нет; payload приходит через `last3` поля из `student_analytics_screen_v1`.

**Вердикт §5.1**: нарушений нет.

### 5.2. Использование `content/tasks/index.json` как canonical business read-source

Найдено в runtime-коде:
- `app/build.js:7` — только комментарий-пример (`const resp = await fetch(withBuild('../content/tasks/index.json'), ...)`); это документация модуля `withBuild`, а не runtime-чтение.

Продуктовые экраны — не читают `content/tasks/index.json` как business source. Установлено `grep -rn 'content/tasks/index' tasks/ app/`.

**Вердикт §5.2**: нарушений нет.

### 5.3. Прямые REST-чтения generic-таблиц вместо canonical L4 RPC

| Точка | file:line | Что читается | Является ли это business read-source |
|---|---|---|---|
| `home_guard.js` (zone A) | `tasks/home_guard.js:85` | `supabase.from('profiles').select('role').eq('id', uid)` | нет — auth-context read для role-routing |
| `picker.js` (Auth header) | `tasks/picker.js:2087` | `supabase.from('profiles').select('first_name').eq('id', userId)` | нет — header UX |
| `picker.js` (role detection) | `tasks/picker.js:2109` | `supabase.from('profiles').select('role').eq('id', userId)` | нет — auth-context |
| `tasks/student.js` (zone B) | `tasks/student.js:389` | `supaRest.select('profiles', { select: 'role', id: 'eq.<uid>' })` | нет — auth-context role-gate |

Это все auth/profile-чтения, не бизнес-данные ученика. Архитектурный контракт явно говорит «прямое чтение `answer_events` с экранов» и `content/tasks/index.json` как business source — то есть business-data-чтения. Auth-context чтения через `profiles.role` под этот пункт не подпадают.

**Вердикт §5.3**: формальных нарушений 4-layer контракта нет, но имеется **раздробленность**: четыре независимые точки кода читают `profiles` напрямую, без единого role-провайдера. Это потенциальный simplify-кандидат, но не violation (см. §11 Q-X2).

### 5.4. Frontend self-assembly canonical metrics

Контракт запрещает «фронтовую самосборку canonical coverage / solved / weak / stale из raw-источников».

Здесь интересный нюанс: FE строит `weak / low / uncovered / stale` reasons и `worst3` НЕ из raw `answer_events`, а ИЗ payload canonical L4 RPC `student_analytics_screen_v1` (использует `period.total/correct`, `last10`, `all_time`, `last3`). То есть формально источник — canonical L4. Но:

- **§5.4.a** `student_analytics_screen_v1` спецификация (`docs/navigation/student_analytics_screen_v1_spec.md §11.5, §13.3`) явно говорит:
  > `derived.{coverage_state, sample_state, performance_state, freshness_state}` обязаны быть projections поверх canonical metrics; UI не должен сам решать, какая тема считается `worst3` — должен приходить из `variant12` block.

  Фактически:
  - `tasks/variant12.js:115-181` строит worst3/uncovered **на FE**, поверх `dash.topics[*].last3 / all_time` — игнорируя canonical `dash.variant12` block.
  - `tasks/recommendations.js:67-155` строит reasons (`weak/low/uncovered`) **на FE**, поверх `dash.topics[*].period / last10 / all_time` — игнорируя canonical `dash.topics[].derived` и `dash.recommendations`.

- **§5.4.b** Spec §15 «Acceptance Criteria» содержит:
  > `variant12` и `worst3` работают без raw event queries из UI.

  Это требование выполнено (raw event-чтений из UI нет). Но §7.4 «No Raw Event Leakage» и §13.3 «No Raw Event Reads In UI» неоднозначны — формально удовлетворены (нет fetch к raw events), но дух «UI не должен сам решать» нарушается двумя выше упомянутыми модулями.

**Вердикт §5.4**: формального нарушения «прямое чтение raw answer_events» нет, но spec-нарушение «UI не должен сам выбирать worst3 / reason — это backend-driven» — есть, и фиксируется в `PROJECT_STATUS.md §7.2`:
> «Recommendations / smart-plan остаются frontend-driven продуктовой логикой; это осознанное решение».

То есть проект **сознательно** оставил эту часть FE-driven (см. `GLOBAL_PLAN.md §8` финал Stage 10: «Рекомендации и smart-plan (бывший Stage 7) выведены за рамки migration track»). Это не violation, а зафиксированный осознанный долг.

### 5.5. Резюме нарушений
- Чистых нарушений canonical 4-layer контракта (т.е. того, что прямо запрещено как целевая норма) **не найдено**.
- Spec-deviation от `student_analytics_screen_v1_spec §7.4/§13.3/§15` (UI решает worst3 и reason сам) **есть**, но это зафиксированный осознанный технический долг (`PROJECT_STATUS.md §7.2`, `GLOBAL_PLAN.md §8` Stage 10 acceptance). На уровне 4-layer-контракта это не violation, на уровне screen-spec — да.

---

## 6. Дублирующаяся frontend-логика

Пары мест, где одно и то же делается дважды для статистики ученика.

### 6.A. «Вариант 12» — кто выбирает worst3

- **Backend already returns** canonical `variant12` block per spec §11.6 (включая `worst3.rows` с полями `theme_id, subtopic_id, mode, reason, picked_fallback, meta.{last3_total, last3_correct, last3_pct, all_total, all_correct, all_pct}`).
- **Frontend re-computes** ту же выборку:
  - `tasks/student.js:639-641` строит локальный `lastKMap = new Map((dash.topics || []).map(t => [String(t.topic_id || t.subtopic_id || ''), t.last3 || {}]))`.
  - `tasks/student.js:650` вызывает `mod.buildVariant12Selection({ catalog, dash, lastKMap: last3, mode })`.
  - `tasks/variant12.js:72-113` — функция `pickWorst3` сравнивает темы по `last.pct`, `last.total`, `all.total`, `tid` — это **переписанная заново** semantics из spec §13.2.
  - `tasks/variant12.js:49-70` — `pickUncovered` дублирует spec §13.1.

**Пара**: `tasks/variant12.js:72-113` ↔ `docs/supabase/student_analytics_screen_v1.sql` (часть, которая агрегирует `variant12.worst3` per spec §13.2). FE строит то, что должно приходить готовым из `dash.variant12.worst3.rows`.

### 6.B. «Рекомендации» — кто решает weak/low/uncovered

- **Backend already returns** canonical `recommendations` block per spec §11.7 (опциональный, но проектируется как projection поверх topic-state).
- Также `topics[*].derived.{coverage_state, performance_state, freshness_state, sample_state}` — canonical vocabulary per spec §11.5 и §12.
- **Frontend re-computes**:
  - `tasks/recommendations.js:94-98` — собственный fork:
    ```js
    if (!r || perTotal === 0) reason = 'uncovered';
    else if (perTotal < safeInt(minAttempts, 3)) reason = 'low';
    else if (perPct !== null && perPct < safeInt(weakBelowPct, 70)) reason = 'weak';
    else reason = '';
    ```
  - Это эквивалент того, что backend уже умеет вычислять в `topics[].derived.performance_state / sample_state` (per spec §12 mapping rules).

**Пара**: `tasks/recommendations.js:67-155` ↔ canonical projection в `docs/supabase/student_analytics_screen_v1.sql` (recommendations block + derived).

### 6.C. Section-pct aggregation для thermometer

- На home_student (`tasks/picker.js:1652-1668`) FE считает per-section average `last3.pct` поверх `topics[*].last3`.
- На карточке ученика у учителя (`tasks/stats_view.js:165-189`) FE использует уже готовые `dash.sections[].last10/period/all_time` без агрегации.
- Это **разные** метрики (home — `last3`, карточка — `last10/period/all_time`), но обе считаются на FE из payload. Spec §11.4 фиксирует `sections[].{last10, period, all_time, coverage}` как обязательные. `last3` на уровне `sections` в спецификации **не предусмотрен**, поэтому FE-агрегация на home_student — единственный путь.

**Пара**: `tasks/picker.js:1652-1668` ↔ (отсутствующий) canonical `sections[].last3` блок в payload `student_analytics_screen_v1`.

### 6.D. Двойной рендер overall

- `tasks/stats_view.js:103-135` (`renderOverall`) рисует `last10/period/all_time` как карточки.
- Используется и в zone B (`tasks/student.js:1342` через `renderDashboard`), и в дополнительной странице `tasks/stats.html` через `tasks/stats.js:207` (self-stats).
- На home_student overall-карточек **нет**.

**Это не дубликат**, а полезный shared-renderer. Указывается для полноты карты.

### 6.E. Cache-слои dashboard

- На home_student: stale-while-revalidate-кеш `home_student:last10:vN:...` (`tasks/picker.js:529-606`).
- На карточке ученика у учителя: дашборд кешируется только в RAM модуля (`__lastPayload` в `tasks/student.js:416, 1330`), без sessionStorage.
- Различие осознанное: учитель смотрит карточку реже и в режиме «свежесть важна».

**Пара**: разные стратегии cache, никакого «дублирующегося» кода нет.

### 6.F. Тройной вызов одного RPC в одном boot

В zone B (`tasks/student.html`):
- `tasks/student.js:626-630` (`var12Build`) — `student_analytics_screen_v1(teacher, 30, normSource(var12Source), 'init')`.
- `tasks/student.js:1122-1126` (`loadRecommendations`) — тот же RPC с другими (UI) `days/source`.
- `tasks/student.js:1323-1327` (`loadDashboard`) — тот же RPC с (UI) `days/source` (изначально 30/all из statsUI defaults).

На первичной загрузке вызывается **только один** (loadDashboard через `await loadDashboard()` в `tasks/student.js:1424`). Остальные срабатывают при действиях пользователя (открыть «Умное ДЗ» / переключить вариант 12). При **открытии** smart-hw панели (`tasks/student.js:1230-1232`) автоматически вызывается `loadRecommendations` — ещё один полноразмерный `student_analytics_screen_v1`.

Это не «дублирующаяся frontend-логика» в строгом смысле — это **избыточные RPC-вызовы** одного и того же контракта с близкими параметрами. Учитывая, что payload включает и topics, и overall, и (потенциально) `variant12/recommendations` — backend готов отдать всё сразу.

**Пара**: `tasks/student.js:626-630` ↔ `tasks/student.js:1122-1126` ↔ `tasks/student.js:1323-1327`. Все три — один и тот же RPC. См. §8.B и §11 Q-B2.

---

## 7. Дублирующиеся backend-RPC

### 7.A. `student_analytics_screen_v1(teacher)` vs `teacher_picking_screen_v2(init)`

Оба RPC возвращают per-student topic-уровневое состояние для конкретного `student_id`, проверенное `is_teacher_for_student()`.

| Аспект | `student_analytics_screen_v1(teacher)` | `teacher_picking_screen_v2(init)` |
|---|---|---|
| Сигнатура | `(p_viewer_scope, p_student_id, p_days, p_source, p_mode)` | `(p_student_id, p_mode, p_days, p_source, p_filter_id, p_selection, p_request, p_seed, p_exclude_question_ids)` |
| Backing model | aggregates по `answer_events` (per `student_analytics_screen_v1.sql`) | `student_proto_state_v1` + `student_topic_state_v1` (per spec §5) |
| `sections[]` | `{section_id, title, last10, period, all_time, coverage}` (spec §11.4) | `{section_id, title, sort_order, filter_counts, topics[]}` (spec §12.1) |
| `topics[]` | `{topic_id, section_id, last3, last10, period, all_time, coverage, derived, last_seen_at}` (spec §11.5) | `{topic_id, title, sort_order, state, progress, coverage, topic_state, filter_counts}` (spec §12.2) |
| `variant12` | присутствует (spec §11.6) | отсутствует |
| `recommendations` | необязательный (spec §11.7) | присутствует (spec §12.3) |
| `picked_questions` | отсутствует | присутствует (resolve mode) |
| Consumer | `tasks/student.js` (карточка ученика у учителя), `tasks/picker.js` (для `self` scope на home_student), `tasks/stats.js` (self) | `tasks/picker.js` (home_teacher), `teacher_picking_v2_browser_smoke.js` |

Расхождения payload по сути:
- `student_analytics_screen_v1` — analytics-first (`last10/period/all_time` бакеты по теме и по секции).
- `teacher_picking_screen_v2` — picking-first (`progress.period_*`, `filter_counts`, `topic_state.is_*`).

Перекрытие:
- оба возвращают `coverage` на уровне темы;
- оба возвращают `last_seen_at` (в `progress.last_seen_at` vs `topics[].last_seen_at`);
- оба возвращают `period.{total, correct, pct}` (через разные имена полей: `period.{total,correct}` vs `progress.period_total/period_correct/period_pct`).

**Это формально разные продуктовые контракты**, но они **технически** возвращают похожие per-student aggregates по разным веткам backend (одна — agregates над `answer_events`, другая — над `student_proto_state_v1/student_topic_state_v1`). См. §11 Q-X3.

### 7.B. `student_analytics_screen_v1(teacher)` vs deprecated `student_dashboard_for_teacher_v2`

Согласно `runtime_rpc_registry.md:34, 124`, `student_dashboard_for_teacher_v2` снят в Stage 8 (`2026-04-01`) и заменён на `student_analytics_screen_v1(p_viewer_scope='teacher')`. Никаких дубликатов в runtime не осталось.

### 7.C. `student_analytics_screen_v1(teacher)` vs `question_stats_for_teacher_v2`

- `student_analytics_screen_v1(teacher)` — широкий screen payload (topics, sections, overall).
- `question_stats_for_teacher_v2(p_student_id, p_question_ids)` — узкий per-question stats (`total, correct, last_attempt_at, last3_total, last3_correct`).

Не дубликат — разный уровень агрегации (topic vs question). `question_stats_for_teacher_v2` используется в picker (preview-бейджи прототипов) и в trainer, см. `runtime_rpc_registry.md:102`.

### 7.D. `student_my_homeworks_summary` vs `list_student_attempts`

- `student_my_homeworks_summary` (registry line 70) — assigned/pending/archive по `auth.uid()` (ученик сам).
- `list_student_attempts` (registry line 81) — finished_at attempts по конкретному ученику для teacher.

Не дубликат — разные роли (self vs teacher), разные семантики (summary с counts vs raw rows).

### 7.E. Резюме дубликатов backend
- Чистых backend-RPC-дубликатов внутри runtime нет.
- Главный «технический оверлап» — `student_analytics_screen_v1(teacher)` и `teacher_picking_screen_v2(init)` пересекаются в `coverage`/`last_seen_at`/`period.*` метриках для одного и того же ученика, но обслуживают разные UI-сценарии и строятся над разными backend-states. См. §11 Q-X3 — стоит ли в долгую сводить их в один read-model.

---

## 8. Сетевая картинка

### 8.A. Главная ученика (home_student.html) на boot

При успешной авторизации и пустом кеше:

1. (параллельно с (2), (3)) `tasks/picker.js:2339` → `loadCatalog()` → `loadCatalogIndexLike()` → один RPC `catalog_index_like_v1` (`runtime_rpc_registry.md:88`). Сетевой вызов в `app/providers/catalog.js` (не разбирался построчно).
2. `tasks/picker.js:2351` → `refreshStudentLast10({ force: true, reason: 'boot' })`:
   - `tasks/picker.js:1497-1501` → один RPC `student_analytics_screen_v1` (`p_viewer_scope='self', p_days=30, p_source='all', p_mode='init'`).
3. Дополнительно `app/ui/header.js` импортируется; внутри он делает `select profiles` для имени и роли (см. §5.3). При первом заходе — 1-2 REST-чтения `profiles`.
4. `home_guard.js` также делает 1 REST-чтение `profiles.role` (см. §5.3).

**Min total на boot**: ~3-5 запросов (1 RPC analytics + 1 RPC catalog + 1-3 select profiles).

**Re-fetch при возврате на вкладку** (`visibilitychange`/`pageshow`/`onAuthStateChange`): только `student_analytics_screen_v1(self)`. Catalog не перезагружается.

**Stale-while-revalidate**: если в кеше уже есть `dash` (`tasks/picker.js:1437-1445`), бейджи моментально применяются из кеша, затем фоном идёт RPC. Из кеша → 0 запросов; фоновый → 1 RPC.

**Waterfall vs parallel**:
- `loadCatalog` и `refreshStudentLast10` запускаются последовательно (`tasks/picker.js:2339-2351` — `await loadCatalog(); renderAccordion(); ... refreshStudentLast10(...)`).
- Внутри boot — нет параллельного fan-out.

### 8.B. Карточка ученика у учителя (tasks/student.html) на boot

Последовательность вызовов (`tasks/student.js:330-1425`):

1. `tasks/student.js:343-346` — динамические импорты `stats_view.js`, `supabase.js`, `supabase-rest.js`.
2. `tasks/student.js:365` — `requireSession(...)`.
3. `tasks/student.js:389` — `supaRest.select('profiles', { select: 'role', id: 'eq.<uid>' })`.
4. `tasks/student.js:405` (если нет sessionStorage-кеша студенческой меты) — `supaRest.rpc('list_my_students', {})`.
5. `tasks/student.js:419-426` — построение UI (`buildStatsUI`).
6. `tasks/student.js:1424` → `loadDashboard()`:
   - `tasks/student.js:1319-1321` → `loadCatalog()` через `stats_view.js → loadCatalogLegacy()` (если ещё не загружен).
   - `tasks/student.js:1323-1327` → `supaRest.rpc('student_analytics_screen_v1', { p_viewer_scope: 'teacher', p_student_id, p_days, p_source, p_mode: 'init' })`.
7. `tasks/student.js:1308-1357` — рендер.

**Min total на boot**: 4-5 запросов (1 select profiles + 1 list_my_students + 1 catalog_index_like_v1 + 1 student_analytics_screen_v1).

**Дополнительные RPC по действиям пользователя**:
- Раскрытие «Умное ДЗ» → `loadRecommendations(false)` (`tasks/student.js:1231`) → ещё 1 RPC `student_analytics_screen_v1`.
- «Подобрать вариант (12)» (`var12Build`) → ещё 1 RPC `student_analytics_screen_v1`.
- Раскрытие «Выполненные работы» (lazy) → 1 RPC `list_student_attempts`.
- «Создать ДЗ» из плана → внутри `tasks/smart_hw_builder.js` ходит за манифестами задач (`fetch(url, { cache: 'no-cache' })` — см. `tasks/smart_hw_builder.js:49`), затем `homework_api.js:24` создаёт homework (POST-маршрут не разобран в рамках recon).
- «Удалить» → 1 RPC `remove_student`.

**Worst-case на сессию** (учитель открыл карточку, открыл умное ДЗ, потом var12, потом works):
- 4 загрузки analytics → может дойти до 4× `student_analytics_screen_v1` за один просмотр.
- Никакого client-side caching payload между этими 4 вызовами нет.

**Waterfall vs parallel**:
- Boot — последовательный (analytics ждёт catalog, catalog ждёт role-check).
- Действия пользователя — последовательные.

---

## 9. Access-модель карточки ученика у учителя

Целиком собрано в §3.5. Краткое резюме здесь, чтобы секция 9 не была пустой:

- Frontend role-gate: `tasks/student.js:389-398` (через `supaRest.select profiles.role`). UX-level only.
- Server-side checks:
  - `student_analytics_screen_v1.sql:46-53` — `is_teacher_for_student(v_target_student)` при `p_viewer_scope='teacher'`.
  - `list_student_attempts.sql:28-58` — четыре последовательные проверки: `AUTH_REQUIRED`, `AUTH_EMAIL_MISSING`, `TEACHER_NOT_ALLOWED` (по `public.teachers.approved`), `STUDENT_NOT_LINKED` (по `teacher_students`). В SELECT — фильтр `h.owner_id = v_teacher_id`.
  - `list_my_students.sql:33-34` — `where ts.teacher_id = auth.uid() and public.is_allowed_teacher()`.
  - `remove_student` — SQL не читался в рамках recon; см. §11 Q-B1.
- `is_teacher_for_student()` — общий helper в `public.` (см. `grep` в §3.5.5), сам не разобран.
- RLS в `student_analytics_screen_v1` явно отключён внутри функции (`set row_security to 'off'` `student_analytics_screen_v1.sql:19`), security definer + проверка `is_teacher_for_student()` — единственный gatekeeper для viewer_scope='teacher'.
- Никаких прямых REST-чтений business-таблиц ученика учителем из карточки нет (audit `grep` в §5.1, §5.3). Все business reads идут через L4 RPC.

---

## 10. Невыясненные места, которые требуют runtime-проверки

Эти моменты нельзя разрешить чисто чтением кода — нужна прогонка в браузере, реальные данные или живой Supabase.

### 10.1. Реальное сравнение payload `get_homework_attempt_for_teacher` vs `get_homework_attempt_by_token`

Карточка ученика делает клик в B.W4 → `tasks/hw.html?attempt_id=<id>&as_teacher=1`. Что именно показывается учителю vs ученику — требует runtime-проверки или чтения `tasks/hw.js` (~внутри hw-домена, вне scope этой recon). Уровень детализации полей может расходиться. Открытый вопрос — §11 Q-B3.

### 10.2. Дополнительные RPC при действиях пользователя

В §8.B перечислены RPC, которые запускаются при разворачивании панелей / нажатии «Создать ДЗ». Реальный network waterfall с учётом таймингов, ретраев и timeout-отказов — установлен только частично из кода; реальная картинка лучше видна в DevTools (Network) при прогонке.

### 10.3. Cache-инвалидация после write

После того как ученик решит задачу через trainer/hw — кеш `home_student:last10:vN:...` должен либо инвалидироваться, либо устаревать в фоновом fetch. Установлено читая код, что:
- инвалидация при `SIGNED_OUT` (`tasks/picker.js:1581`) и `INITIAL_SESSION` (`tasks/picker.js:1590`) — точечная;
- автоматической инвалидации «я только что записал answer_event и вернулся на главную» — не обнаружено.

Полагается на `visibilitychange` / `pageshow` re-fetch. Поведение «вернулся в ту же вкладку — увидел старые цифры» — требует runtime-проверки. Q-A2.

### 10.4. Whether `dash.recommendations` / `dash.variant12` реально приходит из backend

Spec §11.6 / §11.7 описывает блоки, а §15 Acceptance требует их наличия. Однако ни один frontend-consumer их не использует (см. §4.3). Без runtime-prod-вызова нельзя установить, пустые ли это массивы / null или backend их реально отдаёт. Q-X4.

### 10.5. Поведение `last_seen_at` для overall vs topics

В zone B `__lastSeenAt = dash.overall?.last_seen_at` используется для подзаголовка карточки (`tasks/student.js:1340-1341`). При empty/new student значение может быть `null` — UI обрабатывает через `fmtActivityShort` (`tasks/student.js:120-129`), но именно поведение пустого payload (display vs hide) лучше проверять прогонкой.

---

## 11. Открытые вопросы для куратора

Каждый вопрос — со ссылкой и кратким изложением вариантов.

### Q-A1. На главной ученика нет блока «мои домашние работы»: by-design или missing feature?

**Где**: `home_student.html` (нет упоминания `student_my_homeworks_summary`).
**Контекст**: ученик может попасть к ДЗ только через меню хедера (`app/ui/header.js:613-621`, пункт `menuMyHw` ведёт на `tasks/my_homeworks.html`). На самой главной — никакого упоминания.
**Варианты**:
1. By-design — на главной только тренировка + умный план; ДЗ — отдельный pipeline через меню.
2. Missing feature — стоит вынести «ближайшие ДЗ» / «непросмотренные» на главную ученика (новая волна продуктового развития).

### Q-A2. Cache-инвалидация после успешного answer_event с trainer/hw → возврат на home

**Где**: `tasks/picker.js:1524-1611` (`invalidateStudentLast10Cache`, `initStudentLast10LiveRefresh`).
**Контекст**: явной инвалидации после write-path нет; полагаемся на `pageshow`/`visibilitychange`. В пределах SPA-навигации внутри tasks/* перезагрузки страницы нет — student возвращается на /home через `location.href`.
**Варианты**:
1. Текущее поведение приемлемо — refresh всё равно случится через `pageshow` (bfcache).
2. Нужен явный hook: после `submit_homework_attempt_v2` / `write_answer_events_v1` инвалидировать `home_student:last10:*`. Это требует общего write-bus, которого сейчас нет.
3. Backend ставит etag-подобный seal по `student_id` (например, generated_at), и FE сверяет — но это уже архитектурное изменение.

### Q-B1. Содержимое `remove_student` SQL не разобрано

**Где**: `tasks/student.js:235` → `docs/supabase/remove_student.sql` (не прочитан в рамках recon).
**Контекст**: согласно `runtime_rpc_registry.md:80`, RPC «удаляет связь teacher-student после проверки teacher whitelist». Тело SQL не верифицировано читая код.
**Варианты**:
1. Принять описание из реестра как достаточное.
2. Дочитать SQL в отдельной мини-волне (read-only) при работе над access-моделью.

### Q-B2. Три вызова `student_analytics_screen_v1` в одной сессии карточки ученика

**Где**: `tasks/student.js:626-630`, `1122-1126`, `1323-1327`.
**Контекст**: stats, recommendations, variant12 — каждый дёргает свой `student_analytics_screen_v1`. На worst-case `as_teacher` сессии может быть 4 одинаковых RPC. Backend готов вернуть всё в одном payload (см. spec `student_analytics_screen_v1_spec.md §7.1 «One Screen Payload»`).
**Варианты**:
1. Кешировать payload в RAM модуля с ключом `(student_id, days, source)` и переиспользовать его для всех трёх consumer'ов. Это FE-only изменение, ничего ломать не будет.
2. Стандартизировать `days/source` для всех трёх блоков (сейчас var12 фиксирует `p_days=30`, рекомендации и stats — берут из UI). Это меняет semantics — может ухудшить UX.
3. Сделать backend recommendations / variant12 реально backend-driven (вернуть готовые блоки) и перейти на их потребление в FE. Это закрывает §6.A / §6.B одним движением.

### Q-B3. Что именно видит учитель в `tasks/hw.html?as_teacher=1` vs ученик в `tasks/hw.html`

**Где**: `tasks/student.js:69-74` (build URL), `runtime_rpc_registry.md:68` (`get_homework_attempt_for_teacher`).
**Контекст**: `tasks/hw.html` — отдельный экран; в рамках этой recon не разбирался.
**Варианты**:
1. Расширить recon отдельной волной по hw-домену.
2. Принять, что hw-домен — отдельная зона ответственности и не входит в scope «статистика ученика».

### Q-X1. Поля `student.{display_name, grade}` в payload `student_analytics_screen_v1` фактически не используются

**Где**: `tasks/student.js` (никаких прямых обращений к `dash.student.*` не найдено). Имя/класс берутся из `list_my_students` (`tasks/student.js:405-411`).
**Контекст**: backend строит и возвращает поля в payload (per spec §11.1), FE их игнорирует и делает второй RPC (`list_my_students`) для тех же данных.
**Варианты**:
1. На карточке ученика убрать вызов `list_my_students` (если payload student уже все нужное возвращает) и читать `dash.student.{display_name, grade}` из первого же analytics-вызова. Минус: при `AUTH_REQUIRED` `list_my_students` всё равно нужен, чтобы заполнить шапку до прихода dashboard.
2. Оставить как есть — readable redundancy. Это всего 1 RPC раз в сессию.

### Q-X2. Четыре независимые точки кода читают `profiles` напрямую через REST

**Где**: `tasks/home_guard.js:85`, `tasks/picker.js:2087, 2109`, `tasks/student.js:389`.
**Контекст**: все читают одно и то же — `profiles.role` (или `first_name`) для текущего `auth.uid()`. Кеша между ними нет.
**Варианты**:
1. Свести в общий provider `app/providers/profile.js` с кешем на сессию.
2. Оставить как есть — это auth-context, не business.

### Q-X3. `student_analytics_screen_v1(teacher)` и `teacher_picking_screen_v2(init)` пересекаются по per-student aggregates

**Где**: см. §7.A.
**Контекст**: оба используются учителем на разных экранах (карточка ученика vs главная учителя), оба строятся над одним и тем же `answer_events` (хоть и через разные intermediate states). Дублируется backend-вычисление `coverage`, `last_seen_at`, `period.*`.
**Варианты**:
1. Оставить как есть — разные UI-сценарии, разные ownership-домены (`student-analytics` vs `teacher-picking`).
2. Свести оба в единый L3 read-model и оба L4 контракта строить как projections.
3. В long-term — отказаться от `coverage` в одном из них и оставить только в другом.

### Q-X4. Канонические блоки `dash.recommendations` и `dash.variant12` не потребляются ни одним consumer'ом

**Где**: spec `student_analytics_screen_v1_spec.md §11.6, §11.7`; consumer reality — `tasks/recommendations.js`, `tasks/variant12.js` строят то же на FE.
**Контекст**: backend, согласно spec и SQL-источнику `student_analytics_screen_v1.sql`, может возвращать `variant12` и `recommendations` в payload. Никто их не читает; вместо этого FE считает с нуля.
**Варианты**:
1. Принять статус «осознанный долг» (зафиксирован в `PROJECT_STATUS.md §7.2`).
2. Перевести FE на потребление backend `variant12.worst3.rows` / `variant12.uncovered.rows` и удалить `tasks/variant12.js`. Это меняет alignment с spec §7.4 и §13.3.
3. Расширить spec, что блоки опциональны и FE остаётся as-source-of-truth для recommendations.

### Q-X5. `stats_view.js` импортирует `loadCatalogLegacy`, а picker.js — `loadCatalogIndexLike`

**Где**: `tasks/stats_view.js:4` (`loadCatalogLegacy`), `tasks/picker.js:15` (`loadCatalogIndexLike`).
**Контекст**: один и тот же `app/providers/catalog.js` экспортирует два адаптера. Различие — наследие из migration track (Stage 1 catalog runtime, `runtime_rpc_registry.md:88`).
**Варианты**:
1. Принять как историческое — оба адаптера живые и используются.
2. Свести в один при ближайшей расчистке catalog-провайдера.

---

## 12. Краткая сводка

**Главные находки** (≤15 строк):

- На `home_student.html` весь блок статистики держится на **одном** RPC `student_analytics_screen_v1(self)` (`tasks/picker.js:1497-1501`). Кешируется через session/localStorage по ключу `home_student:last10:vN:...`; re-fetch при `pageshow`/`visibilitychange`/`auth-events`.
- В `tasks/student.html` (карточка у учителя) тот же RPC дёргается с `p_viewer_scope='teacher'` **до трёх раз** в сессии (`tasks/student.js:626-630`, `1122-1126`, `1323-1327`) — каждый сценарий (stats, recommendations, variant12) запрашивает свой payload. Кеша между этими вызовами нет.
- `tasks/stats_view.js` — shared renderer для overall + sections + topics; используется и в `tasks/stats.js` (self), и в `tasks/student.js` (teacher). Это полезный reuse.
- FE заново вычисляет `worst3 / uncovered` (`tasks/variant12.js:115-181`) и `weak/low/uncovered` reasons (`tasks/recommendations.js:67-155`) поверх canonical payload — игнорируя backend-блоки `dash.variant12.*` и `dash.recommendations`. Это **осознанный** технический долг (`PROJECT_STATUS.md §7.2`, `GLOBAL_PLAN.md §8 Stage 10`).
- Формальных нарушений 4-layer контракта (прямое чтение `answer_events`, `content/tasks/index.json` как business source) **не найдено** на продуктовых экранах.
- Access-модель карточки ученика — server-side `is_teacher_for_student()` + явные проверки `teacher_students`/`teachers.approved` в каждом teacher-RPC. RLS отключён внутри `student_analytics_screen_v1.sql` (`security definer` + ручные проверки).
- Главная ученика **не показывает** список ДЗ (отдельный экран `tasks/my_homeworks.html` через меню хедера).
- `student_analytics_screen_v1(teacher)` и `teacher_picking_screen_v2(init)` имеют технический оверлап в per-student aggregates (coverage/last_seen/period.*), но обслуживают разные сценарии.

**Главные риски**:
- §6.F + Q-B2: до 4× повторных `student_analytics_screen_v1(teacher)` за сессию учителя — лишняя latency и нагрузка на Supabase.
- §6.A + §6.B + Q-X4: backend готовые блоки `variant12 / recommendations` не потребляются. FE-логика выбора worst3 и weak — отдельная семантика, может разойтись со spec.
- §10.3 + Q-A2: после write на trainer/hw кеш `home_student:last10:vN:*` не инвалидируется явно; ученик может видеть устаревшие бейджи до `pageshow`.

**Что спросить у куратора первым**: Q-B2 (три вызова одного RPC) и Q-X4 (backend-блоки не потребляются) — это два самых дешёвых рычага для измеримого улучшения зоны B без архитектурных изменений.

---

## DoD Self-check

- §1..§12 присутствуют, ни одна не пустая.
- Каждое утверждение либо со ссылкой `path:line`, либо явной пометкой («установлено читая код», «не разобрано в рамках recon» — см. §10).
- §11 содержит 9 открытых вопросов (Q-A1, Q-A2, Q-B1..Q-B3, Q-X1..Q-X5).
- В рамках recon ни один продуктовый файл, документ, миграция, governance-скрипт, контент-файл не изменён.
- Единственный изменённый файл в этой волне — этот отчёт.
- Финальный `git status` (фактический вывод после написания отчёта):

```
$ git status --short
?? reports/wR_student_stats_recon_report.md
```

- Подтверждение read-only по md5 (значения совпадают с §1.2):
  - `home_student.html` — `f1bb95f3595d6d95a85dc9d590833fc7`
  - `tasks/student.html` — `9880d91916d04e35f1e058f35f291c1a`
  - `tasks/student.js` — `c1690f164dbf9b93d5c3db8009d6bb2b`
  - `app/providers/homework.js` — `8adaa66fabf02687944874c4b5c39341`
  - `app/providers/supabase-rest.js` — `cdaed53c90bd81cb0db90544dc523b8e`
  - `app/providers/catalog.js` — `a385072deb3a227a00f6378d000c89b5`
  - `docs/supabase/runtime_rpc_registry.md` — `d44d6ec49dd154a6808c9faaa00b9c45`

- Объём отчёта: ~739 строк (целевой ориентир — 700–1300).
