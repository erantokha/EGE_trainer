# Папка tasks (L1)

Назначение

- мультистраничный фронт
- каждая страница имеет свой html + js (ES module)
- часть страниц использует общий хедер (app/ui/header.js)

Ключевые страницы

- главная/выбор тем: [index.html](../../../index.html) + [tasks/picker.js](../../../tasks/picker.js)
- тренажёр: [tasks/trainer.html](../../../tasks/trainer.html) + [tasks/trainer.js](../../../tasks/trainer.js)
- список: [tasks/list.html](../../../tasks/list.html) + [tasks/list.js](../../../tasks/list.js)
- домашки: [tasks/hw_create.html](../../../tasks/hw_create.html), [tasks/hw.html](../../../tasks/hw.html)
- авторизация: [tasks/auth.html](../../../tasks/auth.html), callback/reset
- статистика: [tasks/stats.html](../../../tasks/stats.html)
- кабинет учителя: [tasks/my_students.html](../../../tasks/my_students.html), [tasks/student.html](../../../tasks/student.html)

Точки расширения

- новый экран: добавить tasks/<name>.html + tasks/<name>.js
- использовать общий хедер: подключить app/ui/header.js (см. index.html)
- новые сценарии, завязанные на Supabase: лучше делать через RPC (см. docs/navigation/supabase.md)
