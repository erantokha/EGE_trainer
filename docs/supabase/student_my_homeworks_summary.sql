-- student_my_homeworks_summary.sql
-- Live-BD extract synchronized on 2026-03-29.
-- Source: pg_get_functiondef('public.student_my_homeworks_summary(integer)'::regprocedure)

begin;

create or replace function public.student_my_homeworks_summary(
  p_limit integer default 10
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_me uuid;
  v_total int;
  v_pending int;
  v_items jsonb;
  v_items_count int;
  v_lim int;
begin
  v_me := auth.uid();
  if v_me is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  v_lim := greatest(coalesce(p_limit, 10), 0);
  v_lim := least(v_lim, 50);

  select count(*)::int
    into v_total
  from public.homework_assignments a
  where a.student_id = v_me;

  select count(*)::int
    into v_pending
  from public.homework_assignments a
  where a.student_id = v_me
    and not exists (
      select 1
      from public.homework_attempts ha
      where ha.student_id = v_me
        and ha.homework_id = a.homework_id
        and ha.finished_at is not null
    );

  with items as (
    select
      a.id as assignment_id,
      a.homework_id,
      hw.title as title,
      a.assigned_at as assigned_at,
      sub.submitted_at as submitted_at,
      (sub.submitted_at is not null) as is_submitted,
      coalesce(
        (
          select hl.token
          from public.homework_links hl
          where hl.homework_id = a.homework_id
            and hl.token = a.token
            and hl.is_active = true
            and (hl.expires_at is null or hl.expires_at > now())
          limit 1
        ),
        (
          select hl.token
          from public.homework_links hl
          where hl.homework_id = a.homework_id
            and hl.is_active = true
            and (hl.expires_at is null or hl.expires_at > now())
          order by hl.created_at desc
          limit 1
        )
      ) as token
    from public.homework_assignments a
    join public.homeworks hw on hw.id = a.homework_id
    left join lateral (
      select max(ha.finished_at) as submitted_at
      from public.homework_attempts ha
      where ha.student_id = v_me
        and ha.homework_id = a.homework_id
        and ha.finished_at is not null
    ) sub on true
    where a.student_id = v_me
    order by a.assigned_at desc
    limit v_lim
  )
  select coalesce(jsonb_agg(to_jsonb(items)), '[]'::jsonb)
    into v_items
  from items;

  v_items_count := jsonb_array_length(v_items);

  return jsonb_build_object(
    'items', v_items,
    'pending_count', v_pending,
    'total_count', v_total,
    'archive_count', greatest(0, v_total - v_items_count)
  );
end;
$function$;

revoke execute on function public.student_my_homeworks_summary(
  integer
) from anon;

grant execute on function public.student_my_homeworks_summary(
  integer
) to authenticated;

commit;
