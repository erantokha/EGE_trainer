-- lesson_items.sql
-- WLM.2 — «Флаги занятия» + теги навыков (слой 1).
--
-- Что вводит этот файл (всё идемпотентно, безопасно прогонять повторно):
--   * Таблица public.skill_tags_dim (управляемый словарь навыков) + RLS + seed стартового словаря.
--   * Таблица public.lesson_items (событие карточки на занятии: флаг + теги + soft-таймстемпы) + RLS.
--   * 3 layer-4 RPC (security definer, search_path=public, revoke anon / grant authenticated):
--       lesson_item_upsert_v1, lesson_items_for_konspekt_v1, skill_tags_dim_v1.
--
-- Привязка к контейнеру занятия (разведка §5.1 плана WLM.2):
--   Контейнер занятия WLM.1 = public.konspekts(id uuid). Карточка на tasks/list.html несёт
--   data-qid = question_id (text). Событие = (konspekt_id, question_id), один на карточку.
--
-- ГЛАВНЫЙ ИНВАРИАНТ (RED-ZONE): флаги ПРИВАТНЫ для учителя. Ученик не имеет доступа к
--   public.lesson_items ни через RLS, ни через RPC. У lesson_items НЕТ student-select политики
--   и НЕТ RPC, отдающего флаги по student-скоупу. Доступ — только учителю-владельцу контейнера
--   занятия под consent (та же проверка ownership+consent, что и у konspekts в WLM.1).
--
-- RLS-инварианты:
--   * lesson_items: SELECT только если auth.uid() = konspekts.teacher_id И есть accepted-связь
--     в public.teacher_students(teacher_id, student_id). Записи — только через security-definer
--     RPC (прямых INSERT/UPDATE/DELETE политик НЕТ → прямые записи запрещены всем).
--   * skill_tags_dim: SELECT для authenticated (это справочник). Write — нет политик
--     (seed/расширение словаря делает оператор через SQL, обходя RLS как владелец).
--   * Гард для anon: auth.uid() IS NULL → consent-предикаты ложны → пусто; RPC revoke from anon.

begin;

-- ───────────────────────────── Таблицы ─────────────────────────────

-- Словарь навыков (dimension). Seed ниже — стартовый, расширяет/правит оператор через SQL.
create table if not exists public.skill_tags_dim (
  code        text primary key,
  label       text not null,
  topic       text,                              -- группировка (триг / планиметрия / алгебра / общее)
  sort        int  not null default 0,
  is_enabled  boolean not null default true
);

comment on table public.skill_tags_dim is
  'WLM.2: управляемый словарь навыков (теги слой 1). Read для authenticated; write — только оператор через SQL.';

-- Событие карточки на занятии: учительская приватная оценка разбора + теги навыков + soft-таймстемпы.
create table if not exists public.lesson_items (
  id           uuid primary key default gen_random_uuid(),
  konspekt_id  uuid not null references public.konspekts(id) on delete cascade,  -- контейнер занятия (WLM.1)
  question_id  text not null,                                                    -- = card.dataset.qid на list.html
  flag         text check (flag in ('clean','hint','arith','lost')),            -- ✅ / 💡 / ⚠️ / ❌
  skill_tags   text[] not null default '{}',
  opened_at    timestamptz,                       -- первое взаимодействие с карточкой в режиме занятия
  flagged_at   timestamptz,                       -- момент простановки флага
  time_ms      int,                               -- best-effort flagged_at - opened_at (null если не определить)
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (konspekt_id, question_id)
);

comment on table public.lesson_items is
  'WLM.2: приватная учительская оценка карточки на занятии (флаг разбора + теги навыков). Ученик доступа НЕ имеет.';

create index if not exists ix_lesson_items_konspekt
  on public.lesson_items (konspekt_id);

-- ───────────────────────────── RLS на таблицы ─────────────────────────────

alter table public.skill_tags_dim enable row level security;
alter table public.lesson_items   enable row level security;

-- Словарь: read для authenticated (RPC отдаёт только is_enabled; прямой select допустим — справочник).
drop policy if exists skill_tags_dim_read on public.skill_tags_dim;
create policy skill_tags_dim_read on public.skill_tags_dim
  for select to authenticated
  using (true);

-- lesson_items: SELECT только учителю-владельцу контейнера под consent (defense-in-depth для
-- прямого PostgREST-select). Ученику НЕ выдаём ничего: student-select политики нет вовсе.
drop policy if exists lesson_items_teacher_select on public.lesson_items;
create policy lesson_items_teacher_select on public.lesson_items
  for select to authenticated
  using (
    exists (
      select 1
      from public.konspekts k
      where k.id = public.lesson_items.konspekt_id
        and k.teacher_id = auth.uid()
        and exists (
          select 1 from public.teacher_students ts
          where ts.teacher_id = k.teacher_id and ts.student_id = k.student_id
        )
    )
  );
-- Прямых INSERT/UPDATE/DELETE политик НЕТ → запись только через security-definer RPC ниже.

-- ───────────────────────────── RPC ─────────────────────────────
-- Сигнатуры могут меняться между прогонами → drop+create.

