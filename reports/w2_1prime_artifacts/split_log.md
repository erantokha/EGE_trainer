# W2.1' split assignment (assign.cjs) — correctness-first partition

counts: core=85  student=21  teacher=68  (total 174)
cross-role / core->role VIOLATIONS: 41
  ✗ CORE saveTeacherPickFilterId -> normalizeTeacherFilterId(teacher) [core must not call role module]
  ✗ loadTeacherStudentStats(teacher) -> clearStudentLast10UI(student)
  ✗ CORE saveHomeLast10Cache -> homeLast10CacheKey(student) [core must not call role module]
  ✗ CORE applyDashboardHomeStats -> clearStudentLast10UI(student) [core must not call role module]
  ✗ CORE applyDashboardHomeStats -> updateScoreForecast(student) [core must not call role module]
  ✗ CORE applyDashboardHomeStats -> updateSmartHint(student) [core must not call role module]
  ✗ CORE applyTeacherPickingHomeStats -> buildTeacherPickingHomeModel(teacher) [core must not call role module]
  ✗ CORE applyTeacherPickingHomeStats -> updateScoreForecast(student) [core must not call role module]
  ✗ CORE applyTeacherPickingHomeStats -> renderTeacherHomeRecs(teacher) [core must not call role module]
  ✗ CORE initAuthHeader -> refreshTeacherStudentSelect(teacher) [core must not call role module]
  ✗ CORE initAuthHeader -> initTeacherPickFiltersUI(teacher) [core must not call role module]
  ✗ CORE initAuthHeader -> initSmartControls(student) [core must not call role module]
  ✗ CORE initAuthHeader -> initCreateHomeworkButton(teacher) [core must not call role module]
  ✗ CORE initAuthHeader -> initAddedTasksModal(teacher) [core must not call role module]
  ✗ CORE initAuthHeader -> readTeacherSelectedStudentId(teacher) [core must not call role module]
  ✗ CORE initAuthHeader -> applyTeacherStudentView(teacher) [core must not call role module]
  ✗ CORE initAuthHeader -> initStudentLast10LiveRefresh(student) [core must not call role module]
  ✗ CORE initAuthHeader -> refreshStudentLast10(student) [core must not call role module]
  ✗ CORE initPickModeToggle -> updateSmartHint(student) [core must not call role module]
  ✗ CORE tryBuildSmartSelection -> refreshStudentLast10(student) [core must not call role module]
  ✗ CORE tryBuildSmartSelection -> updateSmartHint(student) [core must not call role module]
  ✗ CORE bulkResetAll -> rotateCurrentTeacherPickSessionSeed(teacher) [core must not call role module]
  ✗ CORE refreshCountsUI -> scheduleSyncAddedTasks(teacher) [core must not call role module]
  ✗ CORE setTopicCount -> scheduleSyncAddedTasks(teacher) [core must not call role module]
  ✗ CORE setSectionCount -> scheduleSyncAddedTasks(teacher) [core must not call role module]
  ✗ CORE setProtoCount -> scheduleSyncAddedTasks(teacher) [core must not call role module]
  ✗ CORE refreshProtoModalBadges -> setModalStatsBadge(teacher) [core must not call role module]
  ✗ CORE refreshProtoModalBadges -> loadTeacherStatsForModal(teacher) [core must not call role module]
  ✗ CORE openProtoPickerModal -> ensurePickerManifest(teacher) [core must not call role module]
  ✗ CORE renderProtoModalCard -> setModalStatsBadge(teacher) [core must not call role module]
  ✗ CORE renderProtoModalCard -> buildStemPreview(teacher) [core must not call role module]
  ✗ CORE buildTeacherResolveSelection -> normalizeResolveReqArray(teacher) [core must not call role module]
  ✗ CORE syncAddedTasksToSelection -> ensureAddedTasksContextLoaded(teacher) [core must not call role module]
  ✗ CORE syncAddedTasksToSelection -> pickQuestionsViaTeacherScreenResolveBatch(teacher) [core must not call role module]
  ✗ CORE syncAddedTasksToSelection -> appendPickedQuestionsToBucket(teacher) [core must not call role module]
  ✗ CORE syncAddedTasksToSelection -> pickDeltaForBucket(teacher) [core must not call role module]
  ✗ CORE syncAddedTasksToSelection -> pickQuestionsViaTeacherScreenResolve(teacher) [core must not call role module]
  ✗ CORE syncAddedTasksToSelection -> persistAddedTasksContext(teacher) [core must not call role module]
  ✗ CORE syncAddedTasksToSelection -> refreshAddedTasksModalView(teacher) [core must not call role module]
  ✗ CORE saveSelectionAndGo -> getActiveTeacherFilterId(teacher) [core must not call role module]

