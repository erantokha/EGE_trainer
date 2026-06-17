-- konspekts.sql
-- WLM.1 — «Режим занятия» + Конспект-PDF (v1).
--
-- Что вводит этот файл (всё идемпотентно, безопасно прогонять повторно):
--   * Таблицы public.konspekts + public.konspekt_snapshots (+ индексы) с RLS.
--   * 5 layer-4 RPC (security definer, search_path=public, revoke anon / grant authenticated):
--       konspekt_start_v1, konspekt_add_snapshot_v1, konspekt_publish_v1,
--       student_konspekts_list_v1, teacher_konspekts_for_student_v1.
--   * Приватный Storage-bucket `konspekts` + RLS-политики на storage.objects.
--
-- Модель доступа (согласовано с оператором, WLM.1 stop-ask «Storage-контракт», вариант A):
--   Доступ к ФАЙЛАМ гейтят storage.objects RLS-политики; подписанный URL клиент мьютит сам
--   через Storage REST (`POST /storage/v1/object/sign/...`). RPC `konspekt_signed_url_v1`
--   из §6 плана НЕ создаётся — list-RPC возвращают только path, клиент подписывает.
--   Причина: чистая SQL-функция не может выпустить подписанный Storage-URL (это JWT
--   storage-api сервиса), а встраивать service-role ключ в SQL в red-zone недопустимо.
--
--   Path-конвенция объектов: {teacher_id}/{student_id}/{konspekt_id}/<file>
--     storage.foldername(name) → {teacher_id, student_id, konspekt_id}  (1-based)
--
-- RLS-инварианты:
--   * Учитель видит/правит konspekt только если auth.uid() = teacher_id И есть accepted-связь
--     в public.teacher_students(teacher_id, student_id) (consent). Создание — тоже под consent.
--   * Ученик: SELECT только своих status='published' (auth.uid() = student_id). Никакого
--     доступа к чужим / к черновикам / к чужим файлам.
--   * konspekt_snapshots наследует доступ через владение konspekt_id.
--   * Storage: учитель пишет/читает только префикс {teacher_id}/...; ученик читает файл,
--     только если объект принадлежит published-конспекту, где он student_id.
--
-- Гард для anon: auth.uid() IS NULL → consent-предикаты ложны → пусто; RPC revoke from anon.

begin;

-- ───────────────────────────── Таблицы ─────────────────────────────

create table if not exists public.konspekts (
  id            uuid primary key default gen_random_uuid(),
  teacher_id    uuid not null references auth.users(id) on delete cascade,
  student_id    uuid not null references auth.users(id) on delete cascade,
  title         text,
  lesson_date   date not null default current_date,
  status        text not null default 'draft' check (status in ('draft', 'published')),
  pdf_path      text,
  created_at    timestamptz not null default now(),
  published_at  timestamptz
);

create table if not exists public.konspekt_snapshots (
  id            uuid primary key default gen_random_uuid(),
  konspekt_id   uuid not null references public.konspekts(id) on delete cascade,
  storage_path  text not null,
  ordinal       int  not null default 0,
  question_id   text,
  created_at    timestamptz not null default now()
);

comment on table public.konspekts is
  'WLM.1: конспект занятия (учитель→ученик). draft → published; pdf_path = объект в bucket konspekts.';
comment on table public.konspekt_snapshots is
  'WLM.1: снимки карточек, добавленные в конспект на занятии (storage_path = PNG в bucket konspekts).';

-- Индексы доступа.
create index if not exists ix_konspekts_teacher_student
  on public.konspekts (teacher_id, student_id, lesson_date desc);
create index if not exists ix_konspekts_student_published
  on public.konspekts (student_id, lesson_date desc)
  where status = 'published';
create index if not exists ix_konspekt_snapshots_konspekt
  on public.konspekt_snapshots (konspekt_id, ordinal);

-- Один черновик на (учитель, ученик, дата): konspekt_start_v1 возвращает существующий.
-- Партиал по status='draft' → после публикации в тот же день можно начать новый черновик.
create unique index if not exists uq_konspekts_draft_per_day
  on public.konspekts (teacher_id, student_id, lesson_date)
  where status = 'draft';

-- ───────────────────────────── RLS на таблицы ─────────────────────────────
-- Все записи идут только через security-definer RPC (они обходят RLS). SELECT-политики
-- кодируют инвариант видимости на уровне таблицы (defense-in-depth): прямой PostgREST-select
-- к таблице у не-владельца вернёт пусто. INSERT/UPDATE/DELETE прямых политик НЕТ → прямые
-- записи запрещены всем (только через RPC).

alter table public.konspekts          enable row level security;
alter table public.konspekt_snapshots enable row level security;

