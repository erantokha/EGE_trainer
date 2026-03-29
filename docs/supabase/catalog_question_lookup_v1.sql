-- catalog_question_lookup_v1.sql
-- Stage 2 proposed contract.
-- Canonical backend targeted lookup for `question_id` / `unic_id`.
-- Designed from docs/navigation/catalog_question_lookup_v1_spec.md.

begin;

create or replace function public.catalog_question_lookup_v1(
  p_question_ids text[] default null::text[],
  p_unic_ids text[] default null::text[]
)
returns table(
  question_id text,
  unic_id text,
  subtopic_id text,
  theme_id text,
  sort_order integer,
  manifest_path text,
  catalog_version text
)
language sql
stable
security definer
set search_path to 'public'
set row_security to 'off'
as $function$
with req_questions as (
  select distinct nullif(trim(x), '') as question_id
  from unnest(coalesce(p_question_ids, '{}'::text[])) as x
  where nullif(trim(x), '') is not null
),
req_unics as (
  select distinct nullif(trim(x), '') as unic_id
  from unnest(coalesce(p_unic_ids, '{}'::text[])) as x
  where nullif(trim(x), '') is not null
),
visible_themes as (
  select
    t.theme_id,
    t.sort_order as theme_sort_order
  from public.catalog_theme_dim t
  where coalesce(t.is_enabled, true) = true
    and coalesce(t.is_hidden, false) = false
),
visible_subtopics as (
  select
    s.subtopic_id,
    s.theme_id,
    s.sort_order as subtopic_sort_order,
    s.source_path as subtopic_source_path,
    vt.theme_sort_order
  from public.catalog_subtopic_dim s
  join visible_themes vt
    on vt.theme_id = s.theme_id
  where coalesce(s.is_enabled, true) = true
    and coalesce(s.is_hidden, false) = false
),
visible_unics as (
  select
    u.unic_id,
    u.subtopic_id,
    u.theme_id,
    u.sort_order as unic_sort_order,
    vs.theme_sort_order,
    vs.subtopic_sort_order,
    vs.subtopic_source_path
  from public.catalog_unic_dim u
  join visible_subtopics vs
    on vs.subtopic_id = u.subtopic_id
   and vs.theme_id = u.theme_id
  where coalesce(u.is_enabled, true) = true
    and coalesce(u.is_hidden, false) = false
),
visible_questions as (
  select
    q.question_id,
    q.unic_id,
    q.subtopic_id,
    q.theme_id,
    q.sort_order,
    coalesce(
      nullif(trim(q.manifest_path), ''),
      nullif(trim(vu.subtopic_source_path), '')
    ) as manifest_path,
    q.catalog_version,
    vu.theme_sort_order,
    vu.subtopic_sort_order,
    vu.unic_sort_order
  from public.catalog_question_dim q
  join visible_unics vu
    on vu.unic_id = q.unic_id
   and vu.subtopic_id = q.subtopic_id
   and vu.theme_id = q.theme_id
  where coalesce(q.is_enabled, true) = true
    and coalesce(q.is_hidden, false) = false
),
requested_question_ids as (
  select rq.question_id
  from req_questions rq

  union

  select vq.question_id
  from visible_questions vq
  join req_unics ru
    on ru.unic_id = vq.unic_id
)
select
  vq.question_id,
  vq.unic_id,
  vq.subtopic_id,
  vq.theme_id,
  vq.sort_order,
  coalesce(vq.manifest_path, '') as manifest_path,
  vq.catalog_version
from visible_questions vq
join requested_question_ids r
  on r.question_id = vq.question_id
order by
  vq.theme_sort_order asc,
  vq.theme_id asc,
  vq.subtopic_sort_order asc,
  vq.subtopic_id asc,
  vq.unic_sort_order asc,
  vq.unic_id asc,
  vq.sort_order asc,
  vq.question_id asc;
$function$;

revoke execute on function public.catalog_question_lookup_v1(
  text[], text[]
) from anon;

grant execute on function public.catalog_question_lookup_v1(
  text[], text[]
) to authenticated;

commit;