core exports needed (called by role modules): 36
  aggregateStatsForQuestionIds, applyDashboardHomeStats, applyTeacherPickingHomeStats, asset, badgeClassByPct, buildModalBadgeGroup, buildTeacherResolveSelection, compareId, flattenAddedQuestions, flushTeacherAddedTasksSelection, fmtCnt, fmtDateTimeRu, fmtPct, fmtPrimaryExact, getExcludeSet, getTotalSelected, incIdCount, isStudentLikeHome, pct, readSelectionFromDOM, refreshProtoModalBadges, renderAccordion, safeJsonParse, saveHomeLast10Cache, saveTeacherAddedTasksStore, saveTeacherPickFilterId, setHomeCoverageBadge, setHomeSectionBadge, setHomeStatsLoading, setHomeTopicBadge, setModalDateBadge, sortAddedQuestions, studentLabel, syncAddedTasksToSelection, tryBuildSmartSelection, typesetMathIfNeeded

## STUDENT functions
  _syncHtThermoHeight — Teacher (desktop): set --ht-thermo-h CSS var from badges-head row height, via ResizeObserver.
  clearStudentLast10UI — Student-like: reset all home badges/titles/forecast/recs to empty 'no data' state.
  getAppBuildTag — Util: read the app-build meta tag (used for cache-key versioning).
  homeLast10CacheKey — Student: build the localStorage/sessionStorage cache key for last-10 dashboard data.
  initSmartControls — Student: wire the smart-training N-count buttons and 'build plan' button.
  initStudentLast10LiveRefresh — Student: wire visibility/pageshow/auth-state listeners to live-refresh the last-10 dashboard.
  invalidateStudentLast10Cache — Student: drop cached last-10 dashboard entries for a uid (session+local).
  isFallbackSessionUsable — Student: decide whether a fallback session has a token and enough TTL to use.
  loadHomeLast10Cache — Student: read cached last-10 dashboard from session/local/legacy storage respecting TTLs.
  readCache — Util: read+parse a JSON object from a Storage by key, null on failure.
  readSessionFallback — Student: read a fallback Supabase session directly from localStorage auth-token.
  refreshStudentLast10 — Student: load the last-10 dashboard (cache-first, fallback session, boot retries) and apply.
  scheduleStudentLast10Refresh — Student: debounce a last-10 refresh trigger.
  secondaryFromPrimary — Util: map a rounded primary score (0-12) to the secondary EGE score via fixed table.
  sessionTtlSec — Util: compute remaining TTL (seconds) of a session from expires_at, NaN if unknown.
  setSmartN — Student: set the smart-training target task count and reflect active N button.
  supabaseRefFromUrl — Util: extract the supabase project ref subdomain from a URL.
  thermoColorByPrimary — Util: map a rounded primary score to thermometer color class.
  updateScoreForecast — Student-like: compute primary/secondary forecast from per-section %, render forecast panel + thermo.
  updateScoreThermo — Student-like: render the readiness 'thermometer' fill/labels on the combo input (student-like only).
  updateSmartHint — Student: update the smart-training hint text based on login/stats/selection state.