drop policy if exists konspekts_teacher_select on public.konspekts;
create policy konspekts_teacher_select on public.konspekts
  for select to authenticated
  using (
    auth.uid() = teacher_id
    and exists (
      select 1 from public.teacher_students ts
      where ts.teacher_id = public.konspekts.teacher_id
        and ts.student_id = public.konspekts.student_id
    )
  );

drop policy if exists konspekts_student_select on public.konspekts;
create policy konspekts_student_select on public.konspekts
  for select to authenticated
  using (
    auth.uid() = student_id
    and status = 'published'
  );

drop policy if exists konspekt_snapshots_select on public.konspekt_snapshots;
create policy konspekt_snapshots_select on public.konspekt_snapshots
  for select to authenticated
  using (
    exists (
      select 1 from public.konspekts k
      where k.id = public.konspekt_snapshots.konspekt_id
        and (
          (auth.uid() = k.teacher_id and exists (
            select 1 from public.teacher_students ts
            where ts.teacher_id = k.teacher_id and ts.student_id = k.student_id
          ))
          or (auth.uid() = k.student_id and k.status = 'published')
        )
    )
  );

-- ───────────────────────────── RPC ─────────────────────────────
-- Сигнатуры могут меняться между прогонами → drop+create (return type не правится in place).

-- 1) konspekt_start_v1: создать/вернуть сегодняшний черновик для (teacher, student).
--    Гейт по consent. Возвращает строку конспекта + snapshot_count (для индикатора «N в конспекте»).
drop function if exists public.konspekt_start_v1(uuid);
create function public.konspekt_start_v1(
  p_student_id uuid
)
returns table (
  id           uuid,
  teacher_id   uuid,
  student_id   uuid,
  title        text,
  lesson_date  date,
  status       text,
  pdf_path     text,
  created_at   timestamptz,
  published_at timestamptz,
  snapshot_count integer
)
language plpgsql
volatile
security definer
set search_path to 'public'
as $function$
declare
  v_teacher uuid := auth.uid();
  v_id      uuid;
begin
  if v_teacher is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if p_student_id is null then
    raise exception 'STUDENT_REQUIRED' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.teacher_students ts
    where ts.teacher_id = v_teacher and ts.student_id = p_student_id
  ) then
    raise exception 'NO_CONSENT' using errcode = '42501';
  end if;

  -- Существующий сегодняшний черновик?
  select k.id into v_id
  from public.konspekts k
  where k.teacher_id = v_teacher
    and k.student_id = p_student_id
    and k.lesson_date = current_date
    and k.status = 'draft'
  limit 1;

  if v_id is null then
    begin
      insert into public.konspekts (teacher_id, student_id)
      values (v_teacher, p_student_id)
      returning konspekts.id into v_id;
    exception when unique_violation then
      -- гонка параллельного start: перечитываем
      select k.id into v_id
      from public.konspekts k
      where k.teacher_id = v_teacher
        and k.student_id = p_student_id
        and k.lesson_date = current_date
        and k.status = 'draft'
      limit 1;
    end;
  end if;

  return query
    select k.id, k.teacher_id, k.student_id, k.title, k.lesson_date, k.status,
           k.pdf_path, k.created_at, k.published_at,
           (select count(*)::int from public.konspekt_snapshots s where s.konspekt_id = k.id)
    from public.konspekts k
    where k.id = v_id;
end;
$function$;

-- 2) konspekt_add_snapshot_v1: записать метаданные снимка в черновик.
--    Гейт: владелец-учитель + consent + konspekt в статусе draft + path под своим префиксом.
drop function if exists public.konspekt_add_snapshot_v1(uuid, text, integer, text);
create function public.konspekt_add_snapshot_v1(
  p_konspekt_id uuid,
  p_storage_path text,
  p_ordinal integer,
  p_question_id text
)
returns public.konspekt_snapshots
language plpgsql
volatile
security definer
set search_path to 'public'
as $function$
declare
  v_teacher uuid := auth.uid();
  v_k       public.konspekts%rowtype;
  v_prefix  text;
  v_row     public.konspekt_snapshots%rowtype;
begin
  if v_teacher is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select * into v_k from public.konspekts where id = p_konspekt_id;
  if not found then
    raise exception 'KONSPEKT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_k.teacher_id <> v_teacher then
    raise exception 'NOT_OWNER' using errcode = '42501';
  end if;
  if v_k.status <> 'draft' then
    raise exception 'KONSPEKT_NOT_DRAFT' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.teacher_students ts
    where ts.teacher_id = v_teacher and ts.student_id = v_k.student_id
  ) then
    raise exception 'NO_CONSENT' using errcode = '42501';
  end if;

  -- Path обязан лежать под {teacher_id}/{student_id}/{konspekt_id}/ — иначе метаданные
  -- могли бы указывать на чужой объект.
  v_prefix := v_teacher::text || '/' || v_k.student_id::text || '/' || v_k.id::text || '/';
  if p_storage_path is null or p_storage_path not like v_prefix || '%' then
    raise exception 'BAD_STORAGE_PATH' using errcode = '22023';
  end if;

  insert into public.konspekt_snapshots (konspekt_id, storage_path, ordinal, question_id)
  values (p_konspekt_id, p_storage_path, coalesce(p_ordinal, 0), p_question_id)
  returning * into v_row;

  return v_row;
