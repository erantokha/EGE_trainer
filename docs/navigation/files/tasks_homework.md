# tasks: домашние задания (L2)


Оглавление
- [../../../tasks/hw_create.js](#taskshw_createjs)
- [../../../tasks/hw.js](#taskshwjs)

## ../../../tasks/hw_create.js

Ссылка на код: [tasks/hw_create.js](../../../tasks/hw_create.js) / [snapshot](../code/tasks/hw_create.js)


Назначение: создание ДЗ учителем (выбор задач, параметры, генерация ссылки).
Таблицы:
- homeworks (insert)
- homework_links (insert)

Зависимости:
- app/providers/homework.js
- выбор задач может использовать логику, похожую на picker.js/умный режим

Тонкости:
- копирование ссылки, открытие ссылки, cache-busting ресурсов
- MathJax после добавления задач в список

Сценарий: scenarios/homework_create.md

## ../../../tasks/hw.js

Ссылка на код: [tasks/hw.js](../../../tasks/hw.js) / [snapshot](../code/tasks/hw.js)


Назначение: выполнение ДЗ учеником по token.
RPC:
- get_homework_by_token
- start_homework_attempt
- submit_homework_attempt

Хранение:
- может держать состояние попытки локально до submit (в памяти или sessionStorage)

Тонкости:
- запрет на повторную сдачу (логика has_attempt) должен быть согласован с БД
- кнопка “Завершить” должна быть идемпотентной (защита от двойных кликов)

Сценарии: scenarios/homework_start.md, scenarios/homework_submit.md
