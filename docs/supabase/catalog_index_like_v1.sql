-- catalog_index_like_v1.sql
-- Stage 1 proposed contract.
-- Canonical backend read API for path-based runtime catalog consumers.
-- Designed from docs/navigation/catalog_index_like_v1_spec.md.

begin;

create or replace function public.catalog_index_like_v1()
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
    s.source_path,
    s.catalog_version
  from public.catalog_subtopic_dim s
  where coalesce(s.is_enabled, true) = true
    and coalesce(s.is_hidden, false) = false
),
group_items as (
  select
    1 as item_kind,
    t.sort_order as theme_sort_order,
    0 as topic_sort_order,
    t.theme_id as theme_id,
    t.theme_id as item_id,
    jsonb_build_object(
      'type', 'group',
      'id', t.theme_id,
      'theme_id', t.theme_id,
      'title', t.title,
      'sort_order', t.sort_order
    ) as item
  from filtered_themes t
),
topic_items as (
  select
    2 as item_kind,
    t.sort_order as theme_sort_order,
    s.sort_order as topic_sort_order,
    s.theme_id as theme_id,
    s.subtopic_id as item_id,
    jsonb_build_object(
      'type', 'topic',
      'id', s.subtopic_id,
      'subtopic_id', s.subtopic_id,
      'theme_id', s.theme_id,
      'parent', s.theme_id,
      'title', s.title,
      'sort_order', s.sort_order,
      'path', coalesce(s.source_path, '')
    ) as item
  from filtered_subtopics s
  join filtered_themes t
    on t.theme_id = s.theme_id
),
all_items as (
  select * from group_items
  union all
  select * from topic_items
),
items_json as (
  select coalesce(
    jsonb_agg(
      ai.item
      order by ai.item_kind asc, ai.theme_sort_order asc, ai.theme_id asc, ai.topic_sort_order asc, ai.item_id asc
    ),
    '[]'::jsonb
  ) as j
  from all_items ai
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
    (select count(*)::int from filtered_themes) as total_groups,
    (select count(*)::int from filtered_subtopics) as total_topics
)
select jsonb_build_object(
  'items', (select j from items_json),
  'meta', jsonb_build_object(
    'catalog_version', (select value from catalog_version),
    'generated_at', now(),
    'total_groups', (select total_groups from counts),
    'total_topics', (select total_topics from counts),
    'version', 'catalog_index_like_v1'
  )
);
$function$;

revoke execute on function public.catalog_index_like_v1() from anon;

grant execute on function public.catalog_index_like_v1() to authenticated;

commit;
