-- stage4_parity_smoke.sql
-- Stage 4: Dual-run parity check.
-- Сравнивает результаты старых dashboard RPC с новым student_analytics_screen_v1.
--
-- Проверяемые пары:
--   teacher scope: student_dashboard_for_teacher_v2  vs  student_analytics_screen_v1('teacher')
--   coverage:      subtopic_coverage_for_teacher_v1  vs  student_analytics_screen_v1 topics[*].coverage
--
-- Примечание по self scope:
--   student_dashboard_self_v2 использует auth.uid() как student_id.
--   В SQL Editor auth.uid() = teacher_id из синтетического JWT.
--   Поэтому self-scope паритет валидируется в browser smoke, где учитель
--   может смотреть на собственную статистику или студент — на свою.
--
-- Usage: Supabase SQL Editor (Run as teacher — синтетический JWT настраивается ниже).
-- All statements are SELECT-only.
-- Expected: status = 'OK' или 'WARN' по всем строкам, fail_count = 0.

with

-- ─── 1. presence: обе функции должны существовать ───────────────────────────

required_functions as (
  select * from (values
    ('student_analytics_screen_v1'::text),
    ('student_dashboard_for_teacher_v2'::text),
    ('subtopic_coverage_for_teacher_v1'::text)
  ) v(routine_name)
),
function_presence as (
  select
    rf.routine_name,
    count(r.routine_name) > 0 as found
  from required_functions rf
  left join information_schema.routines r
    on r.specific_schema = 'public'
   and r.routine_name = rf.routine_name
  group by rf.routine_name
),

-- ─── 2. sample teacher + auth setup ─────────────────────────────────────────
-- Выбираем только учителя. Студента выберем ПОСЛЕ поднятия auth,
-- чтобы is_teacher_for_student() работал в правильном auth-контексте.

sample_teacher as (
  select distinct ts.teacher_id
  from public.teacher_students ts
  join public.profiles p
    on p.id = ts.teacher_id
   and lower(coalesce(p.role, '')) = 'teacher'
  join auth.users au
    on au.id = ts.teacher_id
  join public.teachers tw
    on lower(tw.email) = lower(coalesce(au.email, ''))
   and coalesce(tw.approved, true) = true
  order by ts.teacher_id
  limit 1
),
auth_applied as materialized (
  select
    st.teacher_id,
    set_config('request.jwt.claim.sub',  st.teacher_id::text, true) as jwt_sub,
    set_config('request.jwt.claim.role', 'authenticated',     true) as jwt_role,
    set_config(
      'request.jwt.claims',
      jsonb_build_object('sub', st.teacher_id::text, 'role', 'authenticated')::text,
      true
    ) as jwt_claims
  from sample_teacher st
),
-- Выбираем студента уже внутри auth-контекста: is_teacher_for_student
-- вызывается с правильным auth.uid() и возвращает корректный результат.
sample_pair as (
  select
    ap.teacher_id,
    ts.student_id
  from auth_applied ap
  join public.teacher_students ts on ts.teacher_id = ap.teacher_id
  where public.is_teacher_for_student(ts.student_id) = true
    and exists (
      select 1 from public.answer_events ae
      where ae.student_id = ts.student_id
      limit 1
    )
  order by ts.student_id
  limit 1
),
auth_probe as (
  select
    sp.teacher_id,
    sp.student_id,
    auth.uid() as effective_uid,
    true        as can_access_student   -- гарантировано: отобрано через is_teacher_for_student
  from sample_pair sp
),
auth_state as (
  select
    teacher_id,
    student_id,
    effective_uid,
    can_access_student,
    -- is_ready: пара найдена + is_teacher_for_student прошла (отобрано в sample_pair)
    (teacher_id is not null and student_id is not null) as is_ready

  from auth_probe

  union all

  select null, null, null, false, false
  where not exists (select 1 from auth_probe)

  limit 1
),

-- ─── 3. вызов нового RPC ────────────────────────────────────────────────────

new_raw as (
  select
    public.student_analytics_screen_v1(
      'teacher',
      ast.student_id,
      30, 'all', 'init'
    ) as payload
  from auth_state ast
  where ast.is_ready = true
),
new_payload as (
  select payload from new_raw
  union all
  select null::jsonb where not exists (select 1 from new_raw)
  limit 1
),

-- ─── 4. вызов старого RPC teacher ───────────────────────────────────────────

old_teacher_raw as (
  select
    public.student_dashboard_for_teacher_v2(
      ast.student_id,
      30, 'all'
    ) as payload
  from auth_state ast
  where ast.is_ready = true
),
old_teacher_payload as (
  select payload from old_teacher_raw
  union all
  select null::jsonb where not exists (select 1 from old_teacher_raw)
  limit 1
),

