-- stage8_deprecated_rpc_drop.sql
-- Stage 8 cleanup: drop deprecated RPCs from Supabase.
--
-- Все четыре функции не имеют production-потребителей после завершения Stage 8 (шаги 1–5):
--   - frontend-код переведён на student_analytics_screen_v1
--   - legacy provider functions удалены из app/providers/homework.js
--   - stage3 smoke удалён
--
-- Запустить в Supabase SQL Editor или через psql.
-- Проверить отсутствие потребителей перед запуском:
--   grep -rn "teacher_picking_screen_v1\|student_dashboard_self_v2\|student_dashboard_for_teacher_v2\|subtopic_coverage_for_teacher_v1" tasks/ app/

drop function if exists public.teacher_picking_screen_v1(
  uuid, text, integer, text, jsonb, jsonb, text[]
);

drop function if exists public.student_dashboard_self_v2(
  integer, text
);

drop function if exists public.student_dashboard_for_teacher_v2(
  uuid, integer, text
);

drop function if exists public.subtopic_coverage_for_teacher_v1(
  uuid, text[]
);
