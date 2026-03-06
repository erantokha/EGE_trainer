# Папка tasks (L1)

Назначение

- набор HTML‑страниц приложения (мультистраничный фронт)
- каждая страница имеет свой .js (ES module), общий стиль и общий хедер
- в этой папке живут все основные пользовательские сценарии: тренажёр, ДЗ, статистика, авторизация, учитель

Состав (по группам фич)

- авторизация:
  - [tasks/auth.html](../../../tasks/auth.html), [tasks/auth.js](../../../tasks/auth.js)
  - [tasks/auth_callback.html](../../../tasks/auth_callback.html), [tasks/auth_callback.js](../../../tasks/auth_callback.js)
  - [tasks/auth_reset.html](../../../tasks/auth_reset.html), [tasks/auth_reset.js](../../../tasks/auth_reset.js)
  - [tasks/google_complete.html](../../../tasks/google_complete.html), [tasks/google_complete.js](../../../tasks/google_complete.js)
- тренажёр:
  - [tasks/picker.js](../../../tasks/picker.js) (выбор тем)
  - [tasks/trainer.html](../../../tasks/trainer.html), [tasks/trainer.js](../../../tasks/trainer.js)
  - [tasks/list.html](../../../tasks/list.html), [tasks/list.js](../../../tasks/list.js)
  - [tasks/trainer.css](../../../tasks/trainer.css) (общие стили)
- домашние задания:
  - [tasks/hw_create.html](../../../tasks/hw_create.html), [tasks/hw_create.js](../../../tasks/hw_create.js)
  - [tasks/hw.html](../../../tasks/hw.html), [tasks/hw.js](../../../tasks/hw.js)
  - [tasks/homework_api.js](../../../tasks/homework_api.js) (PostgREST insert для создания ДЗ из student.js)
- статистика и рекомендации:
  - [tasks/stats.html](../../../tasks/stats.html), [tasks/stats.js](../../../tasks/stats.js)
  - [tasks/stats_view.js](../../../tasks/stats_view.js), [tasks/stats.css](../../../tasks/stats.css)
  - [tasks/recommendations.js](../../../tasks/recommendations.js)
  - [tasks/smart_select.js](../../../tasks/smart_select.js)
  - [tasks/smart_hw_builder.js](../../../tasks/smart_hw_builder.js)
  - [tasks/smart_hw.js](../../../tasks/smart_hw.js)
  - [tasks/smart_mode.js](../../../tasks/smart_mode.js)
- кабинет учителя:
  - [tasks/my_students.html](../../../tasks/my_students.html), [tasks/my_students.js](../../../tasks/my_students.js)
  - [tasks/student.html](../../../tasks/student.html), [tasks/student.js](../../../tasks/student.js)
- прочее:
  - [tasks/index.html](../../../tasks/index.html) (legacy: входная точка, когда сайт жил в /tasks)
  - [tasks/profile.html](../../../tasks/profile.html), [tasks/profile.js](../../../tasks/profile.js)
  - [tasks/unique.html](../../../tasks/unique.html), [tasks/unique.js](../../../tasks/unique.js)
  - [tasks/theme.js](../../../tasks/theme.js)
  - [tasks/img/](../../../tasks/img/) (иконки UI)

Как страницы обычно запускаются

- HTML подключает общий CSS и JS как модуль (type="module")
- JS страницы:
  - (часто) вызывает initHeader из [app/ui/header.js](../../../app/ui/header.js)
  - читает параметры URL и/или sessionStorage/localStorage
  - загружает JSON из [content/tasks/](../../../content/tasks/)
  - при необходимости общается с Supabase через:
    - supabase-js: [app/providers/supabase.js](../../../app/providers/supabase.js)
    - прямой REST rpc: внутри [tasks/stats.js](../../../tasks/stats.js) и [tasks/my_students.js](../../../tasks/my_students.js)

Точки расширения

- новая страница:
  - добавить .html + .js рядом
  - подключить в меню через [app/ui/header.js](../../../app/ui/header.js) при необходимости
- новая “фича‑группа”:
  - создать отдельный .md в docs/navigation/modules (ориентир: страницы tasks_*)

Ссылки на детальные карты фич

- [auth](./tasks_auth.md)
- [trainer](./tasks_trainer.md)
- [homework](./tasks_homework.md)
- [stats](./tasks_stats.md)
- [teacher](./tasks_teacher.md)

Дата обновления: 2026-01-16
