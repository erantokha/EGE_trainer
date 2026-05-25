# WHF2-fix-1 — снос мёртвой email-проверки + защита сабмита до готовности — отчёт

## 1. Резюме

Закрыты пункты **B** и **F** из `reports/whf2_diagnostic_report.md §7`, оба в `tasks/auth.js`,
оба тестируемы без iOS:

- **B**: `safeEmailExists` гутнута до `return null` без сетевого вызова. RPC `auth_email_exists`
  в проде отдавал `401 permission denied (42501)` всем (anon без EXECUTE) → pre-check всегда был
  null, добавлял ~1.2с к каждому логину, шумел в console и был prime-suspect зависания supabase-js.
- **F**: submit-кнопки логина/регистрации/сброса (`#loginSubmit`/`#signupSubmit`/`#resetSubmit`)
  блокируются (`disabled`) синхронно ещё до `await loadDeps()`, плюс ранний `preventDefault`-guard
  на формах + «Загрузка...» в статусе; снятие — в `markAuthReady()`. Это устраняет тихий нативный
  GET-сабмит при клике «Войти» до готовности страницы (воспроизведено в WHF2 §3).

Билд: **2026-05-25-2**. Smoke-наблюдение latency: после фикса «клик submit → navigation» ≈ **1.32с**
(в WHF2-baseline тот же путь включал лишний `auth_email_exists` round-trip ~1.2с, теперь его нет).
Коммит: не создавался (оставлено для приёмки куратором; WHF1 тоже ещё не закоммичен — см. §3).

## 2. DoD trace (§8)

| # | Критерий | Статус | Доказательство |
|---|----------|--------|----------------|
| 1 | B confirmed: в логине нет `POST /rpc/auth_email_exists` | ✅ | e2e `B.no-precheck` passed; smoke (2): `auth_email_exists calls=0` |
| 2 | B latency win (~1–1.3с) | ✅ | smoke (2): submit→nav **1.32с**; устранён precheck round-trip ~1.2с (WHF2 §3) |
| 3 | F: ранний submit не делает нативный GET-сабмит | ✅ | e2e `F.early-click-noop-guard` passed (URL без query-params, остаётся на auth.html) |
| 4 | F: 3 кнопки disabled до ready, enabled после | ✅ | e2e `F.disabled-during-load` passed; smoke (1): `#loginSubmit disabled=true` |
| 5 | Регресс zero (whf1 + ws1) | ✅ | `6 passed` (whf1 A1/A2 + ws1 A1/A2/A3) |
| 6 | Ручной smoke (скрины) | ✅ | `1-pre-ready-disabled.png` (disabled + «Загрузка...»), `2-no-precheck-on-login.png` |
| 7 | bump_build прогнан, build синхронен | ✅ | `tasks/auth.html` meta + `auth.js?v=` + `version.json` = `2026-05-25-2` (§9.5) |
| 8 | Governance зелёные (4) | ✅ | rpc_registry / catalog_reads / no_eval / css_layers — все OK |
| 9 | git diff узкий: логика только в auth.js | ✅ | см. §3 (логика B+F только в `tasks/auth.js`; остальное — bump) |
| 10 | reports/whf2_fix_1_report.md создан | ✅ | этот файл |
| 11 | (stretch) F при медленной jsdelivr | ✅ | e2e F-тесты используют `route` delay 4с (детерминированное окно до ready) |

## 3. Diff stats

```
72 files changed, 385 insertions(+), 267 deletions(-)
```
- **Логика волны — только `tasks/auth.js`** (блоки B и F, см. §4).
- Остальное — мехбамп `tools/bump_build.mjs` (`?v=` → `2026-05-25-2`, `version.json`, `app/build.js`,
  meta в `tasks/auth.html`).
- **Новые файлы (untracked)**: `e2e/student/whf2-fix-1-auth-guards.spec.js`,
  `reports/whf2_fix_1_report.md`, `reports/whf2_fix_1_smoke/{smoke.cjs,*.png}`.

> ⚠️ В рабочем дереве также присутствуют **ещё-не-закоммиченные правки WHF1** (`tasks/hw.js`,
> bump-набор) и операторские правки `GLOBAL_PLAN.md`/`PROJECT_STATUS.md`/`WHF2_PLAN.md`/
> `reports/whf2_*`. Поэтому `git diff --stat` шире, чем правки одной этой волны. Логика
> WHF2-fix-1 — строго `tasks/auth.js`. Порядок коммитов (WHF1 → WHF2 research → WHF2-fix-1) —
> на усмотрение куратора.

## 4. Логический diff `tasks/auth.js`

### B — гут `safeEmailExists`
```diff
-async function safeEmailExists(email) {
-  try {
-    const res = await authEmailExists(email);
-    if (typeof res === 'boolean') return res;
-    return null;
-  } catch (e) {
-    console.warn('authEmailExists check failed:', e);
-    return null;
-  }
+async function safeEmailExists(/* email */) {
+  // WHF2-fix-1 (B): RPC auth_email_exists отдаёт 401 (42501) всем (anon без EXECUTE) →
+  // pre-check в проде ВСЕГДА null. Гутаем тело без сетевого вызова. См. whf2 §6.B.
+  return null;
 }
```
Call-site'ы (`:284` login, signup, reset) при `null` уже корректны — `authEmailExists` export в
`supabase.js` и import-обёртка в `auth.js` оставлены orphan'ами (out of scope §3).

