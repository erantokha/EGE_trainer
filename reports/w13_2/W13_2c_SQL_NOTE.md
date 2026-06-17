# W13.2c — SQL на ревью/деплой (учительское подтверждение балла части 2)

Дата 2026-06-18. Файл: **`docs/supabase/part2_teacher_review.sql`**. RED-ZONE (teacher-write в данные ученика +
RLS), **не-destructive** (`drop policy if exists` / `drop+create function`), идемпотентно. Деплой — оператор.

## Решение по §5.0 (важно — подтверди)
План делал §5.0 (выгрузку `is_teacher_for_student`/`is_allowed_teacher`/`is_teacher` из прода) предусловием.
**Recon показал: для teacher-write она НЕ нужна.** Канонический сильный гейт уже в репо — `get_homework_attempt_for_teacher.sql` и `lesson_items.sql` гейтят на:
1. **ВЛАДЕНИЕ**: `homework_links.owner_id = auth.uid()` (учитель создал эту ДЗ-попытку);
2. **СОГЛАСИЕ**: accepted-связь в `teacher_students` (revoke = мгновенная потеря доступа; `teacher_student_consent_v1.sql` подтверждает: эта таблица = только accepted).

Мой RPC повторяет ровно этот гейт. **`is_teacher()` СОЗНАТЕЛЬНО опущена**: это слабая роль-проверка, самоэскалируемая (security-audit-2026-06-10). ownership+consent строго сильнее. → §5.0 для W13.2c можно **не делать** (она осталась бы нужна только для глубокой интеграции teacher-scope аналитики `student_topic_state_v1`, которую я вынес из scope — см. ниже). **Если не согласен — скажи, сделаю §5.0 сначала.**

## Что вводит файл
- **teacher-select RLS** `part2_reviews_select_teacher` на `part2_attempt_reviews`: учитель видит ревью
  ученика только по СВОЕЙ ДЗ-попытке (ownership) и при accepted-связи. Свободные попытки (`hw_attempt_id`
  null) учителю недоступны.
- **RPC `confirm_part2_teacher_score_v1(p_attempt_id, p_question_id, p_teacher_score)`** (security definer):
  гейт ownership+consent+скоуп на `p_attempt_id`; пишет `teacher_score` (0/1/2) + `status='teacher_confirmed'`
  + аудит `teacher_id`/`reviewed_at`; `self_score` не трогает. Upsert (создаёт строку, если ученик не
  самооценивал).

## Деплой (оператор, Supabase SQL Editor)
1. Выполнить `docs/supabase/part2_teacher_review.sql` (один файл, ~3 KB).
2. Проверки:
   ```sql
   select count(*) from pg_policies where tablename='part2_attempt_reviews';            -- 2 (self + teacher)
   select proname, prosecdef from pg_proc where proname='confirm_part2_teacher_score_v1'; -- secdef = t
   ```

## Дальше — FE W13.2c (после деплоя SQL)
Подтверждение идёт **через ДЗ** (§5.10). Порядок:
1. **ДЗ part-2 solve** (`hw.js`): part-2 вопросы в ДЗ показывают эталон + самооценку (source='hw', hw_attempt_id) — чтобы было что проверять.
2. **Teacher-review UI** (`hw.js renderReviewCards`): контрол 0/1/2 «подтвердить» + эталон → RPC `confirm_part2_teacher_score_v1`.
3. **Прогноз «подтверждённый»** (официальный): официальный прогноз ученика включает `teacher_score` части 2 (как «самооценка» из W13.2b, но по teacher_score).

## Вынесено из scope W13.2c (флаг)
Глубокая интеграция teacher_score в аналитические агрегаты (`student_topic_state_v1`/`student_analytics_screen_v1`/teacher-роллапы, §5.6) — эти функции используют `is_teacher_for_student` и сложны; предлагаю **отдельной волной** (там §5.0 действительно понадобится). Для W13.2c достаточно: teacher-write + UI + официальный прогноз ученика по teacher_score.

## Governance
`check_runtime_rpc_registry` — ok (54/54, RPC зарегистрирован, homework-domain). SQL локально не прогонялся
(нет прод-PG); гейт дословно повторяет `get_homework_attempt_for_teacher.sql`.
