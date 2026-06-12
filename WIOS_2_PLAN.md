# WIOS_2_PLAN — Витрина и локальный подбор в iOS (эконом-режим)

Дата: 2026-06-12. Поручение оператора: перенести WPS-механику в iOS и по
завершении обновить приложение на обоих iPhone. Эконом-режим (smoke, без
Fable-субагентов).

## 1. Цель
Подбор с фильтром в iOS-приложении (ученик и учитель) считается локально от
снимка `student_picking_snapshot_v1` (RPC уже на проде) с fallback на серверный
resolve; приложение обновлено на обоих iPhone оператора.

## 2. Контекст
- iOS зовёт resolve в **default-окне** (`p_complete` не шлёт) + top-up без
  фильтра (`StudentPickEngine.pickFiltered`, `TeacherService.resolvePickedWithTopUp`,
  `resolveBatch`); seed всегда явный (random) — веб-готча WPS_SEED_REQUIRED не
  воспроизводится.
- Эталон порта — спека `docs/navigation/picking_resolve_semantics_spec.md` +
  JS-движок `app/core/pick_filtered.js` (parity 31/0, включая default-окно).
- iOS потребляет МАССИВ payload'а в порядке сервера (клиентская ротация без
  пересортировки) → движок обязан повторить и порядок массива
  (request_order, section_id, topic_id, pick_rank, question_id).
- ВАЖНОЕ отличие от веба (MPA): попытки решаются В ТОМ ЖЕ процессе →
  обязательная инвалидация кеша снимка после записи попытки/сдачи ДЗ.
- Xcode-проект на FileSystemSynchronized-группах — новые файлы без правки
  pbxproj. DevHarness собирается `swiftc Models/*.swift Services/*.swift
  DevHarness/main.swift` и гоняется против прода (креды из env).

## 3. Out of scope
Android (отдельная волна по запросу); бейджи прототипов iOS на снимок
(ProtoStatsCache остаётся на RPC — отдельный хвост); изменение серверных RPC;
веб-код; UI-изменения; публикация в App Store/TestFlight.

## 4. Затрагиваемые файлы (все в ios/EGETrainerApp/EGETrainerApp/)
Новые: `Models/PickSnapshotModels.swift`, `Services/PickFilteredEngine.swift`,
`Services/PickSnapshotCache.swift`.
Изменяемые: `Services/StudentPickEngine.swift` (фильтр-ветка → локально+fallback),
`Services/TeacherService.swift` (`resolvePickedWithTopUp`, `resolveBatch` →
локально+fallback), `Services/StudentService.swift` (+invalidate после
writeTrainingAttempt), `Services/HomeworkService.swift` (+invalidate после
submitAttempt), `DevHarness/main.swift` (+parity-секция).
Отчёт: `reports/wios_2_report.md`. Установка: devicectl на оба iPhone.

## 5. Шаги
§5.1 модели снимка → §5.2 движок (порт по спеке, md5=CryptoKit) →
§5.3 кеш+инвалидация → §5.4 интеграция student/teacher → §5.5 DevHarness-parity
(матрица 2 окна × 5 фильтров × 2 seed, сравнение УПОРЯДОЧЕННЫХ списков по
бакетам) → §5.6 сборка+установка на оба iPhone → §5.7 отчёт.
Task-tracking: TaskCreate по §5.1–§5.7.

## 6. Данные/контракты
Серверных изменений нет. Снимок — тот же RPC, гейт self-or-teacher покрывает
оба пути.

## 7. Риски / stop-ask
Каркас autonomy WPS действует (триггеры 1–9). Доп.: (a) parity DevHarness не
сходится из-за невоспроизводимой сортировки → стоп с разбором; (b) сборка на
устройство падает по подписи/провижену → стоп (нужны действия оператора в
Xcode); (c) расхождение порядка массива (collation) → стоп, варианты.

## 8. DoD
1) DevHarness: parity-матрица = 0 расхождений, прежние проверки не сломаны.
2) Подбор с фильтром (ученик и учитель) в приложении не зовёт resolve-RPC при
   живом снимке; fallback работает (выключатель/негативный кеш).
3) Кеш инвалидируется после попытки тренировки и сдачи ДЗ.
4) Приложение установлено на оба iPhone (devicectl, билд с WIOS.2).
5) Отчёт `reports/wios_2_report.md`.

## 9. Проверка
Сборка DevHarness + прогон против прода (read-only); xcodebuild на device +
`xcrun devicectl device install app` на оба идентификатора; ручной smoke
оператора на телефоне.

## 10. Артефакт
`reports/wios_2_report.md`.
