# picker.js — cross-page (student vs teacher) branching analysis

`tasks/picker.js` is one module loaded by BOTH `home_student.html` (`<body data-home-variant="student">`)
and `home_teacher.html` (`<body data-home-variant="teacher">`). It self-detects the role at module load
(lines 57-61) and branches everywhere via three families of gates.

## How the role is detected (lines 57-61)

```
HOME_VARIANT     = body[data-home-variant]            // 'student' | 'teacher' | ''
IS_STUDENT_HOME  = HOME_VARIANT === 'student'
IS_STUDENT_PAGE  = IS_STUDENT_HOME && path ~ /home_student.html$/
IS_TEACHER_HOME  = HOME_VARIANT === 'teacher' && path ~ /home_teacher.html$/
CAN_PROTO_MODAL  = IS_STUDENT_PAGE || IS_TEACHER_HOME
```

These constants are frozen at load. `isStudentLikeHome()` (L153-160) is the only *dynamic* gate —
it returns true for the student page OR a teacher page where a student is currently selected
(`TEACHER_VIEW_STUDENT_ID`). This is the key design seam: teacher-with-student-selected deliberately
reuses the student stat-rendering path.

## Branch-point inventory

### A. `isStudentLikeHome()` call sites (dynamic; student OR teacher-viewing-student)
| Line | Function | Class |
|---|---|---|
| 554 | setHomeStatsLoading | mixed (shared rendering, role-agnostic body class) |
| 1219 | updateScoreThermo | mixed |
| 1260 | updateScoreForecast | mixed |
| 1303 | clearStudentLast10UI | mixed |
| 1617 | applyDashboardHomeStats | mixed |
| 1703 | applyDashboardHomeStats (tail) | mixed |
| 1979 | applyTeacherPickingHomeStats | mixed |
| 2841 | syncHomeTopicBadgesWidth | mixed |
| 2888 | renderAccordion (badges head) | mixed |
| 2936 | renderSectionNode (badge template) | mixed |
| 3033 | renderTopicRow (badge template) | mixed |

### B. `IS_TEACHER_HOME` gates — 33 occurrences (teacher-only branches)
Definition L60. Early-return guards (pure teacher code, dead on student page):
111, 243, 283, 310, 803, 3228, 3614, 3625, 3668, 3674, 3687, 3699, 3710, 4106, 4460.
Inline conditional branches inside shared functions:
154 (in isStudentLikeHome), 2301, 2346 (boot), 2715, 2743, 2787, 2809 (HW/bulk),
3102, 3107, 3121 (count setters → schedule added-tasks sync),
3361, 3380 (renderProtoModalCard adds teacher badges),
4998, 5009, 5032 (saveSelectionAndGo teacher tail).

### C. `IS_STUDENT_PAGE` gates — 17 occurrences (student-only branches)
Definition L59. Early-return guards: 1379, 1537, 1554, 2430, 2485, 2520, 2557.
Inline branches in shared functions: 2323, 2328, 2363 (boot), 3163, 3170 (refreshTotalSum smart-mode),
4996, 5016 (saveSelectionAndGo mode/pick_mode).

### D. `CAN_PROTO_MODAL` gates — 6 occurrences (student-like shell, shared by both)
Definition L61. Guards: 3042, 3203, 3209, 3288, 3439. The proto modal *shell* is shared;
teacher-only stat badges are layered in via IS_TEACHER_HOME inside it (3361/3380).

### E. `CURRENT_ROLE` checks — legacy auth header only
L50 (decl), set at 2147/2166/2173, read at 2266. Used ONLY by the legacy `initAuthHeader`/menu path
(Section 10), which is itself no-op when `#appHeader` exists (L2188) — i.e. dead on both real home pages
(both ship `#appHeader`). This is a third, near-orphaned role mechanism.

## Per-section classification (clean / mixed / tangled)

