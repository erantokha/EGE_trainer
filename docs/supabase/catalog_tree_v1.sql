-- catalog_tree_v1.sql
-- Stage 1 proposed contract.
-- Canonical backend read API for runtime catalog tree `theme -> subtopic`.
-- Designed from docs/navigation/catalog_tree_v1_spec.md.

begin;

create or replace function public.catalog_tree_v1()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
with filtered_themes as (
  select
    t.theme_id,
    t.title,
    t.sort_order,
    t.catalog_version
  from public.catalog_theme_dim t
  where coalesce(t.is_enabled, true) = true
    and coalesce(t.is_hidden, false) = false
),
filtered_subtopics as (
  select
    s.subtopic_id,
    s.theme_id,
    s.title,
    s.sort_order,
    s.catalog_version
  from public.catalog_subtopic_dim s
  where coalesce(s.is_enabled, true) = true
    and coalesce(s.is_hidden, false) = false
),
subtopics_by_theme as (
  select
    s.theme_id,
    count(*)::int as total_subtopics,
    jsonb_agg(
      jsonb_build_object(
        'subtopic_id', s.subtopic_id,
        'theme_id', s.theme_id,
        'title', s.title,
        'sort_order', s.sort_order
      )
      order by s.sort_order, s.subtopic_id
    ) as subtopics
  from filtered_subtopics s
  group by s.theme_id
),
themes_json as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'theme_id', t.theme_id,
        'title', t.title,
        'sort_order', t.sort_order,
        'total_subtopics', coalesce(st.total_subtopics, 0),
        'subtopics', coalesce(st.subtopics, '[]'::jsonb)
      )
      order by t.sort_order, t.theme_id
    ),
    '[]'::jsonb
  ) as j
  from filtered_themes t
  left join subtopics_by_theme st
    on st.theme_id = t.theme_id
),
catalog_version as (
  select coalesce(max(v.catalog_version), '') as value
  from (
    select t.catalog_version from filtered_themes t
    union all
    select s.catalog_version from filtered_subtopics s
  ) v
),
counts as (
  select
    (select count(*)::int from filtered_themes) as total_themes,
    (select count(*)::int from filtered_subtopics) as total_subtopics
)
select jsonb_build_object(
  'themes', (select j from themes_json),
  'meta', jsonb_build_object(
    'catalog_version', (select value from catalog_version),
    'generated_at', now(),
    'total_themes', (select total_themes from counts),
    'total_subtopics', (select total_subtopics from counts),
    'version', 'catalog_tree_v1'
  )
);
$function$;

revoke execute on function public.catalog_tree_v1() from anon;

grant execute on function public.catalog_tree_v1() to authenticated;

commit;
