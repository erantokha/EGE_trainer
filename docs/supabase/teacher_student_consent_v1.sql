-- teacher_student_consent_v1.sql
-- Wave: pre-prod consent-модель связи «учитель ↔ ученик».
--
-- ДИЗАЙН (минимальный риск, без правки 20+ teacher-view RPC):
--   * public.teacher_students = ТОЛЬКО подтверждённые (accepted) связи.
--     Все существующие teacher-RPC (list_my_students, *_for_teacher, assign_homework_to_student,
--     pick_* и т.д.) уже гейтят доступ по наличию строки в teacher_students → менять их НЕ нужно.
--     Любой запрос учителя к данным ученика автоматически проходит только для accepted.
--   * Новая таблица public.teacher_student_requests хранит НЕподтверждённые состояния:
--     pending / rejected / cancelled. accepted-«статус» = строка промоутится в teacher_students.
--     revoke = удаление строки из teacher_students (доступ исчезает мгновенно во всех RPC).
--
-- МИГРАЦИЯ ДАННЫХ: НИЧЕГО не теряется и не переносится разрушительно.
--   Существующие строки teacher_students уже = «accepted» по смыслу (они и были активными
--   связями) → текущие ученики остаются у преподавателей без изменений. Новых backfill-апдейтов
--   к teacher_students не требуется.
--
-- БЕЗОПАСНОСТЬ: новая таблица под RLS без permissive-политик; весь доступ — через
--   SECURITY DEFINER функции (как у teacher_students). Прямой PostgREST-select к таблице
--   ничего не вернёт.
--
-- Применять в Supabase SQL Editor целиком (идемпотентно, в одной транзакции).

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Таблица заявок (неподтверждённые состояния)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.teacher_student_requests (
  id                       uuid primary key default gen_random_uuid(),
  teacher_id               uuid not null references auth.users(id) on delete cascade,
  student_id               uuid references auth.users(id) on delete cascade,  -- null, пока ученик не зарегистрирован
  student_email_normalized text not null,
  status                   text not null default 'pending'
                             check (status in ('pending', 'rejected', 'cancelled')),
  requested_at             timestamptz not null default now(),
  responded_at             timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

comment on table public.teacher_student_requests is
  'Неподтверждённые связи учитель→ученик (pending/rejected/cancelled). accepted-связи живут в teacher_students.';

-- Не более одной активной (pending) заявки на пару учитель↔email.
create unique index if not exists uq_tsr_pending_pair
  on public.teacher_student_requests (teacher_id, student_email_normalized)
  where status = 'pending';

create index if not exists ix_tsr_student_id on public.teacher_student_requests (student_id) where status = 'pending';
create index if not exists ix_tsr_email      on public.teacher_student_requests (student_email_normalized) where status = 'pending';
create index if not exists ix_tsr_teacher    on public.teacher_student_requests (teacher_id);

-- RLS: запрещаем прямой доступ; всё — через SECURITY DEFINER функции ниже.
alter table public.teacher_student_requests enable row level security;
-- (намеренно без permissive policy)

revoke all on public.teacher_student_requests from anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. teacher_invite_student(email) — преподаватель отправляет запрос (pending)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.teacher_invite_student(p_email text)
returns table(request_id uuid, status text, student_email text, requested_at timestamptz)
language plpgsql
security definer
set search_path to 'public', 'auth', 'extensions'
as $function$
declare
  v_teacher_id    uuid;
  v_teacher_email text;
  v_email         text;
  v_student_id    uuid;
  v_req_id        uuid;
begin
  v_teacher_id := auth.uid();
  if v_teacher_id is null then raise exception 'AUTH_REQUIRED'; end if;

  v_teacher_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  if v_teacher_email = '' then raise exception 'AUTH_EMAIL_MISSING'; end if;

  if not exists (
    select 1 from public.teachers t
    where lower(t.email) = v_teacher_email and coalesce(t.approved, true) = true
  ) then
    raise exception 'TEACHER_NOT_ALLOWED';
  end if;

  v_email := lower(trim(coalesce(p_email, '')));
  if v_email = '' then raise exception 'EMAIL_REQUIRED'; end if;
  if position('@' in v_email) = 0 then raise exception 'INVALID_EMAIL'; end if;
  if v_email = v_teacher_email then raise exception 'CANNOT_ADD_SELF'; end if;

  -- ученик может быть ещё не зарегистрирован → student_id остаётся null (pending по email)
  select u.id into v_student_id from auth.users u where lower(u.email) = v_email limit 1;

  if v_student_id = v_teacher_id then raise exception 'CANNOT_ADD_SELF'; end if;

  -- уже подтверждён?
  if v_student_id is not null and exists (
    select 1 from public.teacher_students ts
    where ts.teacher_id = v_teacher_id and ts.student_id = v_student_id
  ) then
    raise exception 'ALREADY_LINKED';
  end if;

  -- уже есть pending?
  if exists (
    select 1 from public.teacher_student_requests r
    where r.teacher_id = v_teacher_id
      and r.student_email_normalized = v_email
      and r.status = 'pending'
  ) then
    raise exception 'REQUEST_ALREADY_PENDING';
  end if;

  -- повторная заявка после rejected/cancelled — обновляем существующую строку обратно в pending,
  -- иначе создаём новую.
  update public.teacher_student_requests r
     set status = 'pending', student_id = v_student_id,
         requested_at = now(), responded_at = null, updated_at = now()
   where r.teacher_id = v_teacher_id
     and r.student_email_normalized = v_email
     and r.status in ('rejected', 'cancelled')
  returning r.id into v_req_id;

  if v_req_id is null then
    insert into public.teacher_student_requests (teacher_id, student_id, student_email_normalized, status)
    values (v_teacher_id, v_student_id, v_email, 'pending')
    returning id into v_req_id;
  end if;

  return query
  select v_req_id, 'pending'::text, v_email, now();
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. add_student_by_email — БОЛЬШЕ НЕ создаёт активную связь.
--    Переопределяем как тонкий wrapper над teacher_invite_student (на случай
--    старых клиентов): возвращает прежнюю табличную сигнатуру, но связь не активна.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.add_student_by_email(p_email text)
returns table(
  student_id uuid, email text, first_name text, last_name text,
  student_grade integer, created_at timestamptz
)
language plpgsql
security definer
set search_path to 'public', 'auth', 'extensions'
as $function$
begin
  -- создаём pending-запрос (без активной привязки); ошибки пробрасываются как есть
  perform public.teacher_invite_student(p_email);
  -- возвращаем пустой набор: ученик НЕ привязан до подтверждения
  return;
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. list_my_student_requests() — исходящие заявки преподавателя (pending).
--    БЕЗ ФИО/статистики ученика — только email/статус/дата (требование §2.5).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.list_my_student_requests()
returns table(request_id uuid, student_email text, status text, requested_at timestamptz)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select r.id, r.student_email_normalized, r.status, r.requested_at
  from public.teacher_student_requests r
  where r.teacher_id = auth.uid()
    and r.status = 'pending'
    and public.is_allowed_teacher()
  order by r.requested_at desc;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. cancel_student_request(id) — преподаватель отменяет pending-заявку
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.cancel_student_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare v_teacher_id uuid;
begin
  v_teacher_id := auth.uid();
  if v_teacher_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.is_allowed_teacher() then raise exception 'TEACHER_NOT_ALLOWED'; end if;

  update public.teacher_student_requests
     set status = 'cancelled', responded_at = now(), updated_at = now()
   where id = p_request_id
     and teacher_id = v_teacher_id
     and status = 'pending';
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. list_incoming_teacher_requests() — входящие заявки ученика
--    (по student_id или по email из JWT, если ещё не привязан)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.list_incoming_teacher_requests()
returns table(request_id uuid, teacher_email text, teacher_name text, requested_at timestamptz)
language sql
stable
security definer
set search_path to 'public', 'auth'
as $function$
  select
    r.id,
    coalesce(tp.email, tu.email) as teacher_email,
    nullif(trim(coalesce(tp.first_name, '') || ' ' || coalesce(tp.last_name, '')), '') as teacher_name,
    r.requested_at
  from public.teacher_student_requests r
  left join public.profiles tp on tp.id = r.teacher_id
  left join auth.users  tu on tu.id = r.teacher_id
  where r.status = 'pending'
    and (
      r.student_id = auth.uid()
      or r.student_email_normalized = lower(coalesce(auth.jwt() ->> 'email', '__none__'))
    )
  order by r.requested_at desc;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. respond_teacher_request(id, accept) — ученик подтверждает/отклоняет.
--    accept=true → промоутим в teacher_students (это и есть «accepted»-статус).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.respond_teacher_request(p_request_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  v_uid   uuid;
  v_email text;
  v_rec   public.teacher_student_requests;
begin
  v_uid := auth.uid();
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  v_email := lower(coalesce(auth.jwt() ->> 'email', ''));

  select * into v_rec
  from public.teacher_student_requests r
  where r.id = p_request_id
    and r.status = 'pending'
    and (r.student_id = v_uid or r.student_email_normalized = v_email)
  limit 1;

  if v_rec.id is null then raise exception 'REQUEST_NOT_FOUND'; end if;

  if p_accept then
    -- промоутим в активную связь (accepted)
    insert into public.teacher_students (teacher_id, student_id)
    values (v_rec.teacher_id, v_uid)
    on conflict do nothing;

    update public.teacher_student_requests
       set status = 'cancelled',  -- заявка закрыта; активная связь теперь в teacher_students
           student_id = v_uid, responded_at = now(), updated_at = now()
     where id = p_request_id;
  else
    update public.teacher_student_requests
       set status = 'rejected', student_id = v_uid, responded_at = now(), updated_at = now()
     where id = p_request_id;
  end if;
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. list_my_teachers() — ученик видит своих (accepted) преподавателей
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.list_my_teachers()
returns table(teacher_id uuid, teacher_email text, teacher_name text, linked_at timestamptz)
language sql
stable
security definer
set search_path to 'public', 'auth'
as $function$
  select
    ts.teacher_id,
    coalesce(tp.email, tu.email) as teacher_email,
    nullif(trim(coalesce(tp.first_name, '') || ' ' || coalesce(tp.last_name, '')), '') as teacher_name,
    ts.created_at as linked_at
  from public.teacher_students ts
  left join public.profiles tp on tp.id = ts.teacher_id
  left join auth.users  tu on tu.id = ts.teacher_id
  where ts.student_id = auth.uid()
  order by ts.created_at desc;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. revoke_my_teacher(teacher_id) — ученик отключает доступ преподавателю
--    (удаляем активную связь → все teacher-RPC сразу перестают видеть ученика)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.revoke_my_teacher(p_teacher_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare v_uid uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;

  delete from public.teacher_students
   where student_id = v_uid and teacher_id = p_teacher_id;

  -- закрываем возможные хвостовые заявки этой пары
  update public.teacher_student_requests
     set status = 'cancelled', responded_at = now(), updated_at = now()
   where student_id = v_uid and teacher_id = p_teacher_id and status = 'pending';
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. GRANTS: только authenticated, никогда anon.
-- ─────────────────────────────────────────────────────────────────────────────
revoke execute on function public.teacher_invite_student(text)        from anon;
revoke execute on function public.list_my_student_requests()          from anon;
revoke execute on function public.cancel_student_request(uuid)        from anon;
revoke execute on function public.list_incoming_teacher_requests()    from anon;
revoke execute on function public.respond_teacher_request(uuid, boolean) from anon;
revoke execute on function public.list_my_teachers()                  from anon;
revoke execute on function public.revoke_my_teacher(uuid)             from anon;

grant execute on function public.teacher_invite_student(text)         to authenticated;
grant execute on function public.list_my_student_requests()           to authenticated;
grant execute on function public.cancel_student_request(uuid)         to authenticated;
grant execute on function public.list_incoming_teacher_requests()     to authenticated;
grant execute on function public.respond_teacher_request(uuid, boolean) to authenticated;
grant execute on function public.list_my_teachers()                   to authenticated;
grant execute on function public.revoke_my_teacher(uuid)              to authenticated;

commit;

-- ─────────────────────────────────────────────────────────────────────────────
-- SMOKE (выполнить отдельно под сессией учителя/ученика, не в этой транзакции):
--   select * from public.teacher_invite_student('student@example.com');
--   select * from public.list_my_student_requests();              -- pending у учителя
--   -- под учеником:
--   select * from public.list_incoming_teacher_requests();        -- входящая заявка
--   select public.respond_teacher_request('<request_id>', true);  -- accept
--   select * from public.list_my_teachers();                      -- преподаватель появился
--   -- под учителем: list_my_students() теперь содержит ученика
--   -- под учеником:
--   select public.revoke_my_teacher('<teacher_id>');              -- отвязка
--   -- под учителем: list_my_students() больше НЕ содержит ученика
