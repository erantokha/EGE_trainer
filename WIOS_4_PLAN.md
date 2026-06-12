# WIOS.4 PLAN — мгновенный аккордеон в iOS

Дата: 2026-06-12. Основание:
`reports/ios_accordion_latency_audit_2026-06-12.md`.

## 1. Цель

Убрать блокирующий лоадер аккордеона на главной ученика и при выборе ученика
учителем, сохранив актуальные статистику, бейджи, прогноз и семантику фильтров.

## 2. Подтверждённая причина

- Ученик скрывает уже готовый каталожный аккордеон до завершения
  `student_analytics_screen_v1`.
- Учитель последовательно ждёт `teacher_picking_screen_v2`, затем
  `student_analytics_screen_v1`, и только после этого показывает аккордеон.
- При возврате `A -> B -> A` нет кеша screen payload, оба RPC повторяются.
- Snapshot быстрого подбора не является источником аккордеона.

## 3. Scope

1. Ученик: показывать аккордеон сразу после загрузки каталога; статистику
   применять асинхронно.
2. Учитель: запускать picking-screen и analytics параллельно; показывать
   каталожный аккордеон сразу, затем без блокировки подменять его enriched
   picking-screen.
3. Учитель: добавить per-student/per-filter stale-while-revalidate кеш
   picking-screen и per-student кеш analytics с TTL и single-flight.
4. Защитить экран учителя от гонок при быстром переключении учеников.
5. Добавить read-only проверки кеша и повторить production latency probe.

## 4. Out of scope

- SQL/RPC и изменение backend-контрактов;
- объединение snapshot/picking/analytics в один payload;
- UI-рестайлинг;
- изменение алгоритма подбора задач;
- App Store/TestFlight.

## 5. Затрагиваемые файлы

- `ios/EGETrainerApp/EGETrainerApp/Screens/Student/StudentHomeView.swift`
- `ios/EGETrainerApp/EGETrainerApp/Screens/Teacher/TeacherHomeView.swift`
- `ios/EGETrainerApp/EGETrainerApp/Services/AccordionScreenCache.swift`
- `ios/EGETrainerApp/EGETrainerApp/Services/StudentService.swift`
- `ios/EGETrainerApp/EGETrainerApp/Services/HomeworkService.swift`
- `reports/perf/ios_accordion_cache_probe.swift`
- `reports/wios_4_report.md`

## 6. Реализация

1. Создать actor `AccordionScreenCache`:
   - ключ picking = `studentId + filterId`;
   - ключ analytics = `studentId`;
   - TTL 60 секунд, stale-while-revalidate;
   - single-flight для одинаковых запросов;
   - явная инвалидация.
2. Student home:
   - снять `isLoading` сразу после `sectionsWithTopics()`;
   - аналитику загрузить отдельной задачей;
   - применять результат только если экран ещё жив.
3. Teacher home:
   - при выборе ученика немедленно отдать кешированный picking;
   - analytics не управляет лоадером аккордеона;
   - cold picking и analytics стартуют одновременно;
   - применить результат только если выбран тот же ученик и фильтр;
   - тихий filter refresh переиспользует cache actor.
4. Добавить probe кеша:
   - первый fetch вызывает loader;
   - повторный fetch отдаётся из кеша без loader;
   - разные ученики/фильтры не смешиваются;
   - invalidate вызывает новый fetch.

## 7. DoD

- Student accordion видим после каталога, независимо от analytics latency.
- Teacher accordion видим сразу из каталога, независимо от RPC latency.
- Возврат `A -> B -> A` отдаёт A из кеша без повторного blocking loader.
- Быстрое переключение учеников не применяет запоздалый payload другого ученика.
- iOS Debug и Release arm64 сборки зелёные.
- Cache probe, production latency probe, governance и `git diff --check` зелёные.
- Изменения закоммичены и запушены в GitHub.
