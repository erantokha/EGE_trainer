# iOS accordion latency audit — 2026-06-12

## Scope

Read-only audit of the delayed accordion on:

- student home;
- teacher home after selecting a student;
- repeated teacher switches `A -> B -> A`.

No production behavior was changed. Measurements use the production RPC
contracts through the same Swift services as the app.

## Confirmed root cause

The fast `student_picking_snapshot_v1` snapshot is not the data source of the
accordion.

- Student accordion: local catalog + `student_analytics_screen_v1`.
- Teacher accordion: `teacher_picking_screen_v2`.
- Local filtered picking: `student_picking_snapshot_v1`.

The iOS screens therefore still wait for separate server payloads after the
snapshot optimization.

### Student

`StudentHomeView.load()` loads the catalog, then awaits
`student_analytics_screen_v1`, and only afterwards sets `isLoading = false`.
The UI displays the spinner instead of the already available catalog accordion
while analytics is loading.

The code comment that analytics does not block the catalog is contradicted by
the actual state transition.

### Teacher

Every call to `selectStudent`:

1. clears `picking`;
2. starts snapshot prewarm, which the accordion does not consume;
3. awaits `teacher_picking_screen_v2`;
4. then awaits `student_analytics_screen_v1`;
5. only then sets `isLoadingScreen = false`.

The accordion is already ready after step 3, but remains hidden until step 4
finishes. There is no per-student cache for either `PickingScreen` or analytics,
so returning to a previously opened student repeats both RPCs.

## Measurements

Probe: `reports/perf/ios_accordion_latency_probe.swift`

Representative production runs:

| Path | Time |
| --- | ---: |
| Student catalog, warm | 0.3 ms |
| Student analytics | 700-1,405 ms |
| Student current visible path | 1,023-1,199 ms |
| Teacher A picking screen, accordion data ready | 593-717 ms |
| Teacher A analytics, still blocking spinner | 526-619 ms |
| Teacher A current visible path | 1,119-1,308 ms |
| Teacher B current visible path | 1,433-1,542 ms |
| Teacher A after returning from B | 1,227-1,292 ms |

Payload/CPU checks:

| Check | Result |
| --- | ---: |
| Student analytics payload | 52,346 bytes |
| Student analytics JSON decode | 2.8 ms |
| Teacher picking payload | 67,737 bytes |
| Teacher picking JSON decode | 2.8 ms |
| Forecast calculation | below displayed 0.1 ms precision |

Conclusion: JSON decoding, forecast calculation, and accordion construction do
not explain a 1.5-2 second spinner. Server/network waits plus UI gating do.

## Recommended fix order

1. Student: reveal the catalog accordion immediately after the catalog is
   available; load analytics and enrich badges/forecast asynchronously.
2. Teacher: reveal the accordion immediately when `pickingScreen` returns;
   analytics must not control `isLoadingScreen`.
3. Teacher: load picking screen and analytics concurrently.
4. Add per-student stale-while-revalidate cache for `PickingScreen` and
   analytics, with invalidation after attempts/homework writes. Then `A -> B ->
   A` can render A immediately and refresh it in the background.
5. Later architectural option: consolidate overlapping snapshot/picking/analytics
   payloads. This is not required for the immediate UX fix.

## Verification

- Production latency probe compiled and completed successfully.
- `xcodebuild` Debug build for generic iOS succeeded.
- `check_runtime_rpc_registry.mjs` passed.
- `check_runtime_catalog_reads.mjs` passed.
- `check_no_eval.mjs` passed.