| Section (from volume map) | Lines | Classification | Notes |
|---|---|---|---|
| 0 preamble/globals | 1-67 | mixed | shared state; role flags defined here |
| 1 teacher pick-filters | 68-152 | **clean (teacher)** | every fn IS_TEACHER_HOME-gated or DOM-gated to teacher elements |
| 2 branch helper + utils | 153-184 | mixed | isStudentLikeHome lives here; rest role-agnostic |
| 3 teacher student-select/view | 185-524 | **clean (teacher)** | all IS_TEACHER_HOME early-returns |
| 4 last-10 cache + formatters | 525-702 | mixed | student cache (setHomeStatsLoading is student-like) + pure shared formatters |
| 5 teacher modal stats cache | 703-1011 | **clean (teacher)** | warmup/badge-set all teacher; modal-badge builders only called from teacher paths |
| 6 aggregation + home badges | 1012-1149 | mixed | aggregate (teacher) + setHome*Badge (student-like, role-agnostic DOM) |
| 7 forecast + thermometer | 1150-1300 | mixed | isStudentLikeHome-gated; thermo writes to teacher's #studentCombo too |
| 8 student last-10 lifecycle | 1301-1614 | **clean (student)** | all IS_STUDENT_PAGE early-returns |
| 9 dashboard/teacher rendering | 1615-2049 | **tangled** | applyDashboardHomeStats (student) and applyTeacherPickingHomeStats (teacher) both write the SAME accordion badges via the same setHome* helpers; recommendation* helpers teacher-only |
| 10 auth header (legacy) | 2050-2291 | mixed (mostly dead) | CURRENT_ROLE path; no-op when #appHeader present (both pages) |
| 11 boot init | 2292-2389 | **tangled** | single DOMContentLoaded interleaves IS_STUDENT_PAGE and IS_TEACHER_HOME branches + shared catalog/start wiring |
| 12 mode + smart toggles | 2390-2620 | mixed | smart* all student; initModeToggle non-student-home (DOM-gated #modeList) |
| 13 shuffle/create-hw/bulk | 2621-2811 | mixed | bulk+shuffle shared; buildHwCreatePrefill/createHwBtn/picked-refs teacher-leaning |
| 14 catalog + accordion | 2812-3097 | mixed | shared structure; isStudentLikeHome adds badge markup |
| 15 sum/count bookkeeping | 3098-3173 | mixed | shared counters; teacher tail schedules added-tasks sync; smart-mode student tail |
| 16 proto-picker modal | 3174-3543 | mixed | shell shared (CAN_PROTO_MODAL); teacher stat badges layered in |
| 17 added-tasks engine | 3544-4759 | **clean (teacher)** | entirely IS_TEACHER_HOME; embeds shared preview/pool utils that student saveSelectionAndGo also calls |
| 18 added-tasks modal badges | 4760-4991 | **clean (teacher)** | teacher-only rendering |
| 19 save-and-go + utils | 4992-5130 | mixed | shared flow with IS_TEACHER_HOME / IS_STUDENT_PAGE tails; esc/compareId pure |

## SUMMARY: student-only vs teacher-only vs shared

Estimated by line volume, using the volume-map section sizes and the gate inventory above.
Functions/sections reachable only from one role are attributed to that role; functions called from
both (or whose body is gated by isStudentLikeHome / CAN_PROTO_MODAL) are "shared".

| Bucket | Sections / functions | ~Lines | % of 5130 |
|---|---|---|---|
| **Teacher-only** | §1 (85), §3 (340), §5 (309), §17 (1216), §18 (232), plus teacher slices of §9 (~250) and §13/§16 badge code (~120) | ~2550 | **~50%** |
| **Student-only** | §8 (314), §7 student slice (~90), smart-training in §12 (~230), applyDashboardHomeStats + recs-merge slice of §9 (~120) | ~750 | **~15%** |
| **Shared** | §0, §2, §4 formatters, §6 home-badge helpers, §10 (legacy/dead), §11 boot, §14 accordion, §15 counts, §16 modal shell, §19 save/utils + all pure utils | ~1830 | **~35%** |

This aligns with the DOM-selector signal provided (of 117 selectors: 31 teacher-only, 8 student-only,
28 both, 42 dynamic) — teacher dominates dedicated surface area, student has a small dedicated slice,
a large shared core remains. Note the line-share weights teacher even more heavily than the selector
count, because the teacher added-tasks engine (§17, 1216 lines) has very few selectors but enormous logic.

## Findings most relevant to a split strategy

1. **Split-by-role is the natural primary cut.** ~50% of the file is cleanly teacher-only and ~15%
   cleanly student-only, isolated behind module-load constants (IS_TEACHER_HOME / IS_STUDENT_PAGE) with
   early-return guards — these sections (§1, §3, §5, §8, §17, §18, smart-training) lift out almost
   mechanically into `picker.teacher.js` / `picker.student.js`.

2. **The shared core (~35%) is real and must become a third module.** Pure utils (esc, compareId,
   pct, fmt*, interpolate, escapeHtml, asset, manifest/pool loaders, buildQuestionForPreview) plus the
   accordion render and count bookkeeping are called by both roles. A `picker.common.js` (or
   `picker.core.js`) is required regardless of how the role code is split.

3. **The one genuinely TANGLED seam is the home-stats rendering (§9 + setHome* badges in §6 + §7
   forecast).** `applyDashboardHomeStats` (student) and `applyTeacherPickingHomeStats` (teacher) write
   the SAME accordion badge DOM through the SAME `setHomeSectionBadge`/`setHomeTopicBadge`/forecast
   helpers, and the dynamic `isStudentLikeHome()` gate exists precisely so teacher-viewing-a-student
   reuses the student visual path. A clean role split must NOT duplicate these badge writers — keep
   them in common and have each role build only its own model.

4. **Boot (§11) is a single interleaved DOMContentLoaded handler** mixing both role init paths plus
   shared catalog load and `#start` wiring. It is the main integration point and will need an explicit
   shared entrypoint that dispatches to role init functions after `loadCatalog()`.

5. **CURRENT_ROLE / legacy auth header (§10) is effectively dead code on both real pages** (no-op when
   `#appHeader` exists, which both home pages ship). It can be dropped from the role-split entirely
   rather than placed in either module — verify no non-home page still relies on it before deleting.

6. **Caveat against split-by-feature:** features (stats, accordion, modals) cut across role boundaries
   (the proto modal shell is shared but its badges are teacher-only; the accordion is shared but its
   badges are student-like). A pure feature split would re-introduce role `if`s inside every feature
   module. Prefer role-split with a shared core; treat feature modularization as a secondary, internal
   refinement within each resulting file.
