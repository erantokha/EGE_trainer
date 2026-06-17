-- part2_attempt_reviews.sql
-- W13.2b — самооценка ученика за задачи части 2 (№13). Двухуровневая модель балла
-- (self_score = ученик; teacher_score = учитель, заполняется в W13.2c).
--
-- Всё идемпотентно, безопасно прогонять повторно; НЕ destructive.
-- Вводит:
--   * Таблицу public.part2_attempt_reviews (+ RLS: ученик читает только свои строки).
--   * RPC public.submit_part2_self_score_v1 (security definer): ученик пишет ТОЛЬКО self_score
--     для своего auth.uid(); teacher_score/teacher_id/reviewed_at в W13.2b НЕ трогаются.
--
-- ГЛАВНЫЙ ИНВАРИАНТ (RED-ZONE): ученик не может выставить себе teacher_score. Прямых
--   INSERT/UPDATE/DELETE RLS-политик НЕТ → запись только через RPC, который whitelist'ит
--   self_score+status и жёстко привязывает строку к auth.uid(). Teacher-write (cross-user) +
--   teacher-select политика — отдельная волна W13.2c (после §5.0-выгрузки гейтов из прода).
--
-- Официальная статистика части 2 = teacher_score (coalesce), прогноз «самооценка» = self_score.
-- Шкала: 0/1/2 первичных за №13.

begin;

-- ───────────────────────────── Таблица ─────────────────────────────
create table if not exists public.part2_attempt_reviews (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null,                          -- = auth.uid() владельца (как answer_events.student_id)
  question_id   text not null,                          -- proto.id задачи части 2 (напр. 13.trig.factor.46.1)
  source        text not null default 'test' check (source in ('test', 'hw')),
  hw_attempt_id uuid,                                   -- null для свободных попыток (тренажёр)
  self_score    smallint check (self_score between 0 and 2),     -- ставит ученик (W13.2b)
  teacher_score smallint check (teacher_score between 0 and 2),  -- ставит учитель (W13.2c)
  status        text not null default 'self_scored'
                  check (status in ('self_scored', 'teacher_confirmed')),
  teacher_id    uuid,                                   -- аудит (W13.2c): кто подтвердил
  reviewed_at   timestamptz,                            -- аудит (W13.2c): когда
  max_primary   smallint not null default 2,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.part2_attempt_reviews is
  'W13.2: самооценка (self_score, ученик) и учительский балл (teacher_score, W13.2c) за задачи части 2 (№13). 0/1/2 первичных. Официально в статистику идёт teacher_score; self_score — прогноз «самооценка».';

-- Уникальность попытки: (student, question, hw_attempt). hw_attempt_id может быть null
-- (свободная попытка) → coalesce к нулевому uuid, чтобы NULL не плодил дубли (это ключ upsert).
create unique index if not exists ux_part2_reviews_attempt
  on public.part2_attempt_reviews
  (student_id, question_id, coalesce(hw_attempt_id, '00000000-0000-0000-0000-000000000000'::uuid));

create index if not exists ix_part2_reviews_student
  on public.part2_attempt_reviews (student_id);

-- ───────────────────────────── RLS ─────────────────────────────
alter table public.part2_attempt_reviews enable row level security;

-- Ученик читает СВОИ ревью (для прогноза «самооценка» и отображения статуса/балла).
drop policy if exists part2_reviews_select_self on public.part2_attempt_reviews;
create policy part2_reviews_select_self on public.part2_attempt_reviews
  for select to authenticated
  using (student_id = auth.uid());

-- Прямых INSERT/UPDATE/DELETE политик НЕТ → запись только через security-definer RPC ниже.
-- Teacher-select политику (учитель видит ревью своего ученика под consent) добавит W13.2c.

-- ───────────────────────────── RPC: самооценка ученика ─────────────────────────────
-- Пишет ТОЛЬКО self_score + status для auth.uid() (teacher_score недоступен ученику).
-- Сигнатура может меняться между прогонами → drop+create.
drop function if exists public.submit_part2_self_score_v1(text, integer, uuid, text);
create function public.submit_part2_self_score_v1(
  p_question_id   text,
  p_self_score    integer,
  p_hw_attempt_id uuid default null,
  p_source        text default 'test'
)
returns public.part2_attempt_reviews
language plpgsql
volatile
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_src text := lower(coalesce(nullif(btrim(p_source), ''), 'test'));
  v_row public.part2_attempt_reviews%rowtype;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if p_question_id is null or btrim(p_question_id) = '' then
    raise exception 'QUESTION_REQUIRED' using errcode = '22023';
  end if;
  if p_self_score is null or p_self_score < 0 or p_self_score > 2 then
    raise exception 'BAD_SCORE' using errcode = '22023';
  end if;
  if v_src not in ('test', 'hw') then
    raise exception 'BAD_SOURCE' using errcode = '22023';
  end if;

  insert into public.part2_attempt_reviews
    (student_id, question_id, source, hw_attempt_id, self_score, status, updated_at)
  values
    (v_uid, btrim(p_question_id), v_src, p_hw_attempt_id, p_self_score::smallint, 'self_scored', now())
  on conflict (student_id, question_id, coalesce(hw_attempt_id, '00000000-0000-0000-0000-000000000000'::uuid))
  do update set
    self_score = excluded.self_score,
    -- переоценка учеником НЕ снимает подтверждение учителя: если уже teacher_confirmed —
    -- статус сохраняем, иначе держим self_scored.
    status     = case when public.part2_attempt_reviews.status = 'teacher_confirmed'
                      then public.part2_attempt_reviews.status
                      else 'self_scored' end,
    updated_at = now()
  returning * into v_row;

  return v_row;
end;
$function$;

revoke execute on function public.submit_part2_self_score_v1(text, integer, uuid, text) from anon;
grant  execute on function public.submit_part2_self_score_v1(text, integer, uuid, text) to authenticated;

commit;
