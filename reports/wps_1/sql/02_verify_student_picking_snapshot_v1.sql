-- WPS.1 · ФАЙЛ 02 · ВЕРИФИКАЦИЯ student_picking_snapshot_v1
-- Прогонять ПОСЛЕ файла 01. Копировать ЦЕЛИКОМ в Supabase SQL Editor и выполнить.
-- Ничего раскомментировать/менять не нужно (тестовый ученик уже подставлен).
-- Ожидаемый результат — ОДНА строка:
--   duration_ms        ≤ 300
--   payload_bytes      зафиксировать в отчёте (ожидание: < 200 000)
--   protos_rows        = числу видимых прототипов (≈184)
--   topics_rows        = числу видимых подтем (≈84)
--   qstats_rows        > 0 (тяжёлый ученик)
--   questions_unics    = protos_rows
--   parity_mismatch    = 0  (поля protos[] против student_proto_state_v1)

select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'f1d03f75-08ad-48e6-9128-8f69afefe81e', 'role', 'authenticated')::text,
  false
);

with t0 as materialized (
  select clock_timestamp() as started_at
),
snap as materialized (
  select
    (select started_at from t0) as started_at,
    public.student_picking_snapshot_v1('f1d03f75-08ad-48e6-9128-8f69afefe81e'::uuid, 'all') as j
),
fin as materialized (
  select snap.j, snap.started_at, clock_timestamp() as ended_at from snap
),
sp as (
  select
    (e->>'unic_id')                          as unic_id,
    (e->>'attempt_count_total')::int         as attempt_count_total,
    (e->>'correct_count_total')::int         as correct_count_total,
    (e->>'unique_question_ids_seen')::int    as unique_question_ids_seen,
    (e->>'is_not_seen')::boolean             as is_not_seen,
    (e->>'is_low_seen')::boolean             as is_low_seen,
    (e->>'is_weak')::boolean                 as is_weak,
    (e->>'is_stale')::boolean                as is_stale,
    (e->>'is_unstable')::boolean             as is_unstable,
    (e->>'last3_total')::int                 as last3_total,
    (e->>'last3_correct')::int               as last3_correct
  from fin, jsonb_array_elements(fin.j->'protos') e
),
ref as (
  select
    r.unic_id,
    r.attempt_count_total,
    r.correct_count_total,
    r.unique_question_ids_seen,
    r.is_not_seen,
    r.is_low_seen,
    r.is_weak,
    r.is_stale,
    r.is_unstable,
    r.last3_total,
    r.last3_correct
  from public.student_proto_state_v1('f1d03f75-08ad-48e6-9128-8f69afefe81e'::uuid, 'all') r
),
parity as (
  select count(*)::int as mismatch from (
    (select * from sp except select * from ref)
    union all
    (select * from ref except select * from sp)
  ) d
)
select
  round(extract(epoch from (fin.ended_at - fin.started_at)) * 1000)::int as duration_ms,
  length(fin.j::text)                                                    as payload_bytes,
  jsonb_array_length(fin.j->'protos')                                    as protos_rows,
  jsonb_array_length(fin.j->'topics')                                    as topics_rows,
  (select count(*) from jsonb_object_keys(fin.j->'qstats'))              as qstats_rows,
  (select count(*) from jsonb_object_keys(fin.j->'questions'))           as questions_unics,
  (select mismatch from parity)                                          as parity_mismatch
from fin;
