# WAND.3 — отчёт исполнителя: учитель целиком (эконом-режим)

Дата: 2026-06-12. План — `WAND_3_PLAN.md`. Базис: WAND.2 (`e8fd08ac`).
Эконом-режим (как WAND.2): смоуки задач делает исполнитель сам с минимумом
скриншотов; вместо verifier на задачу — один батч-verifier на Sonnet (§9).

## 1. Что построено (Т1–Т5)

- **Т1 Главная учителя** (`screens/teacher/TeacherHomeScreen.kt`): выбор
  ученика (поиск-шит с ранжированием), карточка прогноза, фильтры с
  бейджами состояний (teacher.pickingScreen), аккордеон teacher-scope с
  прогрессом/coverage/бейджами и счётчиками, «Перемешать», «Выбрать все»
  (+1 на секцию), модалка прототипов teacher-scope, каталожный режим без
  ученика (P6-5), нижний бар [глаз-предпросмотр+бейдж | Начать | Создать ДЗ].
  Смоук: `reports/wand_3/t1_teacher_home.png`, `t1_student_picked.png`
  (ученик «Антон Ермолаев», прогноз 16/2,82, аккордеон с %).
- **Т2 Предпросмотр + «Начать» + session** (`screens/teacher/TeacherFlows.kt`):
  AddedTasksPreviewSheet («Показано X из Y», честный shortage с чипом
  активного фильтра, ответы скрываемые, удаление, create_session_link +
  системный share, «Создать ДЗ из подборки»); TeacherListScreen («Начать»
  — лист со скрываемыми ответами, без записи попытки).
- **Т3 Создание ДЗ** (`TeacherFlows.kt` CreateHomeworkScreen): название
  (дефолт «ДЗ DD.MM»), описание, «Назначить»/«Не назначать», «Перемешать»,
  сворачиваемый предпросмотр, insert homeworks+homework_links → assign,
  success-блок со ссылкой и share.
- **Т4 Мои ученики** (`screens/teacher/MyStudentsScreen.kt`): приглашение
  по email (teacher_invite_student) с человекочитаемыми ошибками, pending
  с отменой, поиск, фильтр «Проблемные» (сортировка форма→активность→имя),
  селекты период/источник. Смоук: `reports/wand_3/t4_students.png`.
- **Т5 Карточка ученика + просмотр попытки** (`screens/teacher/StudentCardScreen.kt`):
  метрики за период (last10/period/allTime, селект 7/14/30/90), история
  работ (list_student_attempts), просмотр попытки
  (get_homework_attempt_for_teacher + условия из контента), полная
  статистика (StatsScreen teacher-scope), отвязка с подтверждением.
  Смоук: `reports/wand_3/t5_card_s.png`, `t5_attempt_s.png`.

## 2. Зафиксированные решения / находки

1. **Teacher overlay поверх табов**: TeacherTabScaffold держит overlay
   (Preview/Start/Create/Card) — открытие из главной/кабинета,
   возврат назад; аналог push/sheet-навигации iOS.
2. **Модалка прототипов teacher-scope** (общая ProtoPickerSheet,
   studentId != null) — живьём показала бейджи «3/3 11.06.26» и
   «1/3 12.06.26»: точность last-3 + ДАТА из question_stats_for_teacher_v2
   (строго p_student_id + p_question_ids, фоллбэк v1 — готча iOS).
   Скриншот: `reports/wand_3/t1_proto_modal.png`.
3. **adb-приёмка по resource-id** (testTagsAsResourceId из WAND.2) —
   выбор ученика/секции/подтемы/карточки/попытки тапами по тегам.
4. ModalBottomSheet/experimental Material API — помечены @OptIn.

## 3. Write-следы на проде

Смоуки Т1–Т5 — read-only. Батч-verifier при П-Б создал (разрешено планом):
session-ссылку на подборку и тестовое ДЗ БЕЗ назначения, токен
`fa1b298ff3bc747b28a251ed810fd353`. Деструктив (remove_student, отмена
чужих приглашений) не вызывался. Судьбу тестового ДЗ решает оператор.

## 4. Проверки

- `./gradlew :app:assembleDebug` и `:app:assembleRelease` — зелёные.
- Живые смоуки Т1–Т5 на эмуляторе (выбор ученика, teacher-scope аккордеон,
  модалка с датами, мои ученики, карточка, просмотр попытки) — скриншоты
  в `reports/wand_3/`.
- :core/harness без изменений (WAND.3 не трогала :core).
- Батч-verifier (Sonnet, П-А кодовая сверка + П-Б живая) — вердикт ниже.

## 5. Вердикт батч-verifier'а — PASS 16/16 (Sonnet)

**П-А кодовая сверка — 10/10 PASS:** ранжирование выбора ученика
(префикс первого слова > других > вхождение > email); «Выбрать все» = +1
на СЕКЦИЮ; модалка studentId != null; TeacherService.questionStats строго
p_student_id+p_question_ids (v2→v1 фоллбэк); предпросмотр «Показано X из Y»
+ честный shortage + ответы скрываемые + session-ссылка + «Создать ДЗ»;
«Начать» БЕЗ записи попытки (grep пуст); создание ДЗ (дефолт «ДЗ DD.MM»,
описание, «Не назначать», shuffle, prePicked, insert+assign); мои ученики
(invite/cancel/«Проблемные» compareBy форма→активность→имя/period+source);
карточка (метрики teacher-scope, studentAttempts, attemptForTeacher+условия,
отвязка за AlertDialog). assembleDebug + assembleRelease exit 0.

**П-Б живая приёмка — 6/6 PASS:** выбор ученика «Антон Ермолаев» (прогноз
2,82/16, секции 27%/34%/10%); модалка прототипов с бейджами «3/3 11.06.26»
и «1/3 12.06.26» (точность + ДАТА); предпросмотр «Показано 2 из 2» →
session-ссылка создана; создание ДЗ без назначения, URL
`https://ege-trainer.ru/tasks/hw.html?token=fa1b298ff3bc747b28a251ed810fd353`;
мои ученики/карточка (метрики 2/10·20%, 7/36·19%)/просмотр попытки
(условия + «Ваш ответ: 19»). Скоуп чистый.

**Итог: PASS** — все 16 пунктов без замечаний.

## 6. Скоуп / остаток

Изменения только в `android/EGETrainerApp/app/**`, `reports/wand_3*`,
`WAND_3_PLAN.md`. Остаток оператора: ревью + коммит; решить судьбу
тестового ДЗ, созданного verifier'ом.
