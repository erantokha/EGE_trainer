-- catalog_subtopic_unics_v1.sql
-- Stage 2 proposed contract.
-- Canonical backend listing for visible `subtopic -> unic`.
-- Designed from docs/navigation/catalog_subtopic_unics_v1_spec.md.

begin;

create or replace function public.catalog_subtopic_unics_v1(
  p_subtopic_ids text[] default null::text[]
)
returns table(
  subtopic_id text,
  theme_id text,
  unic_id text,
  title text,
  sort_order integer,
  total_question_count integer,
  is_counted_in_coverage boolean,
  catalog_version text
)
language sql
stable
security definer
set search_path to 'public'
set row_security to 'off'
as $function$
with req_subtopics as (
  select distinct nullif(trim(x), '') as subtopic_id
  from unnest(coalesce(p_subtopic_ids, '{}'::text[])) as x
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
    vt.theme_sort_order
  from public.catalog_subtopic_dim s
  join visible_themes vt
    on vt.theme_id = s.theme_id
  where coalesce(s.is_enabled, true) = true
    and coalesce(s.is_hidden, false) = false
    and (
      p_subtopic_ids is null
      or s.subtopic_id in (select rs.subtopic_id from req_subtopics rs)
    )
)
select
  u.subtopic_id,
  u.theme_id,
  u.unic_id,
  u.title,
  u.sort_order,
  u.total_question_count,
  u.is_counted_in_coverage,
  u.catalog_version
from public.catalog_unic_dim u
join visible_subtopics vs
  on vs.subtopic_id = u.subtopic_id
 and vs.theme_id = u.theme_id
where coalesce(u.is_enabled, true) = true
  and coalesce(u.is_hidden, false) = false
order by
  vs.theme_sort_order asc,
  u.theme_id asc,
  vs.subtopic_sort_order asc,
  u.subtopic_id asc,
  u.sort_order asc,
  u.unic_id asc;
$function$;

revoke execute on function public.catalog_subtopic_unics_v1(
  text[]
) from anon;

grant execute on function public.catalog_subtopic_unics_v1(
  text[]
) to authenticated;

commit;