end;
$function$;

-- 3) konspekt_publish_v1: пометить published, выставить pdf_path/published_at/title.
drop function if exists public.konspekt_publish_v1(uuid, text);
drop function if exists public.konspekt_publish_v1(uuid, text, text);
create function public.konspekt_publish_v1(
  p_konspekt_id uuid,
  p_pdf_path text,
  p_title text default null
)
returns public.konspekts
language plpgsql
volatile
security definer
set search_path to 'public'
as $function$
declare
  v_teacher uuid := auth.uid();
  v_k       public.konspekts%rowtype;
  v_prefix  text;
  v_row     public.konspekts%rowtype;
begin
  if v_teacher is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select * into v_k from public.konspekts where id = p_konspekt_id;
  if not found then
    raise exception 'KONSPEKT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_k.teacher_id <> v_teacher then
    raise exception 'NOT_OWNER' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.teacher_students ts
    where ts.teacher_id = v_teacher and ts.student_id = v_k.student_id
  ) then
    raise exception 'NO_CONSENT' using errcode = '42501';
  end if;

  v_prefix := v_teacher::text || '/' || v_k.student_id::text || '/' || v_k.id::text || '/';
  if p_pdf_path is null or p_pdf_path not like v_prefix || '%' then
    raise exception 'BAD_STORAGE_PATH' using errcode = '22023';
  end if;
  if not exists (select 1 from public.konspekt_snapshots s where s.konspekt_id = p_konspekt_id) then
    raise exception 'KONSPEKT_EMPTY' using errcode = '22023';
  end if;

  update public.konspekts
     set status = 'published',
         pdf_path = p_pdf_path,
         title = coalesce(nullif(btrim(p_title), ''), title),
         published_at = now()
   where id = p_konspekt_id
  returning * into v_row;

  return v_row;
end;
$function$;

-- 3b) konspekt_delete_snapshot_v1: удалить снимок черновика (для удаления карточки из превью).
--     Гейт: владелец-учитель + consent + статус draft. Удаляет по (konspekt_id, ordinal).
drop function if exists public.konspekt_delete_snapshot_v1(uuid, integer);
create function public.konspekt_delete_snapshot_v1(
  p_konspekt_id uuid,
  p_ordinal integer
)
returns void
language plpgsql
volatile
security definer
set search_path to 'public'
as $function$
declare
  v_teacher uuid := auth.uid();
  v_k       public.konspekts%rowtype;
begin
  if v_teacher is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  select * into v_k from public.konspekts where id = p_konspekt_id;
  if not found then
    raise exception 'KONSPEKT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_k.teacher_id <> v_teacher then
    raise exception 'NOT_OWNER' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.teacher_students ts
    where ts.teacher_id = v_teacher and ts.student_id = v_k.student_id
  ) then
    raise exception 'NO_CONSENT' using errcode = '42501';
  end if;

  delete from public.konspekt_snapshots
   where konspekt_id = p_konspekt_id and ordinal = p_ordinal;
end;
$function$;

-- 3c) konspekt_delete_v1: удалить ЧЕРНОВИК конспекта целиком («Очистить конспект», WLM.2.1).
--     Гейт: владелец-учитель + consent + статус draft. Каскад (on delete cascade) убирает
--     konspekt_snapshots И lesson_items (флаги занятия). Storage-объектов у черновика нет (PDF —
--     только при публикации; снимки черновика живут в IndexedDB у клиента, чистит клиент).
--     Опубликованный конспект НЕ трогаем (KONSPEKT_NOT_DRAFT). Идемпотентно (нет строки → no-op).
drop function if exists public.konspekt_delete_v1(uuid);
create function public.konspekt_delete_v1(
  p_konspekt_id uuid
)
returns void
language plpgsql
volatile
security definer
set search_path to 'public'
as $function$
declare
  v_teacher uuid := auth.uid();
  v_k       public.konspekts%rowtype;
begin
  if v_teacher is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  select * into v_k from public.konspekts where id = p_konspekt_id;
  if not found then
    return;   -- уже удалён → идемпотентно
  end if;
  if v_k.teacher_id <> v_teacher then
    raise exception 'NOT_OWNER' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.teacher_students ts
    where ts.teacher_id = v_teacher and ts.student_id = v_k.student_id
  ) then
    raise exception 'NO_CONSENT' using errcode = '42501';
  end if;
  if v_k.status <> 'draft' then
    raise exception 'KONSPEKT_NOT_DRAFT' using errcode = '42501';
  end if;

  delete from public.konspekts where id = p_konspekt_id;   -- cascade → snapshots + lesson_items
