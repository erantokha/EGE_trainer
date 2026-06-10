# Site restyle wave — манифест страниц

Эталон стиля: `home_student.html` / `home_teacher.html` (карточки, отступы, типографика, рельс/гамбургер-сайдбар, мобильная раскладка, без горизонтального скролла, iOS: без зума, нативные select причёсаны).

Решения оператора (старт волны):
- Охват: только app-страницы (auth/google_complete/index — НЕ трогаем).
- Сайдбар (рельс на десктопе / гамбургер на мобилке) — добавить на ВСЕ app-страницы.
- После аудита — сразу в реализацию. Пуш — только оператор после ревью.

| # | Страница | Роль | id/навигация | Статус |
|---|----------|------|--------------|--------|
| — | home_student.html | student | — | ЭТАЛОН |
| — | home_teacher.html | teacher | — | ЭТАЛОН |
| 1 | tasks/trainer.html | student | возможно из list/подбора | **done** (print-пилот: контролы сохранены, h-scroll 412→390 исправлен, mob+desk ✓) |
| 2 | tasks/list.html | student | — | **done** (print-контролы сохранены, mob-ряд под шапкой, без h-scroll) |
| 3 | tasks/unique.html | student | ?section= | **done** (print сохранён, прозрачная .panel, mob+desk ✓) |
| 4 | tasks/stats.html | student | — | **done** (моб.пилюля пофикшена в home-student.css: hide #homeBtn !important; mob+desk = эталон, гейты зелёные) |
| 5 | tasks/my_homeworks.html | student | — | **done** (build 91, mob+desk = эталон, гейты ✓) |
| 6 | tasks/my_homeworks_archive.html | student | — | **done** (build 91; pre-existing Sentry warning browserTracingIntegration — НЕ рестайл) |
| 7 | tasks/profile.html | student | — | **done** (build 91, mob+desk = эталон, гейты ✓) |
| 8 | tasks/analog.html | student | возможно ?id= | **done** (build 91, +pages/analog.css overflow-x:clip, гейты ✓) |
| 9 | tasks/hw.html | student | из my_homeworks (открыть ДЗ) | **done** (новый pages/hw.css; print сохранён, отчёт/разбор в стиле эталона) |
| 10 | tasks/my_students.html | teacher | — | **done** (build, teacher-каркас, карточки эталона, mob+desk ✓) |
| 11 | tasks/student.html | teacher | из my_students (открыть ученика) | **done** (teacher-каркас; +фикс pre-existing overlap бейджа покрытия в stats-аккордеоне на ≤420px, см. pages/student.css) |
| 12 | tasks/hw_create.html | teacher | — | **done** (teacher-каркас + print сохранён; форма к карточному языку) |

Статусы: audit → planned → impl → review → done.

Артефакты: `shots/<page>_{mob,desk}.png` (скриншоты), `<page>.md` (аудит+план по странице).
