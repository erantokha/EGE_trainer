-- create_session_link.sql
-- WS.1 new RPC (2026-05-13): создание одноразовой session-ссылки на тренировку.
-- См. WS_session_links_PLAN.md §5.1.4, §6.3.
--
-- Контракт:
--   create_session_link(p_mode, p_shuffle, p_spec_json, p_frozen_questions)
--     returns table(homework_id uuid, token text)
--
--   p_mode             — 'list' | 'test'
--   p_shuffle          — boolean (null → false)
--   p_spec_json        — произвольный jsonb-объект; в результате допишутся ключи 'mode' и 'shuffle'
--   p_frozen_questions — jsonb-array элементов вида {topic_id, question_id} (формат
--                        совпадает с tasks/smart_hw_builder.js:170 buildFrozenQuestionsForTopics)
--
-- Семантика:
-- - Инсертит row в public.homeworks с kind='session', title=null, attempts_per_student=1.
--   Колонка homeworks.kind добавлена миграцией homeworks_add_kind_migration.sql (5.1.2).
-- - Инсертит row в public.homework_links с URL-safe base64 токеном из 18 байт
--   gen_random_bytes (≈131 бит энтропии; collision retry не нужен).
-- - security definer — RPC обходит RLS на homeworks.insert (план R1).
--
-- Ошибки:
--   AUTH_REQUIRED           — auth.uid() пуст
--   BAD_MODE                — p_mode не 'list' и не 'test'
--   BAD_FROZEN_QUESTIONS    — p_frozen_questions не jsonb-array или пустой

begin;

create or replace function public.create_session_link(
  p_mode text,
  p_shuffle boolean,
  p_spec_json jsonb,
  p_frozen_questions jsonb
)
returns table(
  homework_id uuid,
  token text
)
language plpgsql
security definer
-- 'extensions' нужен для gen_random_bytes — в Supabase pgcrypto установлен в эту схему.
set search_path to 'public', 'auth', 'extensions'
as $function$
declare
  v_uid uuid := auth.uid();
  v_hw_id uuid;
  v_token text;
  v_spec jsonb;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_mode not in ('list', 'test') then
    raise exception 'BAD_MODE';
  end if;

  if p_shuffle is null then
    p_shuffle := false;
  end if;

  if jsonb_typeof(p_frozen_questions) <> 'array'
     or jsonb_array_length(p_frozen_questions) = 0 then
    raise exception 'BAD_FROZEN_QUESTIONS';
  end if;

  v_spec := coalesce(p_spec_json, '{}'::jsonb)
            || jsonb_build_object('mode', p_mode, 'shuffle', p_shuffle);

  -- title пустая строка ('') а не null: колонка homeworks.title — NOT NULL.
  -- В плане §6.3 фигурировал null, но прод-схема не разрешает.
  -- Пустая строка — сигнал «session-row без человекочитаемого имени», UI должен
  -- скрывать или показывать дефолтную метку (например, дата создания) при необходимости.
  insert into public.homeworks(
    owner_id, kind, title, spec_json, frozen_questions, is_active, attempts_per_student
  )
  values (
    v_uid, 'session', '', v_spec, p_frozen_questions, true, 1
  )
  returning id into v_hw_id;

  -- URL-safe base64 без padding: '+' → '-', '/' → '_', '=' убираем.
  v_token := 'sess_' || encode(gen_random_bytes(18), 'base64');
  v_token := replace(replace(replace(v_token, '+', '-'), '/', '_'), '=', '');

  insert into public.homework_links(token, homework_id, owner_id, is_active)
  values (v_token, v_hw_id, v_uid, true);

  homework_id := v_hw_id;
  token := v_token;
  return next;
end;
$function$;

revoke execute on function public.create_session_link(
  text, boolean, jsonb, jsonb
) from anon;

grant execute on function public.create_session_link(
  text, boolean, jsonb, jsonb
) to authenticated;

commit;
