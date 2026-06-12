# WAND_3_PLAN — волна 3: учитель целиком (ЭКОНОМ-РЕЖИМ)

Дата: 2026-06-12. Трек: WAND (`WAND_PLAN.md`). Базис: WAND.2 (`e8fd08ac`).
Статус: утверждён оператором («волна три в том же режиме, как волна два»).

**Эконом-режим** (как WAND.2): смоуки задач делает исполнитель сам с
минимумом скриншотов; вместо verifier-агента на каждую задачу — ОДИН
батч-verifier на Sonnet по §9 (П-А кодовая сверка + П-Б живая приёмка).
Тапы со скриншотами — только в смоуках по необходимости; всё, что
проверяется harness'ом/кодом — текстом. Остальные инварианты процесса
(план до реализации, stop-ask, autonomy из `WAND_PLAN.md §7`, запреты на
деструктив) — без изменений.

## 1. Цель

Полный функционал учителя: главная (выбор ученика, прогноз, фильтры,
аккордеон с бейджами состояний, модалка прототипов teacher-scope,
«Перемешать», нижний бар), предпросмотр «Добавленные задачи» с честным
shortage, «Начать» (лист с ответами, без записи), session-ссылки,
создание ДЗ (описание, «не назначать», добавление задач), «Мои ученики»
(consent-приглашения, фильтр «Проблемные», периоды), карточка ученика
(метрики, история работ, отвязка), просмотр попытки. Эталон — финальный
iOS (`Screens/Teacher/*.swift`) поверх готового :core (TeacherService уже
проверен harness'ом в WAND.0) и дизайн-системы/общих карточек WAND.1–2.

## 2–4. Контекст / Out of scope / Файлы

Контекст: :core (TeacherService 13 RPC, 54/0), дизайн-система, общие
карточки (ProtoPickerSheet, PreviewQuestionCard, QuestionCards, StatsScreen
teacher-scope) готовы; табы-заглушки учителя заменяются реальными экранами.
Out of scope: «Умное ДЗ»/«Вариант 12» (убраны оператором на iOS), PDF и
рисовалка (WAND.4), правки веб/SQL/iOS/:core. Файлы: только
`android/EGETrainerApp/app/**` (screens/teacher/*, правки RootNavigation),
`reports/wand_3*`, этот план; `:core` — только при дефекте (с пометкой).

## 5. Чек-лист (TaskCreate Т1–Т6; задача закрыта = смоук исполнителя зелёный; вердикты — П-А/П-Б)

- **Т1. Главная учителя** (порт TeacherHomeView): выбор ученика
  (поиск-комбобокс с ранжированием префикс>слова>вхождение>email),
  карточка прогноза выбранного ученика, фильтры + бейджи состояний (через
  teacher.pickingScreen), аккордеон с счётчиками (как у ученика, но
  teacher-scope), «Перемешать», модалка прототипов teacher-scope
  (studentId != null, бейджи X/3 + ДАТЫ через question_stats_for_teacher),
  нижний бар [предпросмотр-глаз с бейджем | Начать | Создать ДЗ].
- **Т2. Предпросмотр + «Начать» + session-ссылки** (порт
  AddedTasksPreviewSheet): «Показано: X из Y», честный shortage из
  shortages[] ответа resolve, чип активного фильтра, карточки
  PreviewQuestionCard С ОТВЕТАМИ (скрываемыми), удаление, «Начать» =
  лист с открытыми ответами без записи попытки, session-ссылка
  (create_session_link) + системный share, «Создать ДЗ из подборки».
- **Т3. Создание ДЗ** (порт CreateHomeworkView): название (дефолт «ДЗ
  DD.MM»), «Описание», переключатель «Назначить этому ученику»
  (выкл = «Не назначать»), «Перемешать», prePicked refs из предпросмотра,
  добавление задач (AddTasksSheet — каталог со степперами, исключение
  добавленных), создание insert homeworks+homework_links →
  assign_homework_to_student, success-блок со ссылкой (копия/share).
- **Т4. Мои ученики** (порт MyStudentsView): приглашение по email
  (teacher_invite_student, pending-список с отменой), поиск по ФИО/email,
  фильтр «Проблемные» (сортировка форма→активность→имя), селекты
  периода/источника (teacher_students_summary p_days/p_source), переход в
  карточку, отвязка.
- **Т5. Карточка ученика + просмотр попытки** (порт StudentCardView,
  AttemptReviewView): метрики за период (StatsScreen teacher-scope или
  компактные карточки), история выполненных работ (list_student_attempts),
  переход в просмотр попытки (get_homework_attempt_for_teacher + условия из
  контента), отвязка с подтверждением.
- **Т6. Финальная приёмка + отчёт + батч-verifier**: e2e тапы (выбор
  ученика → фильтр → модалка прототипов с датами → предпросмотр shortage →
  session-ссылка → создание ДЗ → мои ученики/карточка), скриншоты ключевых
  экранов (light + 1-2 dark), `reports/wand_3_report.md`, батч-verifier на
  Sonnet (П-А + П-Б).

## 6. Контракты

Без новых RPC. Используются (все проверены harness WAND.0):
teacher_picking_screen_v2/resolve_batch_v1, question_stats_for_teacher_v2,
proto_last3_for_teacher_v1, list_my_students, teacher_students_summary,
list_student_attempts, get_homework_attempt_for_teacher,
teacher_invite_student/list_my_student_requests/cancel_student_request/
remove_student, create_session_link, insert homeworks/homework_links,
assign_homework_to_student, student_analytics_screen_v1 (teacher scope).
Write: создание/назначение ДЗ — ТОЛЬКО тестовому QA-ученику; session-ссылка;
«Начать» БЕЗ записи попытки. Деструктив (remove_student живьём, отмена
реальных приглашений) ЗАПРЕЩЁН в приёмке.

## 7. Stop-ask

Наследуется из `WAND_PLAN.md §7` + триггеры WAND.2. Два подряд FAIL
батч-verifier'а по неясной причине → stop-ask. Деструктивный teacher-RPC
(remove_student, cancel чужого приглашения) живьём — stop-ask.

## 8. DoD

1. Т1–Т5 реализованы, смоуки зелёные; Т6 пройдена.
2. Батч-verifier (Sonnet, §9) — PASS.
3. assembleDebug зелёная; :core/harness без регресса.
4. Паритет: «Выбрать все» = +1/секцию; модалка teacher-scope с ДАТАМИ
   (question_stats_for_teacher_v2 строго p_student_id+p_question_ids);
   shortage честный из shortages[]; «Начать» учителя без записи попытки;
   созданное ДЗ видно ученику (кросс-проверка по токену).
5. Скоуп: android/** + reports/wand_3* + план.

## 9. Планы батч-проверки (Sonnet)

### П-А: кодовая сверка (эталоны Screens/Teacher/*.swift)
Цитатами обеих сторон:
1. Выбор ученика — ранжирование префикс первого слова > других слов >
   вхождение > email; сброс выбора.
2. Главная teacher-scope: pickingScreen(studentId), бейджи состояний,
   «Выбрать все» = +1/секцию, модалка прототипов studentId != null.
3. Модалка teacher: бейдж X/3 + ДАТА из question_stats_for_teacher_v2
   (строго p_student_id + p_question_ids — готча iOS; v2→v1 фоллбэк в :core).
4. Предпросмотр: «Показано X из Y», честный shortage из shortages[] (текст
   с активным фильтром), карточки С ответами (скрываемыми), удаление.
5. «Начать» учителя — лист с открытыми ответами, БЕЗ writeTrainingAttempt
   (отличие от ученика — зафиксировано оператором на iOS).
6. Session-ссылка: createSessionLink(mode list/test, shuffle, frozen) →
   URL + share; без сетевых ретраев на уровне вызова.
7. Создание ДЗ: title дефолт «ДЗ DD.MM», description, «не назначать»
   (assignToStudentId=null), shuffle в spec_json, prePicked refs,
   AddTasksSheet с исключением добавленных, insert+assign.
8. Мои ученики: invite по email, pending+отмена, поиск, «Проблемные»
   (сортировка форма→активность→имя), селекты period/source.
9. Карточка: метрики teacher-scope, list_student_attempts, переход в
   attempt review (get_homework_attempt_for_teacher), отвязка с подтверждением.
Затем `./gradlew -q :app:assembleDebug` exit 0.

### П-Б: живая приёмка (Sonnet, автологин QA-учитель)
1. Главная: выбрать ученика поиском → фильтр (напр. stale) → раскрыть
   секцию → открыть модалку прототипов → скриншот (бейджи X/3 + ДАТЫ);
   набрать 2 задачи → нижний бар активен.
2. Предпросмотр: открыть → скриншот (X из Y, при фильтре — shortage-чип,
   ответы скрыты до тапа).
3. Session-ссылка: тап «поделиться» → системный share-лист появляется
   (скриншот), URL вида tasks/list.html?session=… (закрыть, не отправлять).
4. Создание ДЗ: «Создать ДЗ» → форма (описание, «не назначать»/назначить,
   перемешать) → создать на тестового QA-ученика → success со ссылкой
   (скриншот); кросс-проверка: токен открывается (get_homework_by_token
   через быстрый harness ИЛИ открыть ссылку ученика — не сдавать).
5. Мои ученики: список с метриками, фильтр «Проблемные», переход в
   карточку → история работ → открыть просмотр одной попытки (скриншот:
   условия + ответы ученика). НЕ отвязывать, приглашения не отменять.
6. Скоуп git чистый.
ЗАПРЕТЫ: remove_student/cancel чужих приглашений — НЕ нажимать; ДЗ
создавать только тестовому QA-ученику.

## 10. Отчёт

`reports/wand_3_report.md` + `reports/wand_3/` (вердикт П-А/П-Б, 4-6
скриншотов, write-следы — созданное тестовое ДЗ + session-ссылка).
