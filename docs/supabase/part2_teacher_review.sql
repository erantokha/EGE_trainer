-- part2_teacher_review.sql
-- W13.2c — учительское подтверждение балла части 2 (№13): teacher_score + аудит.
-- Дополняет docs/supabase/part2_attempt_reviews.sql (W13.2b: таблица + self-write).
-- Идемпотентно, НЕ destructive (drop policy if exists / create or replace ... drop+create function).
--
-- Вводит:
--   * teacher-select RLS на public.part2_attempt_reviews (учитель видит ревью СВОЕГО ученика по
--     СВОЕЙ назначенной ДЗ-попытке).
--   * RPC public.confirm_part2_teacher_score_v1 (security definer): учитель ставит teacher_score
--     0/1/2 за вопрос части 2 в конкретной ДЗ-попытке своего ученика; пишет аудит-след.
--
-- ГЛАВНЫЙ ИНВАРИАНТ (RED-ZONE, security-audit-2026-06-10): teacher-write строго ограничен —
--   (1) ВЛАДЕНИЕ: попытка принадлежит ДЗ-линку учителя (homework_links.owner_id = auth.uid());
--   (2) СОГЛАСИЕ: accepted-связь в public.teacher_students (revoke = мгновенная потеря доступа);
--   (3) СКОУП: только конкретная ДЗ-попытка (p_attempt_id) и её ученик; свободные попытки
--       (hw_attempt_id is null) учителю недоступны вообще.
--   is_teacher() СОЗНАТЕЛЬНО НЕ используется: это слабая роль-проверка (самоэскалируема), а
--   ownership+consent строго сильнее. Гейт повторяет проверенный get_homework_attempt_for_teacher.

begin;

-- ───────────────────────────── teacher-select RLS ─────────────────────────────
-- Учитель видит ревью ученика только по своей ДЗ-попытке (ownership) и при accepted-связи.
drop policy if exists part2_reviews_select_teacher on public.part2_attempt_reviews;
create policy part2_reviews_select_teacher on public.part2_attempt_reviews
  for select to authenticated
  using (
    part2_attempt_reviews.hw_attempt_id is not null
    and exists (
      select 1
      from public.homework_attempts a
      join public.homework_links l on l.id = a.link_id
      where a.id = part2_attempt_reviews.hw_attempt_id
        and l.owner_id = auth.uid()
    )
    and exists (
      select 1 from public.teacher_students ts
      where ts.teacher_id = auth.uid()
        and ts.student_id = part2_attempt_reviews.student_id
    )
  );

-- ───────────────────────────── teacher-write RPC ─────────────────────────────
-- Сигнатура может меняться между прогонами → drop+create.
drop function if exists public.confirm_part2_teacher_score_v1(uuid, text, integer);
create function public.confirm_part2_teacher_score_v1(
  p_attempt_id   uuid,
  p_question_id  text,
  p_teacher_score integer
)
returns public.part2_attempt_reviews
language plpgsql
volatile
security definer
set search_path to 'public'
as $function$
declare
  v_teacher uuid := auth.uid();
  v_student uuid;
  v_row     public.part2_attempt_reviews%rowtype;
begin
  if v_teacher is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if p_question_id is null or btrim(p_question_id) = '' then
    raise exception 'QUESTION_REQUIRED' using errcode = '22023';
  end if;
  if p_teacher_score is null or p_teacher_score < 0 or p_teacher_score > 2 then
    raise exception 'BAD_SCORE' using errcode = '22023';
  end if;

  -- ВЛАДЕНИЕ + получить ученика: попытка принадлежит ДЗ-линку этого учителя (как
  -- get_homework_attempt_for_teacher). Иначе — нет доступа.
  select a.student_id
  into v_student
  from public.homework_attempts a
  join public.homework_links l on l.id = a.link_id
  where a.id = p_attempt_id
    and l.owner_id = v_teacher
  limit 1;

  if v_student is null then
    raise exception 'ATTEMPT_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;

  -- СОГЛАСИЕ: accepted-связь учитель→ученик.
  if not exists (
    select 1 from public.teacher_students ts
    where ts.teacher_id = v_teacher and ts.student_id = v_student
  ) then
    raise exception 'STUDENT_NOT_LINKED' using errcode = '42501';
  end if;

  -- Аудит-след: кто (teacher_id) и когда (reviewed_at) подтвердил; self_score не трогаем.
  insert into public.part2_attempt_reviews
    (student_id, question_id, source, hw_attempt_id, teacher_score, teacher_id, reviewed_at, status, updated_at)
  values
    (v_student, btrim(p_question_id), 'hw', p_attempt_id, p_teacher_score::smallint, v_teacher, now(), 'teacher_confirmed', now())
  on conflict (student_id, question_id, coalesce(hw_attempt_id, '00000000-0000-0000-0000-000000000000'::uuid))
  do update set
    teacher_score = excluded.teacher_score,
    teacher_id    = excluded.teacher_id,
    reviewed_at   = excluded.reviewed_at,
    status        = 'teacher_confirmed',
    updated_at    = now()
  returning * into v_row;

  return v_row;
end;
$function$;

revoke execute on function public.confirm_part2_teacher_score_v1(uuid, text, integer) from anon;
grant  execute on function public.confirm_part2_teacher_score_v1(uuid, text, integer) to authenticated;

commit;