## TEACHER functions
  anyPositive — Util: true if any value in a count map is > 0.
  appendPickedQuestionsToBucket — Teacher: append picked questions to a bucket and bump id counts; returns how many added.
  applyTeacherStudentView — Teacher: switch into 'as the student' mode — re-render accordion and load that student's stats.
  buildHwCreatePrefill — Both: build the hw_create prefill payload (counts, shuffle, teacher student/filter/picked-refs).
  buildPreviewQuestionsFromResolveRows — Teacher: turn resolved RPC rows into preview questions per bucket, dedup up to wanted counts.
  buildQuestionForPreview — Util: build a preview question (ids, titles, stem, figure, badge ids) from manifest/type/proto.
  buildResolveBucketKey — Util: build a canonical 'proto:/topic:/section:' bucket key from a scope kind+id.
  buildStemPreview — Util: build an HTML stem preview (interpolated template + optional figure img) for a prototype.
  buildTeacherPickingHomeModel — Teacher: transform picking-screen v2 payload into a render model (%, coverage, recs, tooltips).
  closeAddedTasksModal — Teacher: close the added-tasks preview modal.
  collectTeacherPickedRefs — Teacher: collect deduped {topic_id, question_id} refs from all added-task buckets.
  createEmptyTeacherModalStat — Teacher: build a zeroed question-stat record placeholder.
  createTeacherPickSeed — Teacher: generate a random session seed for deterministic teacher picking.
  ensureAddedTasksContextLoaded — Teacher: load/switch the added-tasks context for the current student+filter, rebuilding id counts.
  ensurePickerManifest — Util: fetch+memoize a topic's manifest JSON from topic.path.
  escapeHtml — Util: HTML-escape a string (full entity set).
  getActiveTeacherFilterId — Teacher: resolve the effective filter id for a given/selected student (null if none).
  getAddedTasksModalEls — Teacher: resolve the added-tasks preview modal DOM elements.
  getAddedTasksRenderSignature — Teacher: compute a signature of the added-tasks list (context+total+ordered ids) for reuse.
  getCurrentTeacherPickSessionSeed — Teacher: get the current added-tasks context seed for a student (empty if none).
  getResolveRowBucketKey — Util: derive the bucket key for a resolved RPC row (handles global_all and id aliases).
  getTeacherAddedTasksContextKey — Teacher: build the context key (student id + filter id) keying the added-tasks store.
  getTeacherModalCachedAggregate — Teacher: return an aggregated stat for question ids only if all are present in cache, else null.
  getTeacherModalStatsCache — Teacher: get (optionally create) the per-student in-memory question-stats cache map.
  getTeacherResolveManifestIndex — Teacher: fetch+cache a manifest and build a question-id -> {manifest,type,proto} index.
  hydrateAddedTasksModalBadgesFromCache — Teacher: fill added-task card badges from cached aggregates without a network call.
  inferRecommendationReasonFromState — Teacher: derive a recommendation reason from a topic's performance/freshness/coverage state.
  inferTopicIdFromQuestionId — Util: derive a topic id (first two dotted segments) from a question id.
  initAddedTasksModal — Teacher: one-time wiring of the added-tasks button/close/backdrop/Escape + initial context load.
  initCreateHomeworkButton — Teacher: wire 'Create homework' button — flush added tasks, save prefill, navigate to hw_create.
  initTeacherPickFiltersUI — Teacher: one-time wiring of the picking-filter radios + restore persisted filter on boot.
  interpolate — Util: substitute ${param} placeholders in a stem template string.
  listVisibleTeacherTopicsForPreload — Teacher: list catalog topics with a manifest path, for stats warmup preloading.
  loadTeacherAddedTasksStore — Teacher: read the persisted added-tasks store (per-context buckets) from sessionStorage.
  loadTeacherPickFilterId — Teacher: read the persisted picking-filter id from sessionStorage.
  loadTeacherStatsForModal — Teacher: get question stats for modal badges, using cache and fetching only missing ids.
  loadTeacherStudentStats — Teacher: fetch the selected student's picking-screen stats (v2 init) and apply them.
  loadTopicPoolForPreview — Util: load+memoize a topic's full prototype pool from its manifest(s) (topic.path/paths).
  mergeRecommendationMeta — Teacher: keep the higher-priority of two recommendation metas for a topic.
  normalizeResolveReqArray — Util: normalize a choice map/array into [{id,n}] entries with positive n.
  normalizeTeacherFilterId — Teacher: validate a picking-filter id against the allowed set, returning null if invalid.
  normalizeTeacherModalStatsMap — Teacher: normalize a stats map to a complete map keyed by the requested question ids.
  normalizeTeacherPickedRef — Teacher: normalize an added-task row to a {topic_id, question_id} ref.
  onTeacherContextChanged — Teacher: on student/filter change reload context, force-sync added tasks, refresh proto badges.
  openAddedTasksModalFast — Teacher: open added-tasks modal reusing the rendered view when unchanged, else flush+render.
  persistAddedTasksContext — Teacher: save the current in-memory added-tasks context (seed+buckets) into the store.
  pickDeltaForBucket — Teacher: pick N more questions for a bucket — via RPC when a student is selected, else local engine.
  pickQuestionsViaTeacherScreenResolve — Teacher: resolve concrete questions for one scope via teacher_picking_screen_v2 (resolve mode).
  pickQuestionsViaTeacherScreenResolveBatch — Teacher: resolve concrete questions for many scopes in one teacher_picking_resolve_batch_v1 call.
  readTeacherSelectedStudentId — Teacher: read the last-selected student id from sessionStorage, honoring a TTL.
  recommendationPriority — Teacher: numeric priority ordering of recommendation reasons (weak < low < stale < uncovered).
  refreshAddedTasksModalBadges — Teacher: fetch and render per-card student stat/date badges in the added-tasks modal.
  refreshAddedTasksModalView — Teacher: render the added-tasks preview, typeset math, then refresh badges.
  refreshTeacherStudentSelect — Teacher: load/refresh the student dropdown via listMyStudents (throttle, dedup, timeouts).
  rememberTeacherModalStats — Teacher: merge a fetched question->stats map into the per-student modal cache.
  renderAddedTasksPreview — Teacher: render added-task cards (numbering, badges, section/topic meta, stem, figure) + meta.
  renderTeacherHomeRecs — Teacher: render the top-3 'recommended today' cards and toggle the rec start button.
  rotateCurrentTeacherPickSessionSeed — Teacher: replace the current context seed with a fresh random one.
  scheduleSyncAddedTasks — Teacher: debounce (or immediate) a sync of added-task buckets to the current selection.
  setCurrentTeacherPickSessionSeed — Teacher: set the current context seed (defaulting to a new seed) and persist.
  setModalStatsBadge — Teacher: render a question/group stat into a modal stats badge (color, %, count, tooltip).
  setTeacherPickFiltersEnabled — Teacher: enable/disable the hidden filter radio inputs (gated on a student being selected).
  setTeacherStudentStatus — Teacher: write a status message into the student-select status element.
  setTeacherStudentViewUI — Teacher: set the active viewed-student id, toggle body class, enable filters, notify context change.
  syncTeacherPickFiltersUI — Teacher: reflect the current filter id into the hidden filter radio checked-states.
  warmTeacherModalStatsForStudent — Teacher: background-preload per-topic question stats for the selected student (concurrent workers).
  wireTeacherStudentSelect — Teacher: attach a once-only change handler to the hidden student <select> driving the student view.
  writeTeacherSelectedStudentId — Teacher: persist the selected student id (with timestamp) for hw_create autofill.
