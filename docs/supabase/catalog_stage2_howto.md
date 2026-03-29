catalog stage2: rollout order

1. Apply schema update
- open Supabase -> SQL Editor
- run [catalog_migration_v1.sql](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/docs/supabase/catalog_migration_v1.sql)

2. Apply catalog data refresh
- run [catalog_upsert_v1.sql](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/docs/supabase/catalog_upsert_v1.sql)

3. Apply Stage-2 RPC for `subtopic -> unic`
- run [catalog_subtopic_unics_v1.sql](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/docs/supabase/catalog_subtopic_unics_v1.sql)

4. Apply Stage-2 RPC for targeted `question_id / unic_id` lookup
- run [catalog_question_lookup_v1.sql](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/docs/supabase/catalog_question_lookup_v1.sql)

5. Run schema/catalog smoke
- run [catalog_migration_v1_smoke.sql](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/docs/supabase/catalog_migration_v1_smoke.sql)

6. Run Stage-2 rollout smoke
- run [catalog_stage2_rollout_smoke.sql](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/docs/supabase/catalog_stage2_rollout_smoke.sql)

6a. Optional compact Stage-2 rollout smoke
- run [catalog_stage2_rollout_smoke_summary.sql](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/docs/supabase/catalog_stage2_rollout_smoke_summary.sql)
- it returns one result set with `check_id`, `check_name`, `status`, `details`

7. Frontend smoke after rollout
- open [student.html](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/student.html)
- create "Умное ДЗ" from recommendations
- create "Вариант 12"
- open [hw_create.html](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/hw_create.html) and verify preview cards for manually added tasks
- open [trainer.html](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/trainer.html) and verify smart/session restore

7a. Optional browser autotest for Stage 2 primary paths
- open [catalog_stage2_browser_smoke.html](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/catalog_stage2_browser_smoke.html) in the same browser where the teacher session already works
- if you use the local dev server, open `http://127.0.0.1:8000/tasks/catalog_stage2_browser_smoke.html`
- click `Run smoke`
- expected result: summary is `OK`
- checks should confirm:
  - `catalog_subtopic_unics_v1` goes through RPC without table fallback
  - `catalog_question_lookup_v1` works for both `unic_id` and `question_id`
  - `smart_hw_builder` does not emit manifest-scan fallback warning
  - `question_preview` does not emit topic-path fallback warning

What should change after live rollout
- console warnings about Stage-2 fallback should disappear:
  - `question_preview: lookupQuestionsByIdsV1 failed, using topic-path fallback`
  - `smart_hw_builder: catalog lookup failed, using manifest scan fallback`
  - `hw_create: lookupQuestionsByIdsV1 failed, using topic-manifest fallback`
  - `trainer: lookupQuestionsByIdsV1 failed, using topic-pool fallback`
- provider primary path should go through:
  - `catalog_subtopic_unics_v1`
  - `catalog_question_lookup_v1`

Optional local check
- if `SUPABASE_URL` and `SUPABASE_ANON_KEY` are available, run:
```powershell
node tools/check_catalog_sync.mjs
```

Current status
- rollout bundle applied in live Supabase
- SQL smoke summary: `ok=9; warn=0; fail=0`
- browser smoke: `ok=7; warn=0; fail=0`

Notes
- Stage-2 frontend changes are already fallback-safe in repo, so rollout is expected to be low-risk.
- The highest-value live check is that targeted lookup returns non-empty `manifest_path` and no longer falls back to topic-wide manifest scans for known `question_id`.
