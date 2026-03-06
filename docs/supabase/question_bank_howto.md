question_bank: как обновлять

1) Создать таблицу
- открыть Supabase -> SQL Editor
- выполнить docs/supabase/question_bank_v1.sql

2) Сгенерировать upsert SQL из репозитория
Из корня проекта:
- node tools/export_question_bank.mjs --out docs/supabase/question_bank_upsert_v1.sql

3) Залить данные в Supabase
- открыть созданный docs/supabase/question_bank_upsert_v1.sql
- выполнить в Supabase SQL Editor

4) Быстрая проверка
- select count(*) from public.question_bank where is_enabled and not is_hidden;
- select * from public.question_bank order by updated_at desc limit 10;

Примечания
- скрипт по умолчанию игнорирует hidden темы из index.json (например *.0 «случайная тема»), чтобы не было дублей по question_id.
- если добавляешь/меняешь задачи в content/tasks, нужно повторить шаги 2–3.