-- ─── 5. overall — сравнение агрегатов верхнего уровня ───────────────────────
-- Старый RPC: overall.{all_time, period, last10}
-- Новый RPC:  overall.{all_time, period, last10}
-- Поля идентичны по имени — прямое сравнение.

overall_cmp as (
  select
    -- old
    (otp.payload #>> '{overall,all_time,total}')::int   as old_at_total,
    (otp.payload #>> '{overall,all_time,correct}')::int as old_at_correct,
    (otp.payload #>> '{overall,period,total}')::int     as old_pd_total,
    (otp.payload #>> '{overall,period,correct}')::int   as old_pd_correct,
    (otp.payload #>> '{overall,last10,total}')::int     as old_l10_total,
    (otp.payload #>> '{overall,last10,correct}')::int   as old_l10_correct,
    -- new
    (np.payload #>> '{overall,all_time,total}')::int    as new_at_total,
    (np.payload #>> '{overall,all_time,correct}')::int  as new_at_correct,
    (np.payload #>> '{overall,period,total}')::int      as new_pd_total,
    (np.payload #>> '{overall,period,correct}')::int    as new_pd_correct,
    (np.payload #>> '{overall,last10,total}')::int      as new_l10_total,
    (np.payload #>> '{overall,last10,correct}')::int    as new_l10_correct
  from old_teacher_payload otp
  cross join new_payload np
),

-- ─── 6. topics — сравнение per-subtopic метрик ──────────────────────────────
-- Старый RPC: topics[].topic_id  (= subtopic_id)
-- Новый RPC:  topics[].subtopic_id
-- Джойн по этому ключу.

old_topics as (
  select
    t ->> 'topic_id'                          as topic_key,
    ((t -> 'all_time') ->> 'total')::int      as at_total,
    ((t -> 'all_time') ->> 'correct')::int    as at_correct,
    ((t -> 'period')   ->> 'total')::int      as pd_total,
    ((t -> 'period')   ->> 'correct')::int    as pd_correct,
    ((t -> 'last10')   ->> 'total')::int      as l10_total,
    ((t -> 'last10')   ->> 'correct')::int    as l10_correct,
    ((t -> 'last3')    ->> 'total')::int      as l3_total,
    ((t -> 'last3')    ->> 'correct')::int    as l3_correct
  from old_teacher_payload otp,
  jsonb_array_elements(coalesce(otp.payload -> 'topics', '[]'::jsonb)) as t
),
new_topics as (
  select
    t ->> 'subtopic_id'                       as topic_key,
    ((t -> 'all_time') ->> 'total')::int      as at_total,
    ((t -> 'all_time') ->> 'correct')::int    as at_correct,
    ((t -> 'period')   ->> 'total')::int      as pd_total,
    ((t -> 'period')   ->> 'correct')::int    as pd_correct,
    ((t -> 'last10')   ->> 'total')::int      as l10_total,
    ((t -> 'last10')   ->> 'correct')::int    as l10_correct,
    ((t -> 'last3')    ->> 'total')::int      as l3_total,
    ((t -> 'last3')    ->> 'correct')::int    as l3_correct
  from new_payload np,
  jsonb_array_elements(coalesce(np.payload -> 'topics', '[]'::jsonb)) as t
),
topic_cmp as (
  select
    coalesce(o.topic_key, n.topic_key) as topic_key,
    -- all_time
    o.at_total                         as old_at_total,
    n.at_total                         as new_at_total,
    o.at_correct                       as old_at_correct,
    n.at_correct                       as new_at_correct,
    -- period
    o.pd_total                         as old_pd_total,
    n.pd_total                         as new_pd_total,
    -- last10
    o.l10_total                        as old_l10_total,
    n.l10_total                        as new_l10_total,
    -- last3
    o.l3_total                         as old_l3_total,
    n.l3_total                         as new_l3_total,
    n.l3_correct                       as new_l3_correct,
    o.l3_correct                       as old_l3_correct,
    -- mismatch flags
    (coalesce(o.at_total,   0) <> coalesce(n.at_total,   0)) as mismatch_at,
    (coalesce(o.pd_total,   0) <> coalesce(n.pd_total,   0)) as mismatch_pd,
    (coalesce(o.l10_total,  0) <> coalesce(n.l10_total,  0)) as mismatch_l10,
    (coalesce(o.l3_total,   0) <> coalesce(n.l3_total,   0)) as mismatch_l3
  from old_topics o
  full outer join new_topics n using (topic_key)
),
topic_mismatch_counts as (
  select
    count(*) filter (where mismatch_at)  as cnt_at,
    count(*) filter (where mismatch_pd)  as cnt_pd,
    count(*) filter (where mismatch_l10) as cnt_l10,
    count(*) filter (where mismatch_l3)  as cnt_l3,
    count(*) filter (where topic_key is null or
                           (old_at_total is null and new_at_total is not null)) as cnt_only_new,
    count(*) filter (where topic_key is null or
                           (new_at_total is null and old_at_total is not null)) as cnt_only_old,
    count(*)                             as total_topics
  from topic_cmp
),

-- ─── 7. coverage — сравнение с subtopic_coverage_for_teacher_v1 ─────────────

old_coverage_raw as (
  select *
  from auth_state ast,
  lateral public.subtopic_coverage_for_teacher_v1(ast.student_id, null::text[])
  where ast.is_ready = true
),
old_coverage as (
  select
    subtopic_id as topic_key,
    unics_attempted,
    unics_total
  from old_coverage_raw
),
new_coverage as (
  select
    t ->> 'subtopic_id'                             as topic_key,
    ((t -> 'coverage') ->> 'unics_attempted')::int  as unics_attempted,
    ((t -> 'coverage') ->> 'unics_total')::int      as unics_total
  from new_payload np,
  jsonb_array_elements(coalesce(np.payload -> 'topics', '[]'::jsonb)) as t
),
coverage_cmp as (
  select
    coalesce(o.topic_key, n.topic_key)  as topic_key,
    o.unics_attempted                   as old_unics_attempted,
    n.unics_attempted                   as new_unics_attempted,
    o.unics_total                       as old_unics_total,
    n.unics_total                       as new_unics_total,
    (coalesce(o.unics_attempted, 0) <> coalesce(n.unics_attempted, 0)) as mismatch_attempted,
    (coalesce(o.unics_total,     0) <> coalesce(n.unics_total,     0)) as mismatch_total
  from old_coverage o
  full outer join new_coverage n using (topic_key)
),
coverage_mismatch_counts as (
  select
    count(*) filter (where mismatch_attempted) as cnt_attempted,
    count(*) filter (where mismatch_total)     as cnt_total,
    count(*)                                   as total_subtopics
  from coverage_cmp
),

-- ─── 8. итоговая таблица результатов ────────────────────────────────────────

checks as (

  -- check 1: функции доступны
  select
    1 as sort_order,
    'function_presence' as check_name,
    case
      when bool_and(found) then 'OK'
      else 'FAIL'
    end as status,
    string_agg(
      routine_name || '=' || found::text,
      '; ' order by routine_name
    ) as details
  from function_presence

  union all

  -- check 2: auth и пара teacher-student найдены
  -- студент выбран после поднятия auth, поэтому is_teacher_for_student уже гарантирован
  select
    2,
    'auth_and_sample_pair',
    case
      when exists (select 1 from auth_state where is_ready = true) then 'OK'
      when not exists (select 1 from sample_pair) then 'WARN'
      else 'FAIL'
    end,
    coalesce(
      (select 'teacher=' || teacher_id::text || '; student=' || student_id::text
         || '; uid=' || coalesce(effective_uid::text, 'null')
       from auth_state where is_ready = true),
      'no accessible teacher-student pair with answer_events found'
    )

  union all

  -- check 3: новый payload получен
  select
    3,
    'new_payload_received',
    case
      when (select payload from new_payload) is not null then 'OK'
      when not exists (select 1 from auth_state where is_ready = true) then 'WARN'
      else 'FAIL'
    end,
    case
      when (select payload from new_payload) is not null
        then 'payload_type=' || jsonb_typeof((select payload from new_payload))
      else 'null or skipped'
    end

  union all

  -- check 4: старый teacher payload получен
  select
    4,
    'old_teacher_payload_received',
    case
      when (select payload from old_teacher_payload) is not null then 'OK'
      when not exists (select 1 from auth_state where is_ready = true) then 'WARN'
      else 'FAIL'
    end,
    case
      when (select payload from old_teacher_payload) is not null
        then 'payload_type=' || jsonb_typeof((select payload from old_teacher_payload))
      else 'null or skipped'
    end

  union all

  -- check 5: overall.all_time паритет
  select
    5,
    'overall_all_time_parity',
    case
      when not exists (select 1 from auth_state where is_ready = true) then 'WARN'
      when (select old_at_total = new_at_total and old_at_correct = new_at_correct from overall_cmp)
        then 'OK'
      else 'FAIL'
    end,
    (
      select
        'old=' || coalesce(old_at_total::text, 'null')
        || '/' || coalesce(old_at_correct::text, 'null')
        || ' new=' || coalesce(new_at_total::text, 'null')
        || '/' || coalesce(new_at_correct::text, 'null')
      from overall_cmp
    )

  union all

  -- check 6: overall.period паритет
  select
    6,
    'overall_period_parity',
    case
      when not exists (select 1 from auth_state where is_ready = true) then 'WARN'
      when (select old_pd_total = new_pd_total and old_pd_correct = new_pd_correct from overall_cmp)
        then 'OK'
      else 'FAIL'
    end,
    (
      select
        'old=' || coalesce(old_pd_total::text, 'null')
        || '/' || coalesce(old_pd_correct::text, 'null')
        || ' new=' || coalesce(new_pd_total::text, 'null')
        || '/' || coalesce(new_pd_correct::text, 'null')
      from overall_cmp
    )

  union all

  -- check 7: overall.last10 паритет
  select
    7,
    'overall_last10_parity',
    case
      when not exists (select 1 from auth_state where is_ready = true) then 'WARN'
      when (select old_l10_total = new_l10_total and old_l10_correct = new_l10_correct from overall_cmp)
        then 'OK'
      else 'FAIL'
    end,
    (
      select
        'old=' || coalesce(old_l10_total::text, 'null')
        || '/' || coalesce(old_l10_correct::text, 'null')
        || ' new=' || coalesce(new_l10_total::text, 'null')
        || '/' || coalesce(new_l10_correct::text, 'null')
      from overall_cmp
    )

  union all

  -- check 8: topic all_time паритет
  select
    8,
    'topic_all_time_parity',
    case
      when not exists (select 1 from auth_state where is_ready = true) then 'WARN'
      when (select cnt_at from topic_mismatch_counts) = 0 then 'OK'
      else 'FAIL'
    end,
    (
      select
        'topics_total=' || total_topics
        || '; mismatches=' || cnt_at
        || '; only_in_new=' || cnt_only_new
        || '; only_in_old=' || cnt_only_old
      from topic_mismatch_counts
    )

  union all

  -- check 9: topic period паритет
  select
    9,
    'topic_period_parity',
    case
      when not exists (select 1 from auth_state where is_ready = true) then 'WARN'
      when (select cnt_pd from topic_mismatch_counts) = 0 then 'OK'
      else 'FAIL'
    end,
    (select 'mismatches=' || cnt_pd || '; topics_total=' || total_topics from topic_mismatch_counts)

  union all

  -- check 10: topic last10 паритет
  select
    10,
    'topic_last10_parity',
    case
      when not exists (select 1 from auth_state where is_ready = true) then 'WARN'
      when (select cnt_l10 from topic_mismatch_counts) = 0 then 'OK'
      else 'FAIL'
    end,
    (select 'mismatches=' || cnt_l10 || '; topics_total=' || total_topics from topic_mismatch_counts)

  union all

  -- check 11: topic last3 паритет
  select
    11,
    'topic_last3_parity',
    case
      when not exists (select 1 from auth_state where is_ready = true) then 'WARN'
      when (select cnt_l3 from topic_mismatch_counts) = 0 then 'OK'
      else 'FAIL'
    end,
    (select 'mismatches=' || cnt_l3 || '; topics_total=' || total_topics from topic_mismatch_counts)

  union all

  -- check 12: coverage unics_attempted паритет
  select
    12,
    'coverage_unics_attempted_parity',
    case
      when not exists (select 1 from auth_state where is_ready = true) then 'WARN'
      when (select cnt_attempted from coverage_mismatch_counts) = 0 then 'OK'
      else 'FAIL'
    end,
    (
      select
        'mismatches=' || cnt_attempted
        || '; subtopics_total=' || total_subtopics
      from coverage_mismatch_counts
    )

  union all

  -- check 13: coverage unics_total паритет
  select
    13,
    'coverage_unics_total_parity',
    case
      when not exists (select 1 from auth_state where is_ready = true) then 'WARN'
      when (select cnt_total from coverage_mismatch_counts) = 0 then 'OK'
      else 'FAIL'
    end,
    (
      select
        'mismatches=' || cnt_total
        || '; subtopics_total=' || total_subtopics
      from coverage_mismatch_counts
    )

)

-- ─── итоговый вывод ──────────────────────────────────────────────────────────

select
  sort_order                                    as "#",
  check_name                                    as check,
  status,
  details,
  case when status = 'FAIL' then 1 else 0 end  as is_fail

from checks

union all

select
  99,
  'summary',
  case
    when count(*) filter (where status = 'FAIL') = 0 then 'OK'
    else 'FAIL'
  end,
  'ok=' || count(*) filter (where status = 'OK')::text
  || '; warn=' || count(*) filter (where status = 'WARN')::text
  || '; fail=' || count(*) filter (where status = 'FAIL')::text
  || ' (stage4_parity_smoke)',
  count(*) filter (where status = 'FAIL')

from checks

order by 1;
