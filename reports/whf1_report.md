# WHF1 — авто-редирект анонима на странице ДЗ — отчёт

## 1. Резюме

Закрыт pre-existing UX-gap: анонимный пользователь, открывший `tasks/hw.html?token=<token>`
без сессии, упирался в технический экран `load_catalog / AUTH_REQUIRED` (каталог намеренно
session-only). Теперь student-flow на `hw.html` делает ранний auth-gate — при отсутствии
сессии `location.replace` на `tasks/auth.html?next=<original>`, ровно как `trainer.html?session=`
/ `list.html?session=` после WS.1. Паттерн перенесён 1-в-1 из `tasks/trainer.js:bootSessionMode`.
Teacher-report flow (`?as_teacher=1&attempt_id=`) и залогиненный студент не затронуты.

- Билд: **2026-05-25-1** (был 2026-05-19-24).
- Изменения логики: только `tasks/hw.js` (один блок auth-gate + `async`-обработчик).
- Коммит: не создавался (волна оставлена в рабочем дереве для приёмки куратором).

## 2. DoD trace (§8)

| # | Критерий | Статус | Доказательство |
|---|----------|--------|----------------|
| 1 | Анон → `auth.html?next=<encoded original>`, без AUTH_REQUIRED | ✅ | e2e A1 (passed); smoke (1): `auth.html?next=http%3A%2F%2F...%2Fhw.html%3Ftoken%3Dwhf1_smoke_probe`; скрин `reports/whf1_smoke/1-anon-redirect.png` (страница «Авторизация», не diag-экран) |
| 2 | Залогиненный студент видит ДЗ, без лишнего редиректа | ✅ | e2e A2 (passed); smoke (2): остаётся на `hw.html?token=...`; скрин `reports/whf1_smoke/2-authed-stays.png` |
| 3 | Teacher-report flow не задет («Войдите, чтобы открыть отчёт», без редиректа) | ✅ | smoke (3): URL остался `hw.html?...&as_teacher=1&attempt_id=...`, `#hwGateMsg="Войдите, чтобы открыть отчёт."`; скрин `reports/whf1_smoke/3-teacher-report-noredirect.png` |
| 4 | `getSession` timeout (1500 мс) не вешает страницу | ✅ | `getSession({ timeoutMs: 1500 })` (`supabase.js:217` гонит внутренний `__timeout`-race, `supabase.js:162`), плюс `.catch(() => null)` → на таймауте идём по null-ветке (редирект). Никакого бесконечного await |
| 5 | `bump_build.mjs` прогнан, build id синхронен | ✅ | `tasks/hw.html` meta `app-build=2026-05-25-1`; `version.json={"build":"2026-05-25-1"}`; импорты `tasks/hw.js` → `?v=2026-05-25-1` (см. §9.5 ниже) |
| 6 | Governance зелёные (4 скрипта) | ✅ | см. §3 ниже — все 4 OK |
| 7 | `git diff --stat` узкий: hw.js, hw.html + bump-набор | ✅ | 69 tracked файлов = только version-bump'ы, логика только в `hw.js`; новые файлы — e2e spec + reports (ожидаемо по плану) |
| 8 | `reports/whf1_report.md` создан | ✅ | этот файл |
| 9 | `ws1-session-link.spec.js` остался зелёным | ✅ | A1/A2/A3 passed (см. §4) |

## 3. Governance (§9.1)

```
$ node tools/check_runtime_rpc_registry.mjs
runtime-rpc registry ok
rows=32 standalone_sql=32 snapshot_only=0 missing_in_repo=0 exceptions=6

$ node tools/check_runtime_catalog_reads.mjs
runtime catalog read checks ok
task_js_files=40 critical_files=7

$ node tools/check_no_eval.mjs
no eval/new Function ok

$ node tools/check_trainer_css_layers.mjs
trainer.css layers ok
layers=6 print-scope=3504..3930
```

## 4. E2E прогон (§9.2 / §9.3)

Новый spec: `e2e/student/whf1-hw-anon-redirect.spec.js`
- **A1** (anon → redirect): пустой `storageState`, `hw.html?token=whf1_anon_gate_probe` →
  `auth.html?...next=`, декодированный `next` содержит `hw.html?token=whf1_anon_gate_probe`.
- **A2** (authed → ДЗ): authed `student`-project, `hw.html?token=...` → НЕ уходит на `auth.html`
  (поддерживает реальный токен через `E2E_HW_TOKEN`, иначе маркер-токен; ключевой инвариант —
  отсутствие редиректа — от валидности токена не зависит).

Регрессия общего auth-механизма (`ws1-session-link.spec.js`) — без изменений.

