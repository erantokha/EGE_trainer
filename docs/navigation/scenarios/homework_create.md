# Создание ДЗ (учитель)

Предусловия
- пользователь залогинен и имеет роль учителя (проверяется БД/RLS)
- есть доступ к вставке в homeworks и homework_links

Шаги пользователя
1) открыть tasks/hw_create.html
2) выбрать темы/задачи, настроить параметры
3) нажать “Создать”
4) получить ссылку /tasks/hw.html?token=...

Внутренние шаги
- [tasks/hw_create.js](../../../tasks/hw_create.js) / [snapshot](../code/tasks/hw_create.js): собирает frozen_questions/spec
- [app/providers/homework.js](../../../app/providers/homework.js) / [snapshot](../code/app/providers/homework.js): insert homeworks, insert homework_links

Запросы к Supabase
- insert homeworks
- insert homework_links

Итоговые состояния
- создана запись homeworks (owner_id=teacher)
- создана запись homework_links с token

Типовые поломки и где чинить
- ссылка создаётся, но ДЗ не открывается:
  - token не соответствует записи homework_links или RLS блокирует get_homework_by_token
  - чинить: supabase policies + RPC get_homework_by_token

Приёмка
- открыть ссылку в инкогнито:
  - до логина: страница ДЗ грузится (если RPC для anon разрешена) и показывает CTA “Войти”, “Начать” недоступна
  - после логина ученика: возврат на ту же ссылку и возможность начать попытку
