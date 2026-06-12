# WIOS.3 — ускорение подбора задач в iOS · отчёт

Дата: 2026-06-12. План: `WIOS_3_PLAN.md`.

## Итог

Подтверждённые причины задержки устранены без изменения SQL/RPC и семантики
подбора. Тёплый filtered-topic service path ускорен примерно со 100–120 мс до
4,1 мс; поверх него UI debounce снижен с 700 до 150 мс.

## Что изменено

- Student/teacher assemble: debounce 700 → 150 мс.
- Готовая предыдущая подборка остаётся видимой при пересборке; preview/start/HW
  заблокированы, пока новый набор не готов.
- Snapshot прогревается при загрузке student home и выборе ученика учителем.
- `PickFilteredEngine` хранит до 8 индексов snapshot: повторный resolve и
  переключение между учениками не перестраивают индекс.
- `ContentService` дедуплицирует одновременную загрузку одного manifest.
- Section manifests загружаются параллельно.
- DevHarness снова собирается канонической командой благодаря CLI-only
  `DevHarness/ProtoPick.swift`.
- Добавлен read-only latency probe с автоматическими performance-гейтами.

## Измерения

| Метрика | До | После |
|---|---:|---:|
| UI debounce | 700 мс | 150 мс |
| Повторное построение snapshot index | 57–64 мс | 0–0,1 мс |
| Cached local resolve, один topic | ~49–51 мс | 1,9 мс |
| Warm filtered topic | ~98–121 мс | 4,1 мс |
| No-filter 12 sections, текущий HTTP cache | 123–135 мс | 68–94 мс |

Snapshot RPC по-прежнему занимает примерно 1–3 с, но теперь запускается заранее,
а не первым фильтрованным нажатием.

## Проверки

- Latency probe: PASS
  - cached local resolve one topic: `1,9 мс < 20 мс`;
  - warm filtered topic: `4,1 мс < 50 мс`.
- DevHarness production read-only: `39 OK / 0 FAIL`.
- PickFilteredEngine parity: `10 прогонов / 0 расхождений`.
- `xcodebuild` Release, iPhone Simulator: BUILD SUCCEEDED.
- `xcodebuild` Release, generic iPhoneOS arm64: BUILD SUCCEEDED.
- Simulator install + launch: `ru.egetrainer.ios` успешно запущен.
- Governance:
  - runtime RPC registry: OK;
  - runtime catalog reads: OK;
  - no eval/new Function: OK.
- `git diff --check`: OK.
- В iOS-коде больше нет `700_000_000`.

## Остаточный риск

Фактический `tap -> ready` на физическом iPhone 11 не измерялся автоматизированным
UI-тестом: проект пока не содержит UI-test target/signpost-инструментации.
Release arm64 собирается; сервисные performance-гейты и live parity зелёные.
