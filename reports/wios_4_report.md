# WIOS.4 — мгновенный аккордеон в iOS · отчёт

Дата: 2026-06-12. План: `WIOS_4_PLAN.md`.

## Итог

Устранено блокирующее ожидание статистики перед показом аккордеона:

- ученик видит каталожный аккордеон сразу после загрузки локального каталога;
- учитель видит каталожный аккордеон сразу после выбора ученика;
- enriched picking-screen и analytics загружаются параллельно и применяются
  без скрытия аккордеона;
- возврат к ранее выбранному ученику использует per-student/per-filter кеш.

## Что изменено

- `StudentHomeView`: `isLoading` снимается после каталога, analytics применяется
  отдельной фоновой задачей.
- `TeacherHomeView`:
  - каталожный fallback вместо блокирующего полноэкранного лоадера;
  - picking-screen и analytics стартуют параллельно;
  - analytics больше не управляет видимостью аккордеона;
  - защита от запоздалых ответов при быстром переключении ученика/фильтра;
  - кешированный picking применяется до сетевого ожидания.
- `AccordionScreenCache`:
  - ключ picking = student + filter;
  - ключ analytics = student;
  - TTL 60 секунд;
  - single-flight одинаковых запросов;
  - инвалидация после попытки тренировки и сдачи ДЗ.

## Измерения

Live production probe:

| Путь | До | После |
| --- | ---: | ---: |
| Ученик: видимость аккордеона | analytics, 0,7–1,9 с | каталог, 0,3–3,5 мс |
| Учитель: первый выбор | spinner 1,1–1,5 с | каталог сразу, enriched ~0,6–0,75 с |
| Учитель: возврат `A -> B -> A` | 1,2–1,3 с | 0,1 мс |

## Проверки

- Accordion cache probe: 9 PASS / 0 FAIL.
- Production accordion latency probe: `A return cached-path load = 0,1 мс`.
- iOS picking latency gates:
  - cached local resolve one topic: `1,7 мс < 20 мс`;
  - warm filtered topic: `3,3 мс < 50 мс`.
- DevHarness production read-only: `39 OK / 0 FAIL`.
- PickFilteredEngine parity: `10 прогонов / 0 расхождений`.
- `xcodebuild` Debug, generic iPhoneOS arm64: BUILD SUCCEEDED.
- `xcodebuild` Release, generic iPhoneOS arm64: BUILD SUCCEEDED.
- Governance:
  - runtime RPC registry: OK;
  - runtime catalog reads: OK;
  - no eval/new Function: OK.
- `git diff --check`: OK.

## Остаточный риск

Физическое устройство не измерялось автоматизированным signpost/UI-test:
проект не содержит UI-test target. Live RPC, кеш, сборки и service parity
проверены; финальная UX-проверка остаётся за оператором на iPhone.
