# iOS picking latency audit

Дата: 2026-06-12. Режим: curator recon, production read-only. Продуктовый код и production не менялись.

## 1. Короткий вывод

WIOS.2 функционально работает: фильтрованный подбор считается локально от
`student_picking_snapshot_v1`, а parity с сервером подтверждён. Но пользовательская
задержка осталась, потому что iOS-конвейер после каждого изменения выбора:

1. очищает готовую подборку;
2. гарантированно ждёт 700 мс;
3. заново собирает всю подборку;
4. при первом фильтрованном выборе дополнительно ждёт snapshot RPC;
5. каждый локальный resolve заново строит индекс всего snapshot.

Поэтому новая архитектура убрала resolve-RPC из тёплого пути, но не сделала сам
`tap -> ready` сопоставимым с сайтом.

## 2. Измерения

Probe: `reports/perf/ios_picking_latency_probe.swift`, `swiftc -O`, те же
`Models/*` и `Services/*`, production Supabase/content, read-only.

| Стадия | Наблюдение |
|---|---:|
| Фиксированный iOS debounce | 700 мс всегда |
| Snapshot RPC | 1 038–2 905 мс |
| Snapshot | 196 protos, 84 topics, 694 qstats, 84 manifests |
| Локальный resolve, только построение индекса | 57–64 мс |
| Локальный resolve одного topic | 49–51 мс |
| Локальный resolve 12 sections | 108–129 мс |
| Фильтрованный topic, холодный snapshot+content | 1 145–1 322 мс |
| Фильтрованный topic, тёплый | 98–121 мс |
| Без фильтра, topic, холодный manifest | 284 мс в первом прогоне |
| Без фильтра, topic, тёплый | 0,2–0,3 мс |
| Без фильтра, 12 sections, холодный URL cache | 15 244 мс |
| Без фильтра, 12 sections, тёплый | 3–4 мс |

Это измерение сервисного слоя на Mac, не UI-профиль физического iPhone. На iPhone
11 CPU-часть может быть дороже. При этом подтверждённые 700 мс и сетевой snapshot
полностью совпадают с наблюдаемыми пользователем 1–1,5+ с.

## 3. Корневые причины

### P0. Искусственный нижний предел 700 мс

Одинаковый `Task.sleep(700_000_000)` стоит в:

- `StudentHomeView.scheduleAssemble`;
- `TeacherHomeView.scheduleAssemble`.

Он выполняется при изменении topic/section/proto count и filter. До ожидания iOS
обнуляет `assembledBase` и `assembled`, поэтому задержка всегда полностью видима.

Сайт использует 150 мс для student preview prewarm и 300 мс для teacher sync,
после чего обновляет сохранённые bucket'ы дельтой.

### P0. Snapshot не прогревается

`PickSnapshotCache.shared.snapshot(...)` вызывается только непосредственно из
student/teacher resolve. В `StudentHomeView.load()` и при `selectStudent()` учителя
prewarm отсутствует. Первый фильтрованный выбор поэтому ждёт сеть.

Сайт запускает `prewarmStudentPickingSnapshot()` параллельно boot и
`prewarmPickingSnapshot(studentId)` при выборе ученика.

### P1. Swift заново строит индекс snapshot

Каждый `PickFilteredEngine.resolveBatch` создаёт новый `SnapshotIndex`. Даже
пустой resolve тратит 57–64 мс на Mac. Top-up при дефиците запускает второй
resolve и повторяет эту работу.

JS-порт кэширует индекс на snapshot в `snapshot.__wpsIndex`.

### P1. iOS пересобирает весь набор, сайт меняет только дельту

iOS после каждого `+/-` повторно вызывает полный `StudentPickEngine.pick` или
teacher resolve, затем снова гидратирует `RunQuestion`. Сайт хранит bucket'ы,
срезает лишнее и добирает только изменение, сохраняя уже выбранные задачи.

На тёплом no-filter пути полная пересборка пока дешева, но с ростом набора,
новыми manifest и фильтрованным resolve её стоимость становится заметной.

### P1. Холодный no-filter section path загружает manifests последовательно

`ContentService.randomQuestionsInSection` делает `await manifest(for:)` в цикле
по темам. При пустом URL cache выбор всех 12 разделов занял 15,2 с. Метод
`buildQuestions(refs:)` уже умеет параллельный prefetch, но no-filter section
ветка его не использует.

### P2. Параллельные вторичные RPC

Смена student filter одновременно запускает `pickingScreenSelf`, а выбор ученика
учителем запускает picking screen и затем analytics. Они не являются прямым
блокером assemble, но могут конкурировать за сеть с холодным snapshot.

## 4. Почему WIOS.2 это пропустила

DoD WIOS.2 проверял parity, отсутствие resolve-RPC при живом snapshot,
инвалидацию cache, сборку и установку. Полный `tap -> ready` не измерялся.
Фраза отчёта про ручной smoke «подбор мгновенно» осталась операторским остатком,
а не подтверждённым evidence.

## 5. Рекомендуемая волна исправления

1. Заменить 700 мс на cancellable debounce 120–150 мс; не очищать предыдущую
   готовую подборку до готовности новой.
2. Запускать snapshot prewarm параллельно `StudentHomeView.load()` и сразу при
   `TeacherHomeView.selectStudent()`.
3. Кэшировать скомпилированный `SnapshotIndex` per-student/per-snapshot, чтобы
   повторный resolve не платил 50–65+ мс; top-up должен использовать тот же индекс.
4. Параллелизовать холодную загрузку manifests в no-filter section path и добавить
   single-flight для одного path.
5. После короткой волны оценить необходимость переноса web bucket/delta-модели в
   iOS. Это более крупное изменение, но оно даст полную архитектурную симметрию.
6. Добавить signpost/метрики стадий и performance-gate на iPhone 11.

## 6. Предлагаемый DoD

- После прогрева: `tap -> ready` p50 < 150 мс, p95 < 300 мс на iPhone 11.
- Нет фиксированного 700 мс floor.
- Первый фильтрованный tap не ждёт snapshot при штатно загруженной главной.
- Повторный локальный resolve не перестраивает индекс snapshot.
- Холодный «Выбрать все» без фильтра не выполняет последовательную цепочку
  manifest-запросов.
- Student и teacher-selected-student проходят одинаковую performance-матрицу.
