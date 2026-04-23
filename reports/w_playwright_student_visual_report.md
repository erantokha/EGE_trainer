# Playwright Student Visual Walkthrough Report

Дата: 2026-04-22  
Под-волна: `student visual walkthrough over green student smoke`  
Статус: green

## Цель под-волны

Подтвердить не только headless smoke, а реальный browser walkthrough под
student-аккаунтом:

- открыть student home с авторизованной сессией;
- сохранить screenshot главной ученика;
- пройти из главной к задачам через фактический UI;
- открыть экран тестирования/тренировки;
- сохранить screenshot экрана задач;
- получить диагностические visual artifacts.

## Фактический маршрут

Маршрут выбран по реальному коду и DOM:

1. `home_student.html`
2. Проверка student UI:
   - `body[data-home-variant="student"]`
   - `#accordion`
   - `#scoreForecast`
3. Screenshot главной:
   - `test-results/student-visual/home.png`
4. Нажатие массового entrypoint:
   - кнопка `#bulkPickAll`, UI label `Выбрать все`
5. Проверка, что `#start` стал enabled и счётчик `#sum` больше `0`.
6. Нажатие `#start`.
7. Переход на:
   - `/tasks/trainer.html`
8. Проверка экрана задач:
   - заголовок `Подборка задач`
   - поля ответа `Ответ`
   - задачи в runner/sheet layout
9. Screenshot экрана задач:
   - `test-results/student-visual/testing.png`

Важная деталь: фактический student flow после `Выбрать все` открыл
sheet-style экран в `tasks/trainer.html` с текстом `Всего задач: 12` и
несколькими полями ответа. Это реальный экран задач/тестирования, а не
legacy `#stem` single-question layout.

## Изменённые файлы

Добавлены:

- `e2e/student/visual-walkthrough.spec.js`
- `w_playwright_student_visual_report.md`

Product code, backend contracts, SQL/RPC и teacher-контур не менялись.

## Команды и результаты

### 1. Secrets/storage check

Проверено без вывода credentials:

- `.env.local` присутствует;
- `E2E_STUDENT_EMAIL` заполнен;
- `E2E_STUDENT_PASSWORD` заполнен;
- `.auth/student.json` после успешных прогонов присутствует;
- `.env.local`, `.auth/student.json` и `test-results/` игнорируются git.

### 2. Clean setup-student

Команда:

```bash
rm -f .auth/student.json && npx playwright test --project=setup-student --reporter=list
```

Результат:

- первый запуск воспроизвёл старый flaky timeout вокруг session-capture:
  UI главной ученика уже был виден, но helper не дождался persisted snapshot;
- сразу после этого повторный `setup-student` прошёл:
  `1 passed`;
- последующие `student` project runs также успешно запускали
  `setup-student` как dependency.

Это зафиксировано как остаточный риск test-layer setup flake, а не как
production auth blocker: credentials валидны, student home открывался, storage
state в итоге создавался.

### 3. Headless screenshot walkthrough

Команда:

```bash
npx playwright test --project=student e2e/student/visual-walkthrough.spec.js --reporter=list
```

Результат:

- `2 passed`;
- dependency `setup-student` прошёл;
- visual walkthrough прошёл;
- screenshots созданы.

### 4. Headed walkthrough

Команда:

```bash
npm run e2e:headed -- --project=student e2e/student/visual-walkthrough.spec.js
```

Результат:

- `2 passed`;
- Chromium был запущен в headed mode (`E2E_HEADLESS=0`).

Ограничение среды: работа идёт через API/терминальный агент, поэтому я не могу
подтвердить, что оператор физически видел окно браузера на своём экране.
Визуальное подтверждение компенсировано screenshots, trace и video.

### 5. Diagnostic walkthrough

Команда:

```bash
npm run e2e:diag -- --project=student e2e/student/visual-walkthrough.spec.js
```

Результат:

- `2 passed`;
- получены trace/video/screenshot artifacts.

## Артефакты

Стабильные screenshots visual walkthrough:

- `test-results/student-visual/home.png`
  - PNG, `1280 x 748`
  - размер около `111 KB`
- `test-results/student-visual/testing.png`
  - PNG, `1280 x 2774`
  - размер около `267 KB`

Diagnostic artifacts последнего зелёного diag-run:

- `test-results/auth.student.setup-create-student-storage-state-setup-student/test-finished-1.png`
- `test-results/auth.student.setup-create-student-storage-state-setup-student/video.webm`
- `test-results/auth.student.setup-create-student-storage-state-setup-student/trace.zip`
- `test-results/student-visual-walkthrough-7a612-from-home-to-testing-screen-student/test-finished-1.png`
- `test-results/student-visual-walkthrough-7a612-from-home-to-testing-screen-student/video.webm`
- `test-results/student-visual-walkthrough-7a612-from-home-to-testing-screen-student/trace.zip`

Служебный файл Playwright:

- `test-results/.last-run.json`

Все эти файлы находятся под `test-results/` и не должны попадать в git.

## Текущий статус и остаточные риски

Student visual walkthrough выполнен:

- student session подтверждена;
- `.auth/student.json` создан;
- screenshot главной ученика сохранён;
- выполнен реальный переход `home_student.html -> Выбрать все -> Начать -> tasks/trainer.html`;
- screenshot экрана задач сохранён;
- headless, headed и diagnostic runs прошли зелёными.

Остаточные риски:

- `setup-student` один раз воспроизвёл flaky timeout вокруг session-capture,
  хотя UI главной уже был открыт; это стоит стабилизировать отдельной
  test-layer под-волной, если flake повторится;
- screenshots зависят от текущих данных student-аккаунта и выбранных задач;
- в API-среде headed browser нельзя считать физически видимым оператору, даже
  если headed-run технически прошёл.

Следующий логичный шаг: переходить к `teacher smoke` или отдельно закрыть
flaky-risk в `setup-student`, если требуется полностью deterministic auth setup.