```
✓ [setup-student] › create student storage state (5.3s)
✓ [student] › whf1-hw-anon-redirect.spec.js › E2E.A1: анон ... → redirect на auth.html?next=... (721ms)
✓ [student] › whf1-hw-anon-redirect.spec.js › E2E.A2: залогиненный ... → НЕ редиректит на auth (694ms)
✓ [student] › ws1-session-link.spec.js › E2E.A1: создание session-ссылки + hydration (12.9s)
✓ [student] › ws1-session-link.spec.js › E2E.A2: открытие ?session=<token> без auth → redirect (706ms)
✓ [student] › ws1-session-link.spec.js › E2E.A3: открытие ?session=<invalid_token> → ошибка (2.5s)
6 passed (23.6s)
```

## 5. Diff stats (§9 / DoD §8.7)

```
69 files changed, 267 insertions(+), 255 deletions(-)
```
- **Логика**: только `tasks/hw.js` — `DOMContentLoaded` → `async`, и блок auth-gate (см. §6).
- **Остальные 68 файлов**: исключительно `?v=2026-05-19-24 → 2026-05-19-... → 2026-05-25-1`
  bump'ы от `tools/bump_build.mjs` (`app/build.js`, `version.json`, `tasks/hw.html` meta,
  синхронные `?v=` в `app/**` и `tasks/**`). Никаких сюрпризов.
- **Новые файлы (untracked, ожидаемо по плану)**:
  `e2e/student/whf1-hw-anon-redirect.spec.js`, `reports/whf1_report.md`,
  `reports/whf1_smoke/{smoke.cjs,1-anon-redirect.png,2-authed-stays.png,3-teacher-report-noredirect.png}`.

### Логический diff `tasks/hw.js`

```diff
-document.addEventListener('DOMContentLoaded', () => {
+document.addEventListener('DOMContentLoaded', async () => {
   ...
   if (!token) { ... return; }
+
+  // Auth-gate (student-flow): без сессии — redirect на auth.html?next=<current_url>,
+  // чтобы анонимный пользователь не упирался в AUTH_REQUIRED при загрузке каталога
+  // (каталог намеренно session-only). Паттерн идентичен trainer.js:bootSessionMode (WS.1).
+  // Сюда мы попадаем уже ПОСЛЕ teacher-report (return выше) и проверки token —
+  // teacher-report flow гейт не задевает.
+  const session = await getSession({ timeoutMs: 1500 }).catch(() => null);
+  if (!session) {
+    const next = encodeURIComponent(location.href);
+    location.replace(new URL('./auth.html?next=' + next, location.href).toString());
+    return;
+  }
+
   hideDiagUI();
```

Порядок проверок (§5.3): `if (teacherAttemptId) {...return}` → `if (!token) {...return}` →
**auth-gate** → IIFE c `getHomeworkByToken`. Teacher-report выходит до гейта.

## 6. Ручной smoke (§9.4)

Локальный сервер `python3 -m http.server 8000`, автоматизировано через Playwright для
воспроизводимости (`reports/whf1_smoke/smoke.cjs`):

```
1 anon→redirect: http://127.0.0.1:8000/tasks/auth.html?next=http%3A%2F%2F127.0.0.1%3A8000%2Ftasks%2Fhw.html%3Ftoken%3Dwhf1_smoke_probe
2 authed→stays: http://127.0.0.1:8000/tasks/hw.html?token=whf1_smoke_probe
3 teacher-report→noredirect: http://127.0.0.1:8000/tasks/hw.html?token=whf1_smoke_probe&as_teacher=1&attempt_id=whf1_dummy_attempt | msg="Войдите, чтобы открыть отчёт."
```

Скриншоты:
- `reports/whf1_smoke/1-anon-redirect.png` — страница «Авторизация» (редирект сработал, diag-экрана нет).
- `reports/whf1_smoke/2-authed-stays.png` — остались на `hw.html`.
- `reports/whf1_smoke/3-teacher-report-noredirect.png` — `hw.html` + «Войдите, чтобы открыть отчёт.», редиректа нет.

Подтверждено: `next=` сохраняет `?token=` без потерь (никакого `cleanOauthParams`,
используется «сырой» `location.href`), `auth.js:sanitizeNext` принимает same-origin URL с query.

## 7. Cache-busting (§9.5)

```
tasks/hw.html  → <meta name="app-build" content="2026-05-25-1">
version.json   → {"build":"2026-05-25-1"}
tasks/hw.js    → import ... '../app/providers/supabase.js?v=2026-05-25-1'  (все ?v= = 2026-05-25-1)
```
Один и тот же build id во всех трёх местах.

## 8. Открытые follow-up

- **WHF2 — диагностика и фикс зависания `auth.html` на login с `next=hw.html`.** Сначала
  research (HAR с iPhone Telegram WebView + desktop cold Chrome + проверка стабильности
  `api.ege-trainer.ru/__proxy_health`), затем отдельный план волны — там попадаем в red-zone
  `tasks/auth.js`. Эту волну НЕ трогали (§3 out of scope).
