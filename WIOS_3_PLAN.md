# WIOS.3 PLAN — ускорение подбора задач в iOS

Дата: 2026-06-12. Основание: `reports/ios_picking_latency_audit_2026-06-12.md`.

## 1. Цель

Довести скорость подготовки подборки на главной ученика и в teacher-selected-student
до сопоставимой с сайтом, сохранив текущую семантику WIOS.2 и RPC-fallback.

## 2. Scope

1. Снять фиксированный 700 мс latency floor и не скрывать предыдущую готовую
   подборку во время пересборки.
2. Прогревать snapshot ученика до первого фильтрованного выбора.
3. Переиспользовать индекс snapshot между локальными resolve.
4. Параллелизовать холодную загрузку manifests для section-подбора и дедуплицировать
   одновременную загрузку одного manifest.
5. Расширить read-only latency probe и прогнать regression/parity/build проверки.

## 3. Out of scope

- SQL/RPC и серверные контракты;
- изменение алгоритма и порядка выбранных задач;
- полный перенос web bucket/delta-механики;
- публикация в App Store/TestFlight;
- UI-рестайлинг.

## 4. Затрагиваемые файлы

- `ios/EGETrainerApp/EGETrainerApp/Screens/Student/StudentHomeView.swift`
- `ios/EGETrainerApp/EGETrainerApp/Screens/Teacher/TeacherHomeView.swift`
- `ios/EGETrainerApp/EGETrainerApp/Services/PickSnapshotCache.swift`
- `ios/EGETrainerApp/EGETrainerApp/Services/PickFilteredEngine.swift`
- `ios/EGETrainerApp/EGETrainerApp/Services/ContentService.swift`
- `reports/perf/ios_picking_latency_probe.swift`
- `reports/wios_3_report.md`

## 5. Шаги

1. Debounce/prewarm.
2. Snapshot-index cache.
3. Manifest single-flight и параллельный section prefetch.
4. Performance probe и parity regression.
5. Release-сборка, итоговый отчёт.

## 6. DoD

- В коде student/teacher assemble нет фиксированного ожидания 700 мс.
- Snapshot prewarm запускается при загрузке student home и выборе ученика учителем.
- Повторный локальный resolve не перестраивает SnapshotIndex.
- Холодная загрузка manifests section-пути выполняется параллельно.
- DevHarness parity зелёный.
- `swiftc -O` latency probe зелёный; тёплый filtered topic service latency < 50 мс.
- Release-сборка iOS зелёная.
