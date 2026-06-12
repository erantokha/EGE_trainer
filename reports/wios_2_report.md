# WIOS.2 — Витрина и локальный подбор в iOS · Отчёт

Дата: 2026-06-12. План: `WIOS_2_PLAN.md`. Режим: эконом (smoke, без субагентов).

## 1. Итог

Подбор с фильтром в iOS-приложении (ученик и учитель) считается локально от
снимка `student_picking_snapshot_v1` с прозрачным fallback на серверный RPC.
**DevHarness: 39 OK / 0 FAIL**, включая parity-гейт движка: **10 прогонов
(2 окна × 5 фильтров), 0 расхождений** при УПОРЯДОЧЕННОМ сравнении
последовательностей по бакетам (строже веб-критерия — iOS-ротация потребляет
массив в порядке сервера). Приложение установлено на оба iPhone
(`ru.egetrainer.ios`: iPhone 11 Мери, iPhone 15 Pro Max Яна) через devicectl,
Release-сборка.

## 2. Что сделано (по §5 плана)

| Шаг | Артефакт |
|---|---|
| §5.1 модели | `Models/PickSnapshotModels.swift` (Codable payload, гетерогенные пары `[qid, path_idx]` через unkeyedContainer) |
| §5.2 движок | `Services/PickFilteredEngine.swift` — порт по спеке `docs/navigation/picking_resolve_semantics_spec.md`; md5 = `CryptoKit Insecure.MD5` (без вендоринга); таймстемпы сравниваются как ISO-строки; порядок массива = серверный `(request_order, section, topic, pick_rank, qid)` |
| §5.3 кеш | `Services/PickSnapshotCache.swift` — actor, per-student, TTL 60с (stale-while-revalidate), негативный кеш 5 мин, single-flight; **инвалидация после `writeTrainingAttempt` и `submitAttempt`** (в отличие от веб-MPA попытки решаются в том же процессе) |
| §5.4 интеграция | `StudentPickEngine.resolveLocalFirst` (оба батча: основной + top-up); `TeacherService.resolveRequestsLocalFirst` + `resolvePickedWithTopUp`/`resolveBatch`; **единый явный seed** (раньше teacher-путь слал nil — server-derived; веб-готча WPS_SEED_REQUIRED закрыта by design) |
| §5.5 parity | Секция в `DevHarness/main.swift`; прогон против прода: 39 OK / 0 FAIL |
| §5.6 установка | `xcodebuild Release -allowProvisioningUpdates` + `devicectl device install app` → оба устройства, подтверждено `device info apps` |

## 3. Отклонения / находки

1. **DevHarness не собирался с актуальным `StudentPickEngine.swift`** (тянет
   `ProtoPick` из UI-файла `Screens/Shared/ProtoPickerSheet.swift`) — glob из
   README устарел ещё до WIOS.2. Harness собран без этого файла (он
   UI-only, движок проверяется отдельно). Follow-up: вынести `ProtoPick` в
   Models или зафиксировать новый glob в README.
2. `extension ResolvedQuestion { init }` не понадобился — memberwise-init уже
   есть в `TeacherModels.swift:350`.
3. Сервер не менялся вообще (гейт self-or-teacher снимка покрывает оба пути).

## 4. Эффект

- Ученик: фильтр-подбор и top-up — 0 RPC при живом снимке (раньше 1–2 RPC
  ≈ 1–2 с на клик); снимок ~30 КБ gzip, 1 раз + после каждой записи попытки.
- Учитель: подбор по выбранному ученику — 0 RPC после первого снимка ученика.
- Fallback: нет снимка / движок упал / source≠all → прежний серверный путь.

## 5. Остаток оператора

- Live-smoke на телефонах: фильтр → подбор (мгновенно), решить задачу →
  подбор обновился (инвалидация), приложение в авиарежиме после прогрева —
  подбор работает.
- ios/ не закоммичен (как и весь трек WIOS) — коммит/пуш по вашему решению.
- Follow-up кандидаты: бейджи прототипов iOS от снимка (`ProtoStatsCache`),
  Android-порт (зеркальная волна WAND.5), `ProtoPick` → Models.