### F — ранняя защита сабмита (+ снятие в markAuthReady, + вызов в DOMContentLoaded)
```diff
+const AUTH_SUBMIT_BTN_IDS = ['loginSubmit', 'signupSubmit', 'resetSubmit'];
+const AUTH_LOADING_MSG = 'Загрузка...';
+
+function lockAuthSubmitsUntilReady() {
+  for (const id of AUTH_SUBMIT_BTN_IDS) { const btn = document.getElementById(id); if (btn) btn.disabled = true; }
+  for (const fid of ['loginForm','signupForm','resetForm']) {
+    const form = document.getElementById(fid);
+    if (form) form.addEventListener('submit', (e) => e.preventDefault());
+  }
+  const st = document.getElementById('loginStatus');
+  if (st && !st.textContent) setStatus(st, AUTH_LOADING_MSG, false);
+}
+
 function markAuthReady() {
   try { document.body?.setAttribute('data-auth-ready', '1'); } catch (_) {}
+  for (const id of AUTH_SUBMIT_BTN_IDS) { const btn = document.getElementById(id); if (btn) btn.disabled = false; }
+  const st = document.getElementById('loginStatus');
+  if (st && st.textContent === AUTH_LOADING_MSG) setStatus(st, '', false);
 }
 ...
 document.addEventListener('DOMContentLoaded', async () => {
+  // WHF2-fix-1 (F): синхронно, ДО async loadDeps — заблокировать сабмит до готовности.
+  lockAuthSubmitsUntilReady();
   try {
     await loadDeps();
```

**Корректность порядка** (риск §7.4): submit-handler'ы навешиваются в DOMContentLoaded **после**
`await loadDeps()` и **до** `markAuthReady()` (`:272 → :446`); ранний `preventDefault`-guard
навешивается раньше них и не мешает (preventDefault одного listener'а не блокирует другие). На
`loadDeps`-failure (`catch`) кнопки остаются disabled (юзер не логинится при сломанном модуле).

## 5. E2E прогон

Новый spec `e2e/student/whf2-fix-1-auth-guards.spec.js` (анон-контексты):
```
✓ B.no-precheck: логин НЕ дёргает /rpc/auth_email_exists
✓ F.early-click-noop-guard: клик/submit до ready не делает нативный сабмит, кнопка disabled
✓ F.disabled-during-load: все 3 submit-кнопки disabled до ready, enabled после
4 passed (44.8s)   # вкл. setup-student
```

Регресс (proof of no regression общего auth-механизма):
```
✓ whf1-hw-anon-redirect.spec.js (A1, A2)
✓ ws1-session-link.spec.js (A1, A2, A3)
6 passed (22.9s)
```

## 6. Скриншоты ручного smoke (§9.4)

Локальный `python3 -m http.server 8000`, автоматизировано (`reports/whf2_fix_1_smoke/smoke.cjs`):
```
(1) pre-ready: #loginSubmit disabled=true, #loginStatus="Загрузка..."
(2) login: auth_email_exists calls=0, left auth.html=true, dest=/, submit→nav=1.32s
```
- `reports/whf2_fix_1_smoke/1-pre-ready-disabled.png` — кнопка «Войти» disabled, «Загрузка...» в статусе.
- `reports/whf2_fix_1_smoke/2-no-precheck-on-login.png` — состояние после успешного логина (ушли с auth.html).

## 7. Latency observation

| | submit → navigation |
|---|---|
| WHF2 baseline (chromium repro, с precheck) | ~4.0с (вкл. `auth_email_exists` 1.2с + signIn 2.2с) |
| WHF2-fix-1 (smoke, без precheck) | **1.32с** |

Устранён лишний `auth_email_exists` round-trip (~1.2с) + console-error/warning 401 на каждый логин.
(Числа на разных прогонах/сети — качественное наблюдение, не строгий бенч.)

## 8. Cache-busting (§9.5)

```
tasks/auth.html → <meta name="app-build" content="2026-05-25-2"> ; <script ... src="auth.js?v=2026-05-25-2">
version.json    → {"build":"2026-05-25-2"}
tasks/auth.js   → импорты через buildWithV() (build читается из meta в рантайме; статичных ?v= нет)
```

## 9. Открытые follow-up

- **WHF2-fix-2 (A/E) — на паузе.** Переводить в активные ТОЛЬКО если после релиза WHF2-fix-1
  оператор получит iOS-репро (iPhone Safari private + Telegram in-app WebView через Mac Web
  Inspector, по сценарию `reports/whf2_diagnostic_report.md §3`) И симптом «вход не завершается»
  сохранится. Иначе закрыть как ✅ unnecessary.
- **§9.6 prod sanity (оператор)**: после push открыть прод `auth.html`, DevTools Network, один
  логин — глазами убедиться: нет `auth_email_exists`, время до редиректа субъективно меньше.
- **(опц.) WHF2-cleanup**: удалить orphan `authEmailExists` (`app/providers/supabase.js:443-449`)
  + orphan import-обёртку (`tasks/auth.js:38`), синхронизировать `runtime_rpc_registry.md`. Не
  red-zone после этой волны (вызовов нет). Открывать по запросу.