-- 1) lesson_item_upsert_v1: upsert флага/тегов карточки занятия.
--    Гейт: владелец-учитель контейнера + consent. opened_at не перезатираем (первое взаимодействие),
--    flagged_at пишем как пришёл, time_ms = best-effort (flagged_at - opened_at), иначе null.
drop function if exists public.lesson_item_upsert_v1(uuid, text, text, text[], timestamptz, timestamptz);
create function public.lesson_item_upsert_v1(
  p_konspekt_id uuid,
  p_question_id text,
  p_flag        text,
  p_skill_tags  text[],
  p_opened_at   timestamptz,
  p_flagged_at  timestamptz
)
returns public.lesson_items
language plpgsql
volatile
security definer
set search_path to 'public'
as $function$
declare
  v_teacher uuid := auth.uid();
  v_k       public.konspekts%rowtype;
  v_row     public.lesson_items%rowtype;
  v_eff_opened timestamptz;
  v_time_ms int;
begin
  if v_teacher is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if p_question_id is null or btrim(p_question_id) = '' then
    raise exception 'QUESTION_REQUIRED' using errcode = '22023';
  end if;
  if p_flag is not null and p_flag not in ('clean','hint','arith','lost') then
    raise exception 'BAD_FLAG' using errcode = '22023';
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

  -- Эффективный opened_at: уже сохранённый (первое взаимодействие) или присланный сейчас.
  select li.opened_at into v_eff_opened
  from public.lesson_items li
  where li.konspekt_id = p_konspekt_id and li.question_id = p_question_id;
  v_eff_opened := coalesce(v_eff_opened, p_opened_at);

  v_time_ms := case
    when v_eff_opened is not null and p_flagged_at is not null
      then greatest(0, floor(extract(epoch from (p_flagged_at - v_eff_opened)) * 1000))::int
    else null
  end;

  insert into public.lesson_items
    (konspekt_id, question_id, flag, skill_tags, opened_at, flagged_at, time_ms, updated_at)
  values
    (p_konspekt_id, p_question_id, p_flag, coalesce(p_skill_tags, '{}'),
     v_eff_opened, p_flagged_at, v_time_ms, now())
  on conflict (konspekt_id, question_id) do update
    set flag       = excluded.flag,
        skill_tags = excluded.skill_tags,
        opened_at  = coalesce(public.lesson_items.opened_at, excluded.opened_at),  -- не перезатираем первое
        flagged_at = excluded.flagged_at,
        time_ms    = excluded.time_ms,
        updated_at = now()
  returning * into v_row;

  return v_row;
end;
$function$;

-- 2) lesson_items_for_konspekt_v1: все события карточек данного занятия (для повторного входа).
--    Гейт: владелец-учитель + consent. Ученику недоступно (revoke anon + проверка teacher_id).
drop function if exists public.lesson_items_for_konspekt_v1(uuid);
create function public.lesson_items_for_konspekt_v1(
  p_konspekt_id uuid
)
returns setof public.lesson_items
language plpgsql
stable
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
    return;   -- нет контейнера → пусто
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

  return query
    select * from public.lesson_items li
    where li.konspekt_id = p_konspekt_id
    order by li.question_id;
end;
$function$;

-- 3) skill_tags_dim_v1: словарь навыков (только is_enabled), для дропдауна тега навыка.
drop function if exists public.skill_tags_dim_v1();
create function public.skill_tags_dim_v1()
returns setof public.skill_tags_dim
language sql
stable
security definer
set search_path to 'public'
as $function$
  select * from public.skill_tags_dim
  where is_enabled = true
  order by sort, label;
$function$;

-- ───────────────────────────── Seed стартового словаря ─────────────────────────────
-- СТАРТОВЫЙ словарь — требует ревью оператором. on conflict do nothing: повторный прогон
-- не перетирает ручные правки label/topic/sort, сделанные оператором.
insert into public.skill_tags_dim (code, label, topic, sort) values
  ('fractions',          'дроби',                                       'алгебра',     10),
  ('discriminant',       'дискриминант',                                'алгебра',     20),
  ('roots_radicals',     'корни и радикалы',                            'алгебра',     30),
  ('interval_method',    'метод интервалов (анализ знаков)',            'алгебра',     40),
  ('expr_transform',     'преобразование выражений',                    'алгебра',     50),
  ('sign_on_transfer',   'знак при переносе',                           'алгебра',     60),
  ('root_loss_gain',     'потеря/появление корня',                      'алгебра',     70),
  ('odz',                'ОДЗ',                                          'общее',       80),
  ('reduction_formulas', 'формулы приведения',                          'тригонометрия', 90),
  ('double_angle',       'формулы двойного угла',                       'тригонометрия', 100),
  ('trig_circle',        'тригонометрическая окружность / отбор корней','тригонометрия', 110),
  ('planimetry_facts',   'базовая планиметрия (факты)',                 'планиметрия', 120)
on conflict (code) do nothing;

-- ───────────────────────────── GRANT / REVOKE ─────────────────────────────
revoke execute on function public.lesson_item_upsert_v1(uuid, text, text, text[], timestamptz, timestamptz) from anon;
revoke execute on function public.lesson_items_for_konspekt_v1(uuid)                                          from anon;
revoke execute on function public.skill_tags_dim_v1()                                                         from anon;

grant execute on function public.lesson_item_upsert_v1(uuid, text, text, text[], timestamptz, timestamptz) to authenticated;
grant execute on function public.lesson_items_for_konspekt_v1(uuid)                                          to authenticated;
grant execute on function public.skill_tags_dim_v1()                                                         to authenticated;

commit;
