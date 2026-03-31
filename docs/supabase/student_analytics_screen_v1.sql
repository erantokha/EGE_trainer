-- student_analytics_screen_v1.sql
-- Stage-3 canonical backend-driven screen contract for student analytics surfaces.
-- Designed from docs/navigation/student_analytics_screen_v1_spec.md.

begin;

create or replace function public.student_analytics_screen_v1(
  p_viewer_scope text default 'teacher'::text,
  p_student_id uuid default null,
  p_days integer default 30,
  p_source text default 'all'::text,
  p_mode text default 'init'::text
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
set row_security to 'off'
as $function$
declare
  v_uid uuid := auth.uid();
  v_viewer_scope text := lower(coalesce(nullif(trim(p_viewer_scope), ''), 'teacher'));
  v_source text := lower(coalesce(nullif(trim(p_source), ''), 'all'));
  v_mode text := lower(coalesce(nullif(trim(p_mode), ''), 'init'));
  v_days integer := greatest(1, least(coalesce(p_days, 30), 3650));
  v_target_student uuid;
  v_payload jsonb;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if v_viewer_scope not in ('teacher', 'self') then
    raise exception 'BAD_VIEWER_SCOPE';
  end if;

  if v_source not in ('all', 'hw', 'test') then
    raise exception 'BAD_SOURCE';
  end if;

  if v_mode <> 'init' then
    raise exception 'BAD_MODE';
  end if;

  if v_viewer_scope = 'teacher' then
    if p_student_id is null then
      raise exception 'BAD_STUDENT_ID';
    end if;
    v_target_student := p_student_id;
    if not public.is_teacher_for_student(v_target_student) then
      raise exception 'ACCESS_DENIED';
    end if;
  else
    if p_student_id is not null and p_student_id <> v_uid then
      raise exception 'ACCESS_DENIED';
    end if;
    v_target_student := v_uid;
  end if;

  with params as (
    select
      v_uid as viewer_id,
      v_viewer_scope as viewer_scope,
      v_target_student as student_id,
      v_days as days,
      v_source as source,
      now() as now_ts,
      now() - make_interval(days => v_days) as since_ts
  ),
  student_profile as (
    select
      p.id,
      p.email,
      p.first_name,
      p.last_name,
      p.student_grade
    from public.profiles p
    join params prm
      on prm.student_id = p.id
  ),
  visible_themes as (
    select
      t.theme_id,
      t.title,
      t.sort_order,
      t.catalog_version
    from public.catalog_theme_dim t
    where coalesce(t.is_enabled, true) = true
      and coalesce(t.is_hidden, false) = false
  ),
  visible_subtopics as (
    select
      s.subtopic_id,
      s.theme_id,
      s.title,
      s.sort_order,
      s.catalog_version,
      vt.title as theme_title,
      vt.sort_order as theme_sort_order
    from public.catalog_subtopic_dim s
    join visible_themes vt
      on vt.theme_id = s.theme_id
    where coalesce(s.is_enabled, true) = true
      and coalesce(s.is_hidden, false) = false
  ),
  topic_state as (
    select
      ts.student_id,
      ts.source,
      ts.theme_id,
      ts.subtopic_id,
      ts.visible_proto_count,
      ts.unique_proto_seen_count,
      ts.not_seen_proto_count,
      ts.low_seen_proto_count,
      ts.enough_seen_proto_count,
      ts.covered_proto_count,
      ts.solved_proto_count,
      ts.independent_correct_proto_count,
      ts.weak_proto_count,
      ts.stale_proto_count,
      ts.unstable_proto_count,
      ts.attempt_count_total,
      ts.correct_count_total,
      ts.accuracy,
      ts.last_attempt_at,
      ts.mastered_proto_count,
      ts.mastered_attempt_count_total,
      ts.mastered_correct_count_total,
      ts.mastered_accuracy,
      ts.last_mastered_attempt_at,
      ts.is_not_seen,
      ts.is_low_seen,
      ts.is_enough_seen,
      ts.is_stale,
      ts.is_unstable
    from params p
    cross join lateral public.student_topic_state_v1(p.student_id, p.source) ts
  ),
  events as (
    select
      coalesce(ae.occurred_at, ae.created_at) as ts,
      nullif(trim(ae.section_id), '') as theme_id,
      nullif(trim(ae.topic_id), '') as subtopic_id,
      coalesce(ae.correct, false) as correct
    from public.answer_events ae
    join params p
      on p.student_id = ae.student_id
    join visible_subtopics vs
      on vs.theme_id = nullif(trim(ae.section_id), '')
     and vs.subtopic_id = nullif(trim(ae.topic_id), '')
    where v_source = 'all'
       or ae.source = v_source
  ),
  overall_all as (
    select
      count(*)::int as total,
      coalesce(sum(case when e.correct then 1 else 0 end), 0)::int as correct,
      max(e.ts) as last_seen_at
    from events e
  ),
  overall_period as (
    select
      count(*)::int as total,
      coalesce(sum(case when e.correct then 1 else 0 end), 0)::int as correct
    from events e
    cross join params p
    where e.ts >= p.since_ts
  ),
  overall_last10 as (
    select
      count(*)::int as total,
      coalesce(sum(case when x.correct then 1 else 0 end), 0)::int as correct
    from (
      select e.correct
      from events e
      order by e.ts desc
      limit 10
    ) x
  ),
  overall_last3 as (
    select
      count(*)::int as total,
      coalesce(sum(case when x.correct then 1 else 0 end), 0)::int as correct
    from (
      select e.correct
      from events e
      order by e.ts desc
      limit 3
    ) x
  ),
  theme_all as (
    select
      e.theme_id,
      count(*)::int as total,
      coalesce(sum(case when e.correct then 1 else 0 end), 0)::int as correct,
      max(e.ts) as last_seen_at
    from events e
    group by e.theme_id
  ),
  theme_period as (
    select
      e.theme_id,
      count(*)::int as total,
      coalesce(sum(case when e.correct then 1 else 0 end), 0)::int as correct
    from events e
    cross join params p
    where e.ts >= p.since_ts
    group by e.theme_id
  ),
  theme_last10 as (
    select
      x.theme_id,
      count(*)::int as total,
      coalesce(sum(case when x.correct then 1 else 0 end), 0)::int as correct
    from (
      select
        e.theme_id,
        e.correct,
        row_number() over (partition by e.theme_id order by e.ts desc) as rn
      from events e
    ) x
    where x.rn <= 10
    group by x.theme_id
  ),
  topic_all as (
    select
      e.theme_id,
      e.subtopic_id,
      count(*)::int as total,
      coalesce(sum(case when e.correct then 1 else 0 end), 0)::int as correct,
      max(e.ts) as last_seen_at
    from events e
    group by e.theme_id, e.subtopic_id
  ),
  topic_period as (
    select
      e.subtopic_id,
      count(*)::int as total,
      coalesce(sum(case when e.correct then 1 else 0 end), 0)::int as correct
    from events e
    cross join params p
    where e.ts >= p.since_ts
    group by e.subtopic_id
  ),
  topic_last10 as (
    select
      x.subtopic_id,
      count(*)::int as total,
      coalesce(sum(case when x.correct then 1 else 0 end), 0)::int as correct
    from (
      select
        e.subtopic_id,
        e.correct,
        row_number() over (partition by e.subtopic_id order by e.ts desc) as rn
      from events e
    ) x
    where x.rn <= 10
    group by x.subtopic_id
  ),
  topic_last3 as (
    select
      x.subtopic_id,
      count(*)::int as total,
      coalesce(sum(case when x.correct then 1 else 0 end), 0)::int as correct
    from (
      select
        e.subtopic_id,
        e.correct,
        row_number() over (partition by e.subtopic_id order by e.ts desc) as rn
      from events e
    ) x
    where x.rn <= 3
    group by x.subtopic_id
  ),
  theme_coverage as (
    select
      ts.theme_id,
      coalesce(sum(ts.visible_proto_count), 0)::int as visible_proto_count,
      coalesce(sum(ts.unique_proto_seen_count), 0)::int as unique_proto_seen_count
    from topic_state ts
    group by ts.theme_id
  ),
  section_rows_data as (
    select
      vt.theme_id,
      vt.theme_id as section_id,
      vt.title,
      vt.sort_order,
      ta.last_seen_at,
      coalesce(tl.total, 0)::int as last10_total,
      coalesce(tl.correct, 0)::int as last10_correct,
      coalesce(tp.total, 0)::int as period_total,
      coalesce(tp.correct, 0)::int as period_correct,
      coalesce(ta.total, 0)::int as all_total,
      coalesce(ta.correct, 0)::int as all_correct,
      coalesce(tc.unique_proto_seen_count, 0)::int as unics_attempted,
      coalesce(tc.visible_proto_count, 0)::int as unics_total,
      case
        when coalesce(tc.visible_proto_count, 0) > 0
          then round((coalesce(tc.unique_proto_seen_count, 0)::numeric * 100.0) / tc.visible_proto_count::numeric)::int
        else null::int
      end as coverage_pct
    from visible_themes vt
    left join theme_all ta
      on ta.theme_id = vt.theme_id
    left join theme_period tp
      on tp.theme_id = vt.theme_id
    left join theme_last10 tl
      on tl.theme_id = vt.theme_id
    left join theme_coverage tc
      on tc.theme_id = vt.theme_id
  ),
  topic_rows_data as (
    select
      vs.theme_id,
      vs.theme_id as section_id,
      vs.theme_title,
      vs.subtopic_id,
      vs.subtopic_id as topic_id,
      vs.title,
      vs.sort_order as topic_order,
      vs.theme_sort_order,
      coalesce(ta.last_seen_at, ts.last_attempt_at) as last_seen_at,
      coalesce(t3.total, 0)::int as last3_total,
      coalesce(t3.correct, 0)::int as last3_correct,
      case
        when coalesce(t3.total, 0) > 0
          then round((coalesce(t3.correct, 0)::numeric * 100.0) / t3.total::numeric)::int
        else null::int
      end as last3_pct,
      coalesce(t10.total, 0)::int as last10_total,
      coalesce(t10.correct, 0)::int as last10_correct,
      coalesce(tp.total, 0)::int as period_total,
      coalesce(tp.correct, 0)::int as period_correct,
      coalesce(ta.total, 0)::int as all_total,
      coalesce(ta.correct, 0)::int as all_correct,
      coalesce(ts.visible_proto_count, 0)::int as visible_proto_count,
      coalesce(ts.unique_proto_seen_count, 0)::int as unique_proto_seen_count,
      coalesce(ts.attempt_count_total, 0)::int as attempt_count_total,
      coalesce(ts.correct_count_total, 0)::int as correct_count_total,
      coalesce(ts.accuracy, null::numeric) as accuracy,
      coalesce(ts.is_not_seen, false) as is_not_seen,
      coalesce(ts.is_low_seen, false) as is_low_seen,
      coalesce(ts.is_enough_seen, false) as is_enough_seen,
      coalesce(ts.is_stale, false) as is_stale,
      case
        when coalesce(ts.visible_proto_count, 0) > 0
          then round((coalesce(ts.unique_proto_seen_count, 0)::numeric * 100.0) / ts.visible_proto_count::numeric)::int
        else null::int
      end as coverage_pct,
      case
        when coalesce(ts.unique_proto_seen_count, 0) > 0 then 'covered'
        else 'uncovered'
      end as coverage_state,
      case
        when coalesce(ts.is_not_seen, false) then 'none'
        when coalesce(ts.is_low_seen, false) then 'low'
        else 'enough'
      end as sample_state,
      case
        when coalesce(ts.attempt_count_total, 0) >= 2
         and coalesce(ts.accuracy, 1::numeric) < 0.7
          then 'weak'
        else 'stable'
      end as performance_state,
      case
        when coalesce(ts.is_stale, false) then 'stale'
        else 'fresh'
      end as freshness_state
    from visible_subtopics vs
    left join topic_state ts
      on ts.theme_id = vs.theme_id
     and ts.subtopic_id = vs.subtopic_id
    left join topic_all ta
      on ta.theme_id = vs.theme_id
     and ta.subtopic_id = vs.subtopic_id
    left join topic_period tp
      on tp.subtopic_id = vs.subtopic_id
    left join topic_last10 t10
      on t10.subtopic_id = vs.subtopic_id
    left join topic_last3 t3
      on t3.subtopic_id = vs.subtopic_id
  ),
  sections_json as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'theme_id', s.theme_id,
          'section_id', s.section_id,
          'title', s.title,
          'last_seen_at', s.last_seen_at,
          'last10', jsonb_build_object('total', s.last10_total, 'correct', s.last10_correct),
          'period', jsonb_build_object('total', s.period_total, 'correct', s.period_correct),
          'all_time', jsonb_build_object('total', s.all_total, 'correct', s.all_correct),
          'coverage', jsonb_build_object(
            'unics_attempted', s.unics_attempted,
            'unics_total', s.unics_total,
            'pct', s.coverage_pct
          )
        )
        order by
          case when s.theme_id ~ '^[0-9]+$' then s.theme_id::int else 9999 end,
          s.theme_id
      ),
      '[]'::jsonb
    ) as j
    from section_rows_data s
  ),
  topics_json as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'theme_id', t.theme_id,
          'section_id', t.section_id,
          'subtopic_id', t.subtopic_id,
          'topic_id', t.topic_id,
          'title', t.title,
          'topic_order', t.topic_order,
          'last_seen_at', t.last_seen_at,
          'last3', jsonb_build_object('total', t.last3_total, 'correct', t.last3_correct),
          'last10', jsonb_build_object('total', t.last10_total, 'correct', t.last10_correct),
          'period', jsonb_build_object('total', t.period_total, 'correct', t.period_correct),
          'all_time', jsonb_build_object('total', t.all_total, 'correct', t.all_correct),
          'coverage', jsonb_build_object(
            'unics_attempted', t.unique_proto_seen_count,
            'unics_total', t.visible_proto_count,
            'pct', t.coverage_pct
          ),
          'derived', jsonb_build_object(
            'coverage_state', t.coverage_state,
            'sample_state', t.sample_state,
            'performance_state', t.performance_state,
            'freshness_state', t.freshness_state
          )
        )
        order by
          case when t.theme_id ~ '^[0-9]+$' then t.theme_id::int else 9999 end,
          t.theme_sort_order,
          t.topic_order,
          t.subtopic_id
      ),
      '[]'::jsonb
    ) as j
    from topic_rows_data t
  ),
  uncovered_ranked as (
    select
      t.*,
      row_number() over (
        partition by t.theme_id
        order by
          case when t.period_total = 0 then 0 else 1 end,
          t.all_total,
          t.subtopic_id
      ) as rn
    from topic_rows_data t
  ),
  uncovered_pick as (
    select *
    from uncovered_ranked
    where rn = 1
  ),
  worst3_ranked as (
    select
      t.*,
      row_number() over (
        partition by t.theme_id
        order by
          t.last3_pct asc nulls last,
          t.last3_total desc,
          t.all_total asc,
          t.subtopic_id
      ) as rn
    from topic_rows_data t
    where t.last3_total > 0
  ),
  worst3_pick_direct as (
    select *
    from worst3_ranked
    where rn = 1
  ),
  variant12_uncovered_rows as (
    select
      u.theme_id,
      u.theme_title,
      u.subtopic_id,
      u.title as subtopic_title,
      'uncovered'::text as mode,
      case
        when u.period_total = 0 then 'Не решал в выбранном периоде.'
        when u.all_total > 0 then
          'Попыток: '
          || u.all_total::text
          || ' (точность '
          || coalesce(
            case
              when u.all_total > 0
                then round((u.all_correct::numeric * 100.0) / u.all_total::numeric)::int::text || '%'
              else null
            end,
            '—'
          )
          || ').'
        else 'Не решал.'
      end as reason,
      false as picked_fallback,
      jsonb_build_object(
        'last3_total', u.last3_total,
        'last3_correct', u.last3_correct,
        'last3_pct', u.last3_pct,
        'all_total', u.all_total,
        'all_correct', u.all_correct,
        'all_pct',
          case
            when u.all_total > 0
              then round((u.all_correct::numeric * 100.0) / u.all_total::numeric)::int
            else null::int
          end
      ) as meta,
      u.theme_sort_order,
      u.topic_order
    from uncovered_pick u
  ),
  variant12_worst3_rows as (
    select
      coalesce(w.theme_id, u.theme_id) as theme_id,
      coalesce(w.theme_title, u.theme_title) as theme_title,
      coalesce(w.subtopic_id, u.subtopic_id) as subtopic_id,
      coalesce(w.title, u.title) as subtopic_title,
      'worst3'::text as mode,
      case
        when w.theme_id is not null then
          'Последние '
          || w.last3_total::text
          || ': '
          || w.last3_correct::text
          || '/'
          || w.last3_total::text
          || ' ('
          || coalesce(w.last3_pct::text, '—')
          || '%).'
        else 'Нет данных по последним 3, выбран по минимуму попыток.'
      end as reason,
      (w.theme_id is null) as picked_fallback,
      jsonb_build_object(
        'last3_total', coalesce(w.last3_total, u.last3_total),
        'last3_correct', coalesce(w.last3_correct, u.last3_correct),
        'last3_pct', coalesce(w.last3_pct, u.last3_pct),
        'all_total', coalesce(w.all_total, u.all_total),
        'all_correct', coalesce(w.all_correct, u.all_correct),
        'all_pct',
          case
            when coalesce(w.all_total, u.all_total) > 0
              then round((coalesce(w.all_correct, u.all_correct)::numeric * 100.0) / coalesce(w.all_total, u.all_total)::numeric)::int
            else null::int
          end
      ) as meta,
      coalesce(w.theme_sort_order, u.theme_sort_order) as theme_sort_order,
      coalesce(w.topic_order, u.topic_order) as topic_order
    from uncovered_pick u
    left join worst3_pick_direct w
      on w.theme_id = u.theme_id
  ),
  variant12_missing_themes as (
    select
      vt.theme_id,
      vt.title
    from visible_themes vt
    left join uncovered_pick u
      on u.theme_id = vt.theme_id
    where u.theme_id is null
  ),
  variant12_uncovered_json as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'theme_id', r.theme_id,
          'theme_title', r.theme_title,
          'subtopic_id', r.subtopic_id,
          'subtopic_title', r.subtopic_title,
          'mode', r.mode,
          'reason', r.reason,
          'picked_fallback', r.picked_fallback,
          'meta', r.meta
        )
        order by
          case when r.theme_id ~ '^[0-9]+$' then r.theme_id::int else 9999 end,
          r.theme_sort_order,
          r.topic_order,
          r.subtopic_id
      ),
      '[]'::jsonb
    ) as j
    from variant12_uncovered_rows r
  ),
  variant12_worst3_json as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'theme_id', r.theme_id,
          'theme_title', r.theme_title,
          'subtopic_id', r.subtopic_id,
          'subtopic_title', r.subtopic_title,
          'mode', r.mode,
          'reason', r.reason,
          'picked_fallback', r.picked_fallback,
          'meta', r.meta
        )
        order by
          case when r.theme_id ~ '^[0-9]+$' then r.theme_id::int else 9999 end,
          r.theme_sort_order,
          r.topic_order,
          r.subtopic_id
      ),
      '[]'::jsonb
    ) as j
    from variant12_worst3_rows r
  ),
  variant12_issues_json as (
    select coalesce(
      jsonb_agg(('Раздел ' || m.theme_id || ': нет тем в каталоге.')::text order by m.theme_id),
      '[]'::jsonb
    ) as j
    from variant12_missing_themes m
  ),
  catalog_version_row as (
    select max(v.catalog_version) as catalog_version
    from (
      select vt.catalog_version
      from visible_themes vt
      union all
      select vs.catalog_version
      from visible_subtopics vs
    ) v
  )
  select jsonb_build_object(
    'student', jsonb_build_object(
      'student_id', p.student_id,
      'viewer_scope', p.viewer_scope,
      'days', p.days,
      'source', p.source,
      'display_name',
        coalesce(
          nullif(trim(concat(coalesce(sp.first_name, ''), ' ', coalesce(sp.last_name, ''))), ''),
          nullif(split_part(coalesce(sp.email, ''), '@', 1), ''),
          'Ученик'
        ),
      'grade', sp.student_grade,
      'last_seen_at', (select oa.last_seen_at from overall_all oa)
    ),
    'catalog_version', (select cv.catalog_version from catalog_version_row cv),
    'screen', jsonb_build_object(
      'mode', 'init',
      'source_contract', 'student_analytics_screen_v1',
      'supports', jsonb_build_object(
        'variant12', (p.viewer_scope = 'teacher'),
        'recommendations', false,
        'works', false
      )
    ),
    'overall', jsonb_build_object(
      'last_seen_at', (select oa.last_seen_at from overall_all oa),
      'last3', jsonb_build_object(
        'total', (select o3.total from overall_last3 o3),
        'correct', (select o3.correct from overall_last3 o3)
      ),
      'last10', jsonb_build_object(
        'total', (select o10.total from overall_last10 o10),
        'correct', (select o10.correct from overall_last10 o10)
      ),
      'period', jsonb_build_object(
        'total', (select op.total from overall_period op),
        'correct', (select op.correct from overall_period op)
      ),
      'all_time', jsonb_build_object(
        'total', (select oa.total from overall_all oa),
        'correct', (select oa.correct from overall_all oa)
      )
    ),
    'sections', (select sj.j from sections_json sj),
    'topics', (select tj.j from topics_json tj),
    'variant12', jsonb_build_object(
      'uncovered', jsonb_build_object(
        'rows', case when p.viewer_scope = 'teacher' then (select uj.j from variant12_uncovered_json uj) else '[]'::jsonb end,
        'issues', case when p.viewer_scope = 'teacher' then (select ij.j from variant12_issues_json ij) else '[]'::jsonb end
      ),
      'worst3', jsonb_build_object(
        'rows', case when p.viewer_scope = 'teacher' then (select wj.j from variant12_worst3_json wj) else '[]'::jsonb end,
        'issues', case when p.viewer_scope = 'teacher' then (select ij.j from variant12_issues_json ij) else '[]'::jsonb end
      )
    ),
    'recommendations', '[]'::jsonb,
    'warnings', '[]'::jsonb,
    'generated_at', p.now_ts
  )
  into v_payload
  from params p
  left join student_profile sp
    on true;

  return v_payload;
end;
$function$;

revoke execute on function public.student_analytics_screen_v1(
  text, uuid, integer, text, text
) from anon;

grant execute on function public.student_analytics_screen_v1(
  text, uuid, integer, text, text
) to authenticated;

commit;
