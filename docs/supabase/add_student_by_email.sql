-- add_student_by_email.sql
-- ⚠️ ОБНОВЛЕНО pre-prod consent-волной (2026-06-11).
-- Раньше функция СРАЗУ создавала активную связь в teacher_students (auto-link по email).
-- Теперь — тонкий wrapper над teacher_invite_student(): создаёт PENDING-запрос и возвращает
-- пустой набор (ученик НЕ привязан до подтверждения). Это устраняет несогласованный доступ
-- к данным ученика только по знанию email.
-- Канонический источник consent-модели: docs/supabase/teacher_student_consent_v1.sql
-- (он содержит идентичное определение + новую таблицу/RPC; деплоить достаточно его).

begin;

create or replace function public.add_student_by_email(
  p_email text
)
returns table(
  student_id uuid,
  email text,
  first_name text,
  last_name text,
  student_grade integer,
  created_at timestamp with time zone
)
language plpgsql
security definer
set search_path to 'public', 'auth', 'extensions'
as $function$
begin
  -- создаём pending-запрос (ошибки teacher_invite_student пробрасываются как есть)
  perform public.teacher_invite_student(p_email);
  -- ученик НЕ привязан до подтверждения → пустой набор
  return;
end;
$function$;

revoke execute on function public.add_student_by_email(
  text
) from anon;

grant execute on function public.add_student_by_email(
  text
) to authenticated;

commit;