end;
$function$;

-- 4) student_konspekts_list_v1: опубликованные конспекты авторизованного ученика.
drop function if exists public.student_konspekts_list_v1();
create function public.student_konspekts_list_v1()
returns table (
  id             uuid,
  lesson_date    date,
  title          text,
  pdf_path       text,
  published_at   timestamptz,
  teacher_name   text,
  snapshot_count integer
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    k.id,
    k.lesson_date,
    k.title,
    k.pdf_path,
    k.published_at,
    nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '') as teacher_name,
    (select count(*)::int from public.konspekt_snapshots s where s.konspekt_id = k.id) as snapshot_count
  from public.konspekts k
  left join public.profiles p on p.id = k.teacher_id
  where k.student_id = auth.uid()
    and k.status = 'published'
  order by k.lesson_date desc, k.published_at desc nulls last;
$function$;

-- 5) teacher_konspekts_for_student_v1: конспекты учителя для конкретного ученика (под consent).
--    Возвращает и черновики, и опубликованные — учитель видит всё своё по этому ученику.
drop function if exists public.teacher_konspekts_for_student_v1(uuid);
create function public.teacher_konspekts_for_student_v1(
  p_student_id uuid
)
returns table (
  id             uuid,
  lesson_date    date,
  title          text,
  status         text,
  pdf_path       text,
  published_at   timestamptz,
  snapshot_count integer
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    k.id,
    k.lesson_date,
    k.title,
    k.status,
    k.pdf_path,
    k.published_at,
    (select count(*)::int from public.konspekt_snapshots s where s.konspekt_id = k.id) as snapshot_count
  from public.konspekts k
  where k.teacher_id = auth.uid()
    and k.student_id = p_student_id
    and exists (
      select 1 from public.teacher_students ts
      where ts.teacher_id = auth.uid() and ts.student_id = p_student_id
    )
  order by k.lesson_date desc, k.created_at desc;
$function$;

-- ───────────────────────────── GRANT / REVOKE ─────────────────────────────
revoke execute on function public.konspekt_start_v1(uuid)                        from anon;
revoke execute on function public.konspekt_add_snapshot_v1(uuid, text, integer, text) from anon;
revoke execute on function public.konspekt_publish_v1(uuid, text, text)          from anon;
revoke execute on function public.konspekt_delete_snapshot_v1(uuid, integer)     from anon;
revoke execute on function public.konspekt_delete_v1(uuid)                       from anon;
revoke execute on function public.student_konspekts_list_v1()                    from anon;
revoke execute on function public.teacher_konspekts_for_student_v1(uuid)         from anon;

grant execute on function public.konspekt_start_v1(uuid)                         to authenticated;
grant execute on function public.konspekt_add_snapshot_v1(uuid, text, integer, text) to authenticated;
grant execute on function public.konspekt_publish_v1(uuid, text, text)           to authenticated;
grant execute on function public.konspekt_delete_snapshot_v1(uuid, integer)      to authenticated;
grant execute on function public.konspekt_delete_v1(uuid)                        to authenticated;
grant execute on function public.student_konspekts_list_v1()                     to authenticated;
grant execute on function public.teacher_konspekts_for_student_v1(uuid)          to authenticated;

commit;

-- ═══════════════════════════ Storage (выполняется тем же прогоном) ═══════════════════════════
-- Bucket + политики на storage.objects. Отдельной транзакцией, чтобы при повторном прогоне
-- падение на политике не откатывало таблицы/RPC выше.

-- Приватный bucket (idempotent). file_size_limit 20MB, только PNG/PDF.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('konspekts', 'konspekts', false, 20971520, array['image/png', 'application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Учитель: полный доступ к СВОЕМУ префиксу {teacher_id}/... (запись снимков/PDF, перезапись, чтение, очистка).
drop policy if exists konspekts_teacher_rw on storage.objects;
create policy konspekts_teacher_rw on storage.objects
  for all to authenticated
  using (
    bucket_id = 'konspekts'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'konspekts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Ученик: чтение файла, только если объект принадлежит published-конспекту, где он student_id.
--   foldername[2] = student_id, foldername[3] = konspekt_id.
drop policy if exists konspekts_student_read on storage.objects;
create policy konspekts_student_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'konspekts'
    and (storage.foldername(name))[2] = auth.uid()::text
    and exists (
      select 1 from public.konspekts k
      where k.id::text = (storage.foldername(name))[3]
        and k.student_id = auth.uid()
        and k.status = 'published'
    )
  );
